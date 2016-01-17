#!/usr/bin/env node
'use strict'
var meow = require('meow')
var ghContrib = require('./')
var Promise = require('bluebird')

const cli = meow([`
	Usage
	  $ name-your-contributors <input> [opts]

	Examples
	  $ name-your-contributors ipfs --since=2016-01-15T00:20:24Z
	  [@RichardLitt](//github.com/RichardLitt) (Richard Littauer)
`, {
  alias: {
    s: 'since'
  }
}])

Promise.try(function () {
  return ghContrib(cli.input[0], cli.flags)
}).map(function (response) {
  console.log(response)
})
