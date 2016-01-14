'use strict'

const Octokat = require('octokat')
const octo = new Octokat({
  token: process.env.GITHUB_OGN_TOKEN
})
const Promise = require('bluebird')
const moment = require('moment')

module.exports = function (organization, opts) {
  opts = opts || {}

  return Promise.resolve().then(function () {
    // Get all organization repositories
    return octo.orgs(organization, 'repos').fetch()
  }).some(parseInt(1, 10)).map(function (result) {
    return octo.repos(organization, 'go-ipfs', 'commits').fetch({since: '2016-01-01T01:08:01-05:00'})
  }).then(function (response) {
    console.log(response[0].length)
  }).catch(function (err) {
    console.log('err', err)
  })
}
