#!/usr/bin/env node
'use strict'
var meow = require('meow')
var ghContrib = require('./')
var Promise = require('bluebird')

const cli = meow([`
	Usage
	  $ name-your-contributors [org] [since]

	Examples
	  $ name-your-contributors ipfs 2016-01-15T00:20:24Z
	  [@RichardLitt](//github.com/RichardLitt) (Richard Littauer)
`])

Promise.try(function () {
  return ghContrib({
    org: cli.input[0],
    since: cli.input[1]
  })
}).map(function (response) {
  console.log(response)
})
