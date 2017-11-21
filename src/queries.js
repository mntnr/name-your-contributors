'use strict'

const graphql = require('./graphql')
const node = graphql.queryNode

/// //
// Queries
/// //

const whoAmI = node('viewer').addChild(node('login'))

const pagination = node('pageInfo')
      .addChild(node('endCursor'))
      .addChild(node('hasNextPage'))

const userInfo = node('user')
      .addChild(node('login'))
      .addChild(node('name'))
      .addChild(node('url'))

const reactorSubQ = node('nodes')
      .addChild(node('id'))
      .addChild(node('createdAt'))
      .addChild(userInfo)

const reactorQ = node('reactions', {first: 10})
      .addChild(pagination)
      .addChild(reactorSubQ)

const authoredQ = node('nodes')
      .addChild(node('id'))
      .addChild(node('author')
                .addChild(node('login'))
                .addChild(node('... on User')
                          .addChild(node('name'))
                          .addChild(node('url'))))
      .addChild(node('createdAt'))

const commitAuthorQ = node('author').addChild(userInfo)

const commitHistoryQ = node('nodes')
      .addChild(node('id'))
      .addChild(commitAuthorQ)

const commitQ = (before, after) => {
  const b = before.toISOString()
  const a = after.toISOString()
  return node('nodes')
    .addChild(node('id'))
    .addChild(node('target')
              .addChild(node('id'))
              .addChild(node('... on Commit')
                        .addChild(
                          node('history', {first: 100, since: a, until: b})
                            .addChild(pagination)
                            .addChild(commitHistoryQ))))
}

const refsQ = (before, after) => node('refs', {first: 100, refPrefix: 'refs/heads/'})
      .addChild(pagination)
      .addChild(commitQ(before, after))

const authoredWithReactionsQ = authoredQ
      .addChild(reactorQ)

const reviewQ = node('reviews', {first: 20})
      .addChild(pagination)
      .addChild(authoredQ)

const participantsQ = authoredWithReactionsQ
      .addChild(node('comments', {first: 50})
                .addChild(pagination)
                .addChild(authoredWithReactionsQ))

const prsContQ = participantsQ.addChild(reviewQ)

const prsQ = node('pullRequests', {first: 50})
      .addChild(pagination)
      .addChild(prsContQ)

const issuesQ = node('issues', {first: 50})
      .addChild(pagination)
      .addChild(participantsQ)

const commitCommentQ = node('commitComments', {first: 50})
      .addChild(pagination)
      .addChild(authoredWithReactionsQ)

/** Returns a query to retrieve all contributors to a repo */
const repository = (repoName, ownerName, before, after) =>
      node('repository', {name: repoName, owner: ownerName})
      .addChild(node('id'))
      .addChild(commitCommentQ)
      .addChild(refsQ(before, after))
      .addChild(prsQ)
      .addChild(issuesQ)

const repositoryCont = (before, after) =>
      node('nodes')
      .addChild(node('id'))
      .addChild(commitCommentQ)
      .addChild(refsQ(before, after))
      .addChild(prsQ)
      .addChild(issuesQ)

const repositories = (before, after) =>
      node('repositories', {first: 5})
      .addChild(pagination)
      .addChild(repositoryCont(before, after))

const orgRepos = (name, before, after) =>
      node('organization', {login: name})
      .addChild(node('id'))
      .addChild(repositories(before, after))

const userRepos = (login, before, after) =>
      node('user', {login})
      .addChild(node('id'))
      .addChild(repositories(before, after))

const continuationQuery = (id, parentType, childType, cursor, n, query) =>
      node('node', {id})
      .addChild(node('id'))
      .addChild(node(`... on ${parentType}`)
                .addChild(node(childType, {after: cursor, first: n})
                          .addChild(pagination)
                          .addChild(query)))

/// //
// Data Filtering (co-queries if you will)
/// //

// Yay globals. For one off script purposes this is fine, but if we're
// interleaving async calls to the main functions this will go awry.
let verboseCont = false

/** Recursive fetcher keeps grabbing the next page from the API until there are
  * none left. Returns the aggregate result of all fetches.
  */
const fetchAll = async ({token, acc, data, type, key, count, query, name}) => {
  if (data[key].pageInfo.hasNextPage) {
    const next = await graphql.executequery({
      token,
      name,
      verbose: verboseCont,
      query: continuationQuery(
        data.id, type, key, data[key].pageInfo.endCursor, count, query)
    })

    return fetchAll({
      token,
      name,
      acc: acc.concat(next.node[key].nodes),
      data: next.node,
      type,
      key,
      count,
      query
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

const depaginateAll = async (parent, {token, acc, type, key, query, name}) =>
      flatten(await Promise.all(parent.map(x => fetchAll({
        name,
        token,
        type,
        key,
        query,
        acc: acc(x),
        data: x,
        count: 50
      }))))

/** Parse repository query result and filter for date range. */
const cleanRepo = async (token, result, before, after, verbose) => {
  verboseCont = verbose
  const tf = timeFilter(before, after)
  const process = x => mergeContributions(users(tf(x)))

  const branches = await fetchAll({
    token,
    name: 'refs cont',
    acc: result.refs.nodes,
    data: result,
    type: 'Repository',
    key: 'refs',
    count: 100,
    query: commitQ(before, after)
  })

  const targets = Array.from(branches).map(b => b.target)

  const commits = await depaginateAll(targets, {
    token,
    name: 'commits cont',
    acc: ref => ref.history.nodes,
    type: 'Commit',
    key: 'history',
    query: commitHistoryQ
  })

  const commitAuthors = Array.from(commits).map(x => x.author)

  const prs = await fetchAll({
    token,
    name: 'prs cont',
    acc: result.pullRequests.nodes,
    data: result,
    type: 'Repository',
    key: 'pullRequests',
    count: 100,
    query: prsContQ
  })

  const issues = await fetchAll({
    token,
    name: 'issues cont',
    acc: result.issues.nodes,
    data: result,
    type: 'Repository',
    key: 'issues',
    count: 100,
    query: participantsQ
  })

  const commitComments = await fetchAll({
    token,
    name: 'commit comments cont',
    acc: result.commitComments.nodes,
    data: result,
    type: 'Repository',
    key: 'commitComments',
    count: 100,
    query: commitCommentQ
  })

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

  const reactions = Array.from(await depaginateAll(commitComments, {
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
    type: 'PullRequestComment',
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

  return {
    commitAuthors: mergeContributions(users(commitAuthors)),
    commitCommentators: process(commitComments),
    prCreators: process(prs),
    prCommentators: process(prComments),
    issueCreators: process(issues),
    issueCommentators: process(issueComments),
    reactors: process(reactions),
    reviewers: process(reviews)
  }
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

const cleanOrgRepos = async (token, result, before, after, verbose) => {
  verboseCont = verbose

  const repos = await fetchAll({
    token,
    name: 'org repos cont',
    acc: result.organization.repositories.nodes,
    data: result.organization,
    type: 'Organization',
    key: 'repositories',
    count: 20,
    query: repositoryCont(before, after)
  })

  return mergeRepoResults(
    await Promise.all(repos.map(repo => cleanRepo(token, repo, before, after))))
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
  authoredQ,
  userRepos,
  continuationQuery
}
