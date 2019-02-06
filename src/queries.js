'use strict'

const graphql = require('./graphql')
const node = graphql.queryNode
const noid = graphql.queryNoid
const edge = graphql.queryEdge
const val = graphql.queryLeaf
const typeSwitch = graphql.queryType

/// //
// Queries
/// //

const whoAmI = node('viewer', {}, ['login'])

const userFields = [
  val('login'),
  val('name'),
  val('email'),
  val('avatarUrl'),
  val('url')
]

const userInfo = node('user', {}, userFields)

const authoredQ = [
  typeSwitch('author', {}, [
    ['User', userFields],
    ['Bot', [
      val('login')
    ]]
  ]),
  val('createdAt')
]

const reactorQ = edge('reactions', {}, [
  userInfo,
  val('createdAt'),
  val('content')
])

const commitAuthorQ = noid('author', {}, [userInfo])

const issueBits = [
  val('title'),
  val('number'),
  val('state')
]

const epochTime = '1970-01-01T00:00:00.000Z' // new Date(0).toISOString()

const repoSubQuery = (before = new Date(), after, commits, reactionsInQuery) => {
  const b = before.toISOString()
  const a = after ? after.toISOString() : epochTime

  const masterCommits = node('ref', {qualifiedName: 'refs/heads/master'}, [
    typeSwitch('target', {}, [
      ['Commit', [
        edge('history', {since: a, until: b},
          [commitAuthorQ, val('committedDate')])
      ]]
    ])
  ])

  const authoredWithReactionsQ = reactionsInQuery
    ? authoredQ.concat(reactorQ)
    : authoredQ

  const participantsQ = authoredWithReactionsQ
    .concat(edge('comments', {}, authoredWithReactionsQ))

  const reviewQ = edge('reviews', {}, authoredQ
    .concat(edge('comments', {}, authoredWithReactionsQ)))

  const prsQ = edge('pullRequests', {},
    issueBits.concat(participantsQ.concat(reviewQ))
  )

  const issuesQ = edge('issues', {}, issueBits.concat(participantsQ))

  const commitCommentQ = edge('commitComments', {}, authoredWithReactionsQ)

  const children = [
    prsQ,
    issuesQ,
    commitCommentQ,
    val('homepageUrl'),
    val('name'),
    node('owner', {}, [val('login')])
  ]

  if (commits) {
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

/** Returns a query to retrieve all contributors to an org. */
const orgRepos = (name, before, after, commits, reactions) =>
  node('organization', {login: name}, [
    repositories(before, after, commits, reactions),
    val('name'),
    val('login'),
    val('email')
  ])

/// //
// Data Filtering (co-queries if you will)
/// //

/** Returns true iff obj.createdAt is between before and after. */
const within = (obj, before, after) => {
  const date = new Date(obj.createdAt)
  return after <= date && date <= before
}

/** Returns a function that when given an array of objects with createAt keys,
  * returns an array containing only those objects created between before and
  * after.
  */
const timeFilter = (before, after) =>
  data => data.filter(x => within(x, before, after))

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

/** Produces a synopsis (the canonical output of name-your-contributors) of
  * contributions to the given repo between before and after.
  */
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
    const commitAuthors = repo.ref
      ? repo.ref.target.history.nodes.map(x => x.author)
      : []
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

/** Walks repo query result and strips out entries not between before and after.
  */
const filterRepo = (json, before, after) => {
  const tf = timeFilter(before, after)
  const repo = json.repository
  const commentFilter = comments => comments.map(comment => {
    if (comment.reactions) {
      comment.reactions = tf(comment.reactions)
    }
    if (!comment.reactions || comment.reactions.length === 0) {
      if (!within(comment, before, after)) {
        return null
      }
    }
    return comment
  }).filter(x => x != null)

  const issues = repo.issues.map(issue => {
    const comments = commentFilter(issue.comments)

    if (comments.length === 0 && !within(issue, before, after)) {
      return null
    } else {
      issue.comments = comments
      return issue
    }
  }).filter(x => x != null)

  const prs = repo.pullRequests.map(pr => {
    const comments = commentFilter(pr.comments)
    const reviews = commentFilter(pr.reviews)

    if (comments.length === 0 &&
        reviews.length === 0 &&
        !within(pr, before, after)) {
      return null
    } else {
      pr.comments = comments
      pr.reviews = reviews
      return pr
    }
  }).filter(x => x != null)

  const commits = repo.ref
    ? repo.ref.target.history
    : []

  let commitComments = []
  if (repo.commitComments) {
    commitComments = commentFilter(repo.commitComments)
  }

  if (issues.length === 0 &&
      prs.length === 0 &&
      commits.length === 0 &&
      commitComments.length === 0) {
    return null
  }
  repo.issues = issues
  repo.pullRequests = prs

  if (repo.commitComments) {
    repo.commitcomments = commitComments
  }

  return json
}

/** Walks org return JSON and strips out entries not between before and after.
  */
const filterOrg = (json, before, after) => {
  const org = json.organization
  const repos = org.repositories.map(repo => {
    return filterRepo({repository: repo}, before, after)
  }).filter(x => x != null)
    .map(x => x.repository)
  json.organization.repositories = repos
  return json
}

/** Returns json with entires in in [before, after] stripped out. */
const timeFilterFullTree = (json, before, after) => {
  if (json.organization) {
    return filterOrg(json, before, after)
  } else {
    return filterRepo(json, before, after)
  }
}

const cleanWhoAmI = x => x.viewer.login

module.exports = {
  whoAmI,
  cleanWhoAmI,
  timeFilterFullTree,
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
