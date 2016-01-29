#!/usr/bin/env node
'use strict'

const meow = require('meow')
const ghContrib = require('./')
const Promise = require('bluebird')
const gitconfig = require('gitconfiglocal')
const pify = require('pify')

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

Promise.try(() => {
  return pify(gitconfig)(process.cwd())
}).then(config => {
  if (config && config.remote && config.remote.origin && config.remote.origin.url) {
    return config.remote.origin.url.split(':')[1].split('.git')[0].split('/')
  }
}).then((res) => {
  if (res && cli.input.length === 0) {
    cli.input[0] = res[0]
    cli.flags['repo'] = res[1]
  }
  return ghContrib(cli.input[0], cli.flags)
}).map(function (response) {
  console.log(response)
})
