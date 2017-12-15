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
        .concat(edge('comments', {}, [authoredWithReactionsQ]))

  const reviewQ = edge('reviews', {}, [authoredQ])

  const prsQ = edge('pullRequests', {}, [
    participantsQ.concat(reviewQ)
  ])

  const issuesQ = edge('issues', {}, participantsQ)

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
const repository = (repoName, ownerName, before, after, commits) => {
  return node('repository', {name: repoName, owner: ownerName},
              repoSubQuery(before, after, commits))
}

const repositories = (before, after, commits) =>
      edge('repositories', {}, repoSubQuery(before, after, commits))

const orgRepos = (name, before, after, commits) =>
      node('organization', {login: name},
           [repositories(before, after, true, commits)])

const continuationQuery = ({
  id, parentType, childType, cursor, query, before, after
}) => {
  const a = after && after.toISOString()
  const b = before && before.toISOString()
  const args = {after: cursor, first: 100}
  if (childType === 'history') {
    args.since = a
    args.until = b
  }
  return node('node', {id})
    .addChild(node('id'))
    .addChild(node(`... on ${parentType}`)
              .addChild(node(childType, args)
                        .addChild(query)))
}

/// //
// Data Filtering (co-queries if you will)
/// //

// Yay globals. For one off script purposes this is fine, but if we're
// interleaving async calls to the main functions this will go awry.
let verboseCont = false

/** Recursive fetcher keeps grabbing the next page from the API until there are
  * none left. Returns the aggregate result of all fetches.
  */
const fetchAll = async ({
  token, acc, data, type, key, query, name, before, after
}) => {
  if (data[key].pageInfo.hasNextPage) {
    const next = await graphql.execute({
      token,
      name,
      verbose: verboseCont,
      query: continuationQuery({
        id: data.id,
        parentType: type,
        childType: key,
        cursor: data[key].pageInfo.endCursor,
        query,
        before,
        after
      })
    })

    return fetchAll({
      token,
      name,
      acc: acc.concat(next.node[key].nodes),
      data: next.node,
      type,
      key,
      query,
      before,
      after
    })
  } else {
    return acc
  }
}

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

const depaginateAll = async (parent, {
  token, acc, type, key, query, name, before, after
}) =>
      flatten(await Promise.all(parent.map(x => fetchAll({
        name,
        token,
        type,
        key,
        query,
        acc: acc(x),
        data: x,
        before,
        after
      }))))

const byCount = (a, b) => b.count - a.count

/** Parse repository query result and filter for date range. */
const depaginateResponse = async ({
  token, result, before, after, verbose, commits, reactions
}) => {
  verboseCont = verboseCont || verbose

  let commitsCont = []
  if (commits) {
    commitsCont = await fetchAll({
      token,
      name: 'commits cont',
      data: result.ref.target,
      acc: result.ref.target.history.nodes,
      type: 'Commit',
      key: 'history',
      query: commitHistoryQ,
      before,
      after
    })
  }

  const commitAuthors = Array.from(commitsCont).map(x => x.author)

  const prs = await fetchAll({
    token,
    name: 'prs cont',
    acc: result.pullRequests.nodes,
    data: result,
    type: 'Repository',
    key: 'pullRequests',
    query: prsContQ
  })

  const issues = await fetchAll({
    token,
    name: 'issues cont',
    acc: result.issues.nodes,
    data: result,
    type: 'Repository',
    key: 'issues',
    query: participantsQ
  })

  let commitComments = []
  if (commits) {
    commitComments = await fetchAll({
      token,
      name: 'commit comments cont',
      acc: result.commitComments.nodes,
      data: result,
      type: 'Repository',
      key: 'commitComments',
      query: authoredWithReactionsQ
    })
  }

  const reviews = await depaginateAll(prs, {
    token,
    name: 'reviews cont',
    acc: pr => pr.reviews.nodes,
    type: 'PullRequest',
    key: 'reviews',
    query: authoredQ
  })

  const prComments = await depaginateAll(prs, {
    token,
    name: 'pr comments cont',
    acc: pr => pr.comments.nodes,
    type: 'PullRequest',
    key: 'comments',
    query: authoredQ.addChild(reactorQ)
  })

  const issueComments = await depaginateAll(issues, {
    token,
    name: 'issue comments cont',
    acc: issue => issue.comments.nodes,
    type: 'Issue',
    key: 'comments',
    query: authoredQ.addChild(reactorQ)
  })

  let reactionsCont = []
  if (reactions) {
    reactionsCont = Array.from(await depaginateAll(commitComments, {
      token,
      name: 'reactions cont',
      acc: cc => cc.reactions.nodes,
      type: 'CommitComment',
      key: 'reactions',
      query: reactorSubQ
    })).concat(await depaginateAll(issueComments, {
      token,
      name: 'issue comment reactions cont',
      acc: ic => ic.reactions.nodes,
      type: 'IssueComment',
      key: 'reactions',
      query: reactorSubQ
    })).concat(await depaginateAll(prComments, {
      token,
      name: 'pr comment reactions cont',
      acc: prc => prc.reactions.nodes,
      type: 'IssueComment',
      key: 'reactions',
      query: reactorSubQ
    })).concat(await depaginateAll(issues, {
      token,
      name: 'issue reactions cont',
      acc: is => is.reactions.nodes,
      type: 'Issue',
      key: 'reactions',
      query: reactorSubQ
    })).concat(await depaginateAll(prs, {
      token,
      name: 'pullrequest reactions cont',
      acc: pr => pr.reactions.nodes,
      type: 'PullRequest',
      key: 'reactions',
      query: reactorSubQ
    }))
  }

  const response = {
    prs,
    prComments,
    issues,
    issueComments,
    reviews
  }

  if (commits) {
    response.commitAuthors = commitAuthors
    response.commitComments = commitComments
  }

  if (reactions) {
    response.reactions = reactionsCont
  }

  return response
}

const repoSynopsis =  ({
  prs, prComments, issues, issueComments, reviews, reactions, commitAuthors,
  commitComments, before, after
}) => {
  const tf = timeFilter(before, after)
  const process = x => mergeContributions(users(tf(x)))
        .sort(byCount)

  const processed = {
    prCreators: process(prs),
    prCommentators: process(prComments),
    issueCreators: process(issues),
    issueCommentators: process(issueComments),
    reviewers: process(reviews)
  }

  if (reactions) {
    processed.reactors = process(reactions)
  }

  if (commitAuthors) {
    processed.commitAuthors = mergeContributions(users(commitAuthors))
      .sort(byCount)
  }

  if (commitComments) {
    processed.commitCommentators = process(commitComments)
  }

  return processed
}

const cleanRepo = async ({
  token, result, before, after, verbose, commits, reactions
}) => {
  const res = await depaginateResponse({
    token, result, before, after, verbose, commits, reactions
  })

  res.before = before
  res.after = after

  return repoSynopsis(res)
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

const cleanOrgRepos = async ({
  token, result, before, after, verbose, commits, reactions
}) => {
  verboseCont = verboseCont || verbose

  const repos = await fetchAll({
    token,
    name: 'org repos cont',
    acc: result.organization.repositories.nodes,
    data: result.organization,
    type: 'Organization',
    key: 'repositories',
    query: repositoryCont(before, after, commits)
  })

  return mergeRepoResults(
    await Promise.all(repos.map(repo => {
      return cleanRepo({
        token,
        result: repo,
        commits,
        reactions,
        before,
        after,
        verbose
      })
    }))
  )
}

const cleanWhoAmI = x => x.viewer.login

module.exports = {
  whoAmI,
  cleanWhoAmI,
  repository,
  orgRepos,
  cleanOrgRepos,
  timeFilter,
  flatten,
  users,
  cleanRepo,
  mergeContributions,
  mergeArrays,
  mergeRepoResults,
  authoredQ
}
