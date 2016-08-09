'use strict'

const fs = require('fs')
const _ = require('lodash')
const depaginate = require('depaginate')
const formatGhUsers = require('format-gh-users')
const getGithubUser = require('get-github-user')
const moment = require('moment')
const Octokat = require('octokat')
const Promise = require('bluebird')
const sortAlphabetic = require('sort-alphabetic')
let octo

function getRepositories (org, opts, token) {
  octo = new Octokat({
    token: token || process.env.GITHUB_OGN_TOKEN
  })

  if (opts.since && !moment(opts.since).isValid()) {
    throw new Error('\'since\' flag is an invalid date.')
  }

  if (opts.until && !moment(opts.until).isValid()) {
    throw new Error('\'until\' flag is an invalid date.')
  }

  return getGithubUser(org)
    .then((user) => {
      if (user.length === 0) {
        throw new Error(org + 'is not a valid GitHub user')
      } else {
        return user
      }
    })
    .then((user) => depaginate((opts) => {
      if (opts.org.type === 'Organization') {
        return octo.orgs(org).repos.fetch(opts)
      }
      return octo.users(org).repos.fetch(opts)

      }, {
        org: user
      }))
    .then(_.flatten.bind(_))
    .filter((resp) => (opts.repo) ? resp.name === opts.repo : resp)
    .catch((err) => {
      console.log('Unable to get repositories', err)
    })
}

function filterResponses (response, opts) {
  return Promise.resolve(response)
    // Make sure that the responses are in the specified time frame
    .filter((response) => {
      if (opts.since && opts.until && moment(response.updatedAt).isBetween(opts.since, opts.until)) {
        return response
      } else if (opts.since && !opts.until && moment(response.updatedAt).isAfter(opts.since)) {
        return response
      } else if (!opts.since && opts.until && moment(response.updatedAt).isBefore(opts.until)) {
        return response
      } else if (!opts.since && !opts.until) {
        return response
      }
    })
    // Make sure that the user is a logical user
    .map((response) => {
      if (response.user && response.user.login) {
        return response.user.login
      }
    })
    .then(response => sortAlphabetic(_.uniq(_.without(response, undefined))))
}

function getIssueCreators (response, org, opts) {
  return Promise.resolve(response)
    .map((repo) => depaginate((opts) => {
      return octo.repos(opts.org, opts.repoName).issues.fetch(opts)
    }, {
      org: org,
      repoName: repo.name,
      since: opts.since || '1980-01-01T00:01:01Z'
    }))
  .then(_.flatten.bind(_))
  .catch((err) => {
    console.log('Unable to get issue creators', err)
  })
}


function getIssueCommenters (response, org, opts) {
  return Promise.resolve().then(() => response)
  .map((repo) => {
    return depaginate(function (opts) {
      return octo.repos(opts.org, opts.repoName).issues.comments.fetch(opts)
    }, {
      org: org,
      repoName: repo.name,
      since: opts.since || '1980-01-01T00:01:01Z'
    })
  })
  .then(_.flatten.bind(_))
  .catch(function (err) {
    console.log('Unable to get issue commenters', err)
  })
}

function getPRCreators (response, org, opts) {
  return Promise.resolve(response)
    .map((repo) => depaginate((opts) => {
        return octo.repos(opts.org, opts.repoName).pulls.fetch(opts)
      }, {
        org: org,
        repoName: repo.name,
        // Weird issue with since being mandatory. TODO Check?
        since: opts.since || '2000-01-01T00:01:01Z',
        state: 'all'
      }))
    .then(_.flatten.bind(_))
    .catch((err) => {
      console.log('Unable to get pull requesters', err)
    })
}

function getPRReviewers (response, org, opts) {
  return Promise.resolve(response)
    .map((repo) => depaginate((opts) => {
        return octo.repos(opts.org, opts.repoName).pulls.comments.fetch(opts)
      }, {
        org: org,
        repoName: repo.name,
        // Weird issue with since being mandatory. TODO Check?
        since: opts.since || '1980-01-01T00:01:01Z',
        per_page: 100
      }))
    .then(_.flatten.bind(_))
    .catch((err) => {
      console.log('Unable to get code reviewers', err)
    })
}

function getCommenters (response, org, opts) {
  return Promise.resolve(response)
    .map((repo) => depaginate((opts) => {
        return octo.repos(opts.org, opts.repoName).comments.fetch(opts)
      }, {
        org: org,
        repoName: repo.name,
        // Weird issue with since being mandatory. TODO Check?
        since: opts.since || '1980-01-01T00:01:01Z',
        per_page: 100
      }))
    .then(_.flatten.bind(_))
    .catch((err) => {
      console.log('Unable to get code reviewers', err)
    })
}

module.exports = function (org, opts, token) {
  return getRepositories(org, opts, token)
    .then((response) => {
      console.log('got response')

      return collect(
        getIssueCreators(response, org, opts),
        'issue_creators'
      )
        .then(() => {
          return collect(
            getIssueCommenters(response, org, opts),
            'issue_commenters'
          )
        })
        .then(() => {
          return collect(
            getPRCreators(response, org, opts),
            'pr_creators'
          )
        })
        .then(() => {
          return collect(
            getPRReviewers(response, org, opts),
            'pr_reviewers'
          )
        })
        .then(() => {
          return collect(
            getCommenters(response, org, opts),
            'commenters'
          )
        })
    })
    .then(() => {
      console.log('done')
    })
    // .map((res) => filterResponses(res, opts))
    // .then((users) => formatGhUsers(users))
    // .then((res) => _.union(res))
}

const writeFile = Promise.promisify(fs.writeFile)

function collect (val, name) {
  return val
    .then((res) => {
      return writeFile(`./results/${name}.json`, JSON.stringify(res, null, 2))
    })
    .then(() => {
      console.log('wrote %s', name)
    })
}
