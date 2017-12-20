'use strict'

const graphql = require('./graphql')
const node = graphql.queryNode
const noid = graphql.queryNoid
const edge = graphql.queryEdge
const val = graphql.queryLeaf
const typedNode = graphql.queryType

/// //
// Queries
/// //

const whoAmI = node('viewer', {}, ['login'])

const userInfo = node('user', {}, [
  val('login'),
  val('name'),
  val('url')
])

const authoredQ = [
  typedNode('author', 'User', {}, [
    val('login'),
    val('name'),
    val('url')
  ]),
  val('createdAt')
]

const reactorQ = edge('reactions', {}, [userInfo, val('createdAt')])

const commitAuthorQ = noid('author', {}, [userInfo])

const issueBits = [
  val('title'),
  val('number'),
  val('state')
]

const repoSubQuery = (before, after, commits, reactionsInQuery) => {
  const b = before.toISOString()
  const a = after.toISOString()

  const masterCommits = node('ref', {qualifiedName: 'refs/heads/master'}, [
    typedNode('target', 'Commit', {}, [
      edge('history', {since: a, until: b}, [commitAuthorQ], true)
    ])
  ])

  const authoredWithReactionsQ = reactionsInQuery
        ? authoredQ.concat(reactorQ)
        : authoredQ

  const participantsQ = authoredWithReactionsQ
        .concat(edge('comments', {}, authoredWithReactionsQ))

  const reviewQ = edge('reviews', {}, authoredQ)

  const prsQ = edge('pullRequests', {},
    issueBits.concat(participantsQ.concat(reviewQ))
  )

  const issuesQ = edge('issues', {}, issueBits.concat(participantsQ))

  const commitCommentQ = edge('commitComments', {}, [
    authoredWithReactionsQ
  ])

  const children = [prsQ, issuesQ]

  if (commits) {
    children.push(commitCommentQ)
    children.push(masterCommits)
  }
  return children
}

/** Returns a query to retrieve all contributors to a repo */
const repository = (repoName, ownerName, before, after, commits, reactions) =>
      node('repository', {name: repoName, owner: ownerName},
           repoSubQuery(before, after, commits, reactions))

const repositories = (before, after, commits, reactions) =>
      edge('repositories', {}, repoSubQuery(before, after, commits, reactions))

const orgRepos = (name, before, after, commits, reactions) =>
      node('organization', {login: name},
           [repositories(before, after, commits, reactions)])

/// //
// Data Filtering (co-queries if you will)
/// //

/** Returns a function that when given an array of objects with createAt keys,
  * returns an array containing only those objects created between before and
  * after.
  */
const timeFilter = (before, after) =>
      data => data.filter(x => {
        const date = new Date(x.createdAt)
        return after <= date && date <= before
      })

const users = arr =>
      arr.map(x => x.author || x.user)
      // Get rid of null authors (deleted accounts)
      .filter(x => !(x == null))
      .map(x => {
        x.count = 1
        return x
      })

/** Returns an array which is the concatenation of arrays in the passed in
  * array.
  */
const flatten = arr => arr.reduce((acc, next) => acc.concat(next), [])

/** Given an array of arrays of length 2, returns an array of pairs where each
  * first element occurs at most once.
  */
const mergeContributions = xs => {
  const m = new Map()
  for (let x of xs) {
    // Use GitHub login as unique key.
    let key = x.login
    if (m.has(key)) {
      m.get(key).count += x.count
    } else {
      m.set(key, {
        // Poor man's clone
        login: x.login,
        name: x.name,
        url: x.url,
        count: x.count
      })
    }
  }
  return Array.from(m.values())
}

const byCount = (a, b) => b.count - a.count

const repoSynopsis = ({json, before, after, commits, reactions}) => {
  const tf = timeFilter(before, after)
  const process = x => mergeContributions(users(tf(x)))
        .sort(byCount)

  const repo = json.repository

  const prs = json.repository.pullRequests.nodes
  const prComments = flatten(prs.map(p => p.comments.nodes))
  const reviews = flatten(prs.map(p => p.reviews.nodes))

  const issues = repo.issues.nodes
  const issueComments = flatten(issues.map(i => i.comments.nodes))

  const processed = {
    prCreators: process(prs),
    prCommentators: process(prComments),
    issueCreators: process(issues),
    issueCommentators: process(issueComments),
    reviewers: process(reviews)
  }

  if (reactions) {
    const reactors = flatten(issueComments.map(c => c.reactions.nodes).concat(
      prComments.map(c => c.reactions.nodes)
    ))

    processed.reactors = process(reactors)
  }

  if (commits) {
    const commitAuthors = repo.ref.target.history.nodes.map(x => x.author)
    const commitComments = repo.commitComments.nodes
    processed.commitAuthors = mergeContributions(users(commitAuthors))
      .sort(byCount)
    processed.commitCommentators = process(commitComments)
  }

  return processed
}

const mergeArrays = (a, b) =>
      mergeContributions(a.concat(b))

/** Recursively merges all contributor maps in the list into a single map */
const mergeRepoResults = repos =>
      repos.reduce((acc, obj) => {
        const ret = {}
        for (let key in obj) {
          ret[key] = mergeArrays(obj[key], acc[key] || [])
        }
        return ret
      })

const orgSynopsis = ({
  json, before, after, commits, reactions
}) => {
  const repos = json.organization.repositories.nodes

  return mergeRepoResults(
    repos.map(repo => {
      return repoSynopsis({
        json: {repository: repo},
        commits,
        reactions,
        before,
        after
      })
    }))
}

const cleanWhoAmI = x => x.viewer.login

module.exports = {
  whoAmI,
  cleanWhoAmI,
  repository,
  orgRepos,
  orgSynopsis,
  timeFilter,
  flatten,
  users,
  repoSynopsis,
  mergeContributions,
  mergeArrays,
  mergeRepoResults,
  authoredQ
}
