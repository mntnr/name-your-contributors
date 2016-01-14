'use strict'

const Octokat = require('octokat')
const octo = new Octokat({
  token: process.env.GITHUB_OGN_TOKEN
})
const Promise = require('bluebird')
const moment = require('moment')
const _ = require('lodash')

module.exports = function (organization, opts) {
  opts = opts || {}

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
    const allBranches = []
    return loadAllPages(allBranches, function (opts) {
      return octo.repos(opts.org, opts.repo).branches.fetch({
        per_page: 100,
        page: opts.page
      })
    }, {
      org: 'ipfs',
      repo: 'go-ipfs'
    })
  }).map(function (response) {
    return octo.repos('ipfs', 'go-ipfs', 'commits').fetch({
      sha: response.commit.sha,
      since: '2015-01-11T01:08:01Z'
    })
    // const allCommits = []
    // return loadAllPages(allCommits, function (opts) {
    //     return octo.repos(opts.org, opts.repo, 'commits').fetch({
    //         since: opts.since,
    //         page: opts.page,
    //         per_page: 100,
    //         sha: opts.sha
    //     })
    //   }, {
    //     org: 'ipfs',
    //     repo: 'go-ipfs',
    //     sha: response.commit.sha,
    //     since: '2015-01-01T01:08:01Z'
    //   })
  }).then(function (response) {
    console.log(response)
  }).catch(function (err) {
    console.log('err', err)
  })
}
