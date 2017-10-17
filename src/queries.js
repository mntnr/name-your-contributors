'use strict'

const graphql = require('./graphql')
const node = graphql.queryNode

/// //
// Queries
/// //

const pagination = node('pageInfo')
      .addChild(node('endCursor'))
      .addChild(node('hasNextPage'))

const authoredQ = node('nodes')
      .addChild(node('id'))
      .addChild(node('author')
                .addChild(node('login'))
                .addChild(node('... on User')
                          .addChild(node('name'))
                          .addChild(node('url'))))
      .addChild(node('createdAt'))

const participantsQ = authoredQ
      .addChild(node('comments', {first: 100})
                .addChild(pagination)
                .addChild(authoredQ))

const prsQ = node('pullRequests', {first: 100})
      .addChild(pagination)
      .addChild(participantsQ)

const issuesQ = node('issues', {first: 100})
      .addChild(pagination)
      .addChild(participantsQ)

/** Returns a query to retrieve all contributors to a repo */
const repository = (repoName, ownerName) =>
      node('repository', {name: repoName, owner: ownerName})
      .addChild(node('id'))
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
      arr.map(x => x.author)
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
      m.set(key, x)
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

  const prCs = flatten(await Promise.all(prs.map(pr => fetchAll({
    token,
    acc: pr.comments.nodes,
    data: pr,
    type: 'PullRequest',
    key: 'comments',
    count: 100,
    query: authoredQ
  }))))

  const issueCs = flatten(await Promise.all(issues.map(issue => fetchAll({
    token,
    acc: issue.comments.nodes,
    data: issue,
    type: 'Issue',
    key: 'comments',
    count: 100,
    query: authoredQ
  }))))

  return {
    prCreators: process(prs),
    prCommentators: process(prCs),
    issueCreators: process(issues),
    issueCommentators: process(issueCs)
  }
}

const mergeArrays = (a, b) =>
      mergeContributions(a.concat(b))

/** Recursively merges all contributor maps in the list into a single map */
const mergeRepoResults = repos =>
      repos.reduce((
        acc, {
          prCreators,
          prCommentators,
          issueCreators,
          issueCommentators
        }
      ) => {
        return {
          prCreators: mergeArrays(acc.prCreators, prCreators),
          prCommentators: mergeArrays(acc.prCommentators, prCommentators),
          issueCreators: mergeArrays(acc.issueCreators, issueCreators),
          issueCommentators: mergeArrays(acc.issueCommentators, issueCommentators)
        }
      }, {
        prCreators: [],
        prCommentators: [],
        issueCreators: [],
        issueCommentators: []
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
  mergeRepoResults,
  authoredQ,
  userRepos,
  cleanUserRepos,
  continuationQuery
}
