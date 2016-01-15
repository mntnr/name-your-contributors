'use strict'

const Octokat = require('octokat')
const octo = new Octokat({
  token: process.env.GITHUB_OGN_TOKEN
})
const Promise = require('bluebird')
const _ = require('lodash')
const getCodeReviewers = require('get-code-reviewers')
const getIssueCommenters = require('get-issue-commenters')
const getCommitters = require('get-committers')

module.exports = function (organization, opts) {
  Promise.join(
    getCodeReviewers(opts),
    getIssueCommenters(opts),
    getCommitters(opts),
    function (reviewers, commenters, committers) {
      var union = _.union(reviewers, commenters, committers)
      return union
    }
  ).map(function (response) {
    console.log(`[@${commit.author.login}](//github.com/${commit.author.login}) (${commit.commit.author.name})`)
  })
}
