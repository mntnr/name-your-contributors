'use strict'

const graphql = require('./graphql')
const node = graphql.queryNode

/// //
// Queries
/// //

const pagination = node('pageInfo')
      .addChild(node('endCursor'))
      .addChild(node('hasNextPage'))

const reactorQ = node('reactions', {first: 10})
      .addChild(pagination)
      .addChild(node('nodes')
                .addChild(node('createdAt'))
                .addChild(node('user')
                          .addChild(node('login'))
                          .addChild(node('name'))
                          .addChild(node('url'))))

const authoredQ = node('nodes')
      .addChild(node('id'))
      .addChild(node('author')
                .addChild(node('login'))
                .addChild(node('... on User')
                          .addChild(node('name'))
                          .addChild(node('url'))))
      .addChild(node('createdAt'))

const authoredWithReactionsQ = authoredQ
      .addChild(reactorQ)

const reviewQ = node('reviews', {first: 20})
      .addChild(pagination)
      .addChild(authoredQ)

const participantsQ = authoredWithReactionsQ
      .addChild(node('comments', {first: 100})
                .addChild(pagination)
                .addChild(authoredWithReactionsQ))

const prsQ = node('pullRequests', {first: 100})
      .addChild(pagination)
      .addChild(participantsQ
                .addChild(reviewQ))

const issuesQ = node('issues', {first: 100})
      .addChild(pagination)
      .addChild(participantsQ)

const commitCommentQ = node('commitComments', {first: 100})
      .addChild(pagination)
      .addChild(authoredQ)

/** Returns a query to retrieve all contributors to a repo */
const repository = (repoName, ownerName) =>
      node('repository', {name: repoName, owner: ownerName})
      .addChild(node('id'))
      .addChild(commitCommentQ)
      .addChild(prsQ)
      .addChild(issuesQ)

/** Returns a query which retrieves names of all repos from an organisation. */
const organization = name =>
      node('organization', {login: name})
      .addChild(node('id'))
      .addChild(node('repositories', {first: 100}, pagination)
                .addChild(node('nodes')
                          .addChild(node('name'))))

const orgRepos = name =>
      node('organization', {login: name})
      .addChild(node('id'))
      .addChild(node('repositories', {first: 25})
                .addChild(pagination)
                .addChild(node('nodes')
                          .addChild(node('id'))
                          .addChild(prsQ)
                          .addChild(issuesQ)))

const userRepos = login =>
      node('user', {login})
      .addChild(node('id'))
      .addChild(node('repositories', {first: 100})
                .addChild(pagination)
                .addChild(node('nodes').addChild(node('name'))))

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

/** Recursive fetcher keeps grabbing the next page from the API until there are
  * none left. Returns the aggregate result of all fetches.
  */
const fetchAll = async ({token, acc, data, type, key, count, query}) => {
  if (data[key].pageInfo.hasNextPage) {
    const next = await graphql.executequery(
      token, continuationQuery(
        data.id, type, key, data[key].pageInfo.endCursor, count, query))

    return fetchAll({
      token,
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
const timeFilter = (before = new Date(), after = new Date(0)) =>
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

const cleanUserRepos = async (token, x) => {
  const repos = await fetchAll({
    token,
    acc: x.user.repositories.nodes,
    data: x.user,
    type: 'User',
    key: 'repositories',
    count: 100,
    query: node('nodes').addChild(node('name'))
  })

  return repos.map(x => x.name)
}

const depaginateAll = async (parent, {token, acc, type, key, query}) =>
      flatten(await Promise.all(parent.map(x => fetchAll({
        token,
        type,
        key,
        query,
        acc: acc(x),
        data: x,
        count: 100
      }))))

/** Parse repository query result and filter for date range. */
const cleanRepo = async (token, result, before, after) => {
  const tf = timeFilter(before, after)
  const process = x => mergeContributions(users(tf(x)))

  const prs = await fetchAll({
    token,
    acc: result.pullRequests.nodes,
    data: result,
    type: 'Repository',
    key: 'pullRequests',
    count: 100,
    query: participantsQ
  })

  const issues = await fetchAll({
    token,
    acc: result.issues.nodes,
    data: result,
    type: 'Repository',
    key: 'issues',
    count: 100,
    query: participantsQ
  })

  const commitComments = await fetchAll({
    token,
    acc: result.commitComments.nodes,
    data: result,
    type: 'Repository',
    key: 'commitComments',
    count: 100,
    query: commitCommentQ
  })

  const reviews = await depaginateAll(prs, {
    token,
    acc: pr => pr.reviews.nodes,
    type: 'PullRequest',
    key: 'reviews',
    query: authoredQ
  })

  const prComments = await depaginateAll(prs, {
    token,
    acc: pr => pr.comments.nodes,
    type: 'PullRequest',
    key: 'comments',
    query: authoredQ.addChild(reactorQ)
  })

  const issueComments = await depaginateAll(issues, {
    token,
    acc: issue => issue.comments.nodes,
    type: 'Issue',
    key: 'comments',
    query: authoredQ.addChild(reactorQ)
  })

  const reactions = Array.from(await depaginateAll(commitComments, {
    token,
    acc: cc => cc.reactions.nodes,
    type: 'CommitComment',
    key: 'reactions',
    query: reactorQ
  })).concat(await depaginateAll(issueComments, {
    token,
    acc: ic => ic.reactions.nodes,
    type: 'IssueComment',
    key: 'reactions',
    query: reactorQ
  })).concat(await depaginateAll(prComments, {
    token,
    acc: prc => prc.reactions.nodes,
    type: 'PullRequestComment',
    key: 'reactions',
    query: reactorQ
  })).concat(await depaginateAll(issues, {
    token,
    acc: is => is.reactions.nodes,
    type: 'Issue',
    key: 'reactions',
    query: participantsQ
  })).concat(await depaginateAll(prs, {
    token,
    acc: pr => pr.reactions.nodes,
    type: 'PullRequest',
    key: 'reactions',
    query: participantsQ
  }))

  return {
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

const cleanOrgRepos = async (token, result, before, after) => {
  const repos = await fetchAll({
    token,
    acc: result.organization.repositories.nodes,
    data: result.organization,
    type: 'Organization',
    key: 'repositories',
    count: 25,
    query: node('nodes').addChild(node('id')).addChild(prsQ).addChild(issuesQ)
  })

  return mergeRepoResults(
    await Promise.all(repos.map(repo => cleanRepo(token, repo, before, after))))
}

module.exports = {
  repository,
  organization,
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
  cleanUserRepos,
  continuationQuery
}
