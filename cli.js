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

  Options
    -s, --since Add a time since
    -u, --until Add a time to
    -r, --repo A repository to search

  Examples
    $ name-your-contributors ipfs --since=2016-01-15T00:20:24Z --until=2016-01-20T00:20:24Z
    [@RichardLitt](//github.com/RichardLitt) (Richard Littauer)
`, {
  alias: {
    s: 'since',
    u: 'until',
    r: 'repo'
  }
}])

Promise.try(() => {
  if (cli.input.length === 0) {
    return Promise.try(() => {
      return pify(gitconfig)(process.cwd())
    }).then((config) => {
      if (config && config.remote && config.remote.origin && config.remote.origin.url) {
        return config.remote.origin.url.split(':')[1].split('.git')[0].split('/')
      }
    })
  } else {
    return
  }
}).then((res) => {
  if (res) {
    cli.input[0] = res[0]
    cli.flags['repo'] = res[1]
  }

  // Couldn't figure out minimist to make this work.
  if (cli.flags.from) {
    cli.flags.since = cli.flags.from
  }
  if (cli.flags.to) {
    cli.flags.until = cli.flags.to
  }

  return ghContrib(cli.input[0], cli.flags)
}).each(function (response) {
  console.log(response)
})
