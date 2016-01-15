'use strict'

const Octokat = require('octokat')
const octo = new Octokat({
  token: process.env.GITHUB_OGN_TOKEN
})
const Promise = require('bluebird')
const moment = require('moment')
const _ = require('lodash')

module.exports = function (organization, opts) {
  opts = opts || {
    org: 'ipfs',
    repo: 'go-ipfs'
  }

  function loadAllPages (arr, callFx, opts) {
    opts['page'] = opts.page || 1
    return Promise.try(function () {
      return callFx(opts)
    }).then(function (result) {
      arr.push(result)
      if (_.isFunction(result.nextPage)) {
        // console.log(opts.page, result.nextPage)
        opts.page = opts.page + 1
        return loadAllPages(arr, callFx, opts)
      } else {
        return Promise.resolve(_.flatten(arr))
      }
    }).catch(function (err) {
      if (err)
        console.log('Failed to get next pages')
    })
  }

  return Promise.try(function () {
    return octo.orgs(opts.org).repos.fetch()
  }).map(function (repo) {
    const allBranches = []
    return loadAllPages(allBranches, function (opts) {
      return octo.repos(opts.org, opts.repo).branches.fetch({
        per_page: 100,
        page: opts.page
      })
    }, {
      org: opts.org,
      repo: repo.name
    })
  }).map(function (response) {
    // Here. I want to have access to the repo.name I used in the last call.
    console.log('response', response)
  //   const allCommits = []
  //   return loadAllPages(allCommits, function (opts) {
  //       return octo.repos(opts.org, opts.repo, 'commits').fetch({
  //           since: opts.since,
  //           page: opts.page,
  //           per_page: 100,
  //           sha: opts.sha
  //       })
  //     }, {
  //       org: opts.org,
  //       repo: repoName,
  //       sha: response.commit.sha,
  //       since: '2016-01-11T00:01:01Z'
  //     })
  // }).then(function (response) {
  //   return _.uniq(_.map(_.flatten(response), function (commit) {
  //     return `[@${commit.author.login}](//github.com/${commit.author.login}) (${commit.commit.author.name})`
  //   }))
  // }).each(function (contributors) {
  //   console.log(contributors)
  }).catch(function (err) {
    console.log('err', err)
  })
}
