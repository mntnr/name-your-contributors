'use strict'

const Promise = require('bluebird')
const _ = require('lodash')
const getCodeReviewers = require('get-code-reviewers')
const getIssueCommenters = require('get-issue-commenters')
const getIssueCreators = require('get-github-issue-creators')
const getGithubUser = require('get-github-user')
const sortAlphabetically = require('sort-alphabetic')

module.exports = function (org, opts) {
  return Promise.join(
    getCodeReviewers(org, opts),
    getIssueCommenters(org, opts),
    getIssueCreators(org, opts),
    function (reviewers, commenters, creators) {
      var union = _.union(reviewers, commenters, creators)
      return union
    }
  ).map(user => getGithubUser(user))
  .then(_.flatten.bind(_))
  .map((user) => {
    var str = '[@' + user.login + '](//github.com/' + user.login + ')'
    if (user.name)
      str += ' (' + user.name + ')'
    return str
  }).then(arr => sortAlphabetically(arr))
}
