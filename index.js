'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const getCodeReviewers = require('get-code-reviewers')
const getIssueCommenters = require('get-issue-commenters')
const getIssueCreators = require('get-github-issue-creators')
const getPRCreators = require('get-github-pr-creators')
const formatGhUsers = require('format-gh-users')

module.exports = function (org, opts) {
  return Promise.join(
    getCodeReviewers(org, opts),
    getIssueCommenters(org, opts),
    getIssueCreators(org, opts),
    getPRCreators(org, opts),
    function (reviewers, commenters, creators, pullRequesters) {
      var union = _.union(reviewers, commenters, creators, pullRequesters)
      return union
    }
  ).then((users) => formatGhUsers(users))
}
