#!/usr/bin/env node
'use strict'

const meow = require('meow')
const csv = require('csv-writer').createArrayCsvStringifier
const main = require('./index')

const flatten = json => {
  const prs = json.prCreators.map(x => ['pr creator'].concat(x))
  const prcs = json.prCommentators.map(x => ['pr commentator'].concat(x))
  const is = json.issueCreators.map(x => ['issue creator'].concat(x))
  const iscs = json.issueCommentators.map(x => ['issue commentator'].concat(x))

  return prs.concat(prcs).concat(is).concat(iscs)
}

const toCSV = json => {
  const writer = csv({
    header: ['TYPE', 'LOGIN', 'NAME']
  })
  return writer.getHeaderString() +
    writer.stringifyRecords(flatten(json))
}

const cli = meow([`
  Usage
    $ name-your-contributors <input> [opts]

  Options
    -a, --after  - Get contributions after date
    -b, --before - Get contributions before data
    -c, --csv    - Output data in CSV format
    -o, --org    - Search all repos within this organisation
    -r, --repo   - Repository to search
    -t, --token  - GitHub auth token to use
    -u, --user   - User to which repository belongs

  Authentication
    This script looks for an auth token in the env var GITHUB_TOKEN. Make sure
    this var is set to a valid GitHub oauth token. To create one see:
    https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/
  Examples
    $ name-your-contributors -r ipfs -u ipfs --after=2016-01-15T00:20:24Z --before=2016-01-20T00:20:24Z

    $ name-your-contributors -o ipfs -a 2017-01-01 > ipfs-contrib-2017.json
`], {
  alias: {
    a: 'after',
    b: 'before',
    c: 'csv',
    r: 'repo',
    t: 'token',
    u: 'user'
  }
})

const token = cli.flags.t || process.env.GITHUB_TOKEN

const after = cli.flags.a ? new Date(cli.flags.a) : new Date(0)
const before = cli.flags.b ? new Date(cli.flags.b) : new Date()

const debugMode = cli.flags.debug

if (cli.flags.o && token) {
  main.orgContributors({
    debug: debugMode,
    token: token,
    orgName: cli.flags.o,
    before: before,
    after: after
  }).then(json => JSON.stringify(json, null, 2))
    .then(console.log)
    .catch(e => console.error(e.message))
} else if (cli.flags.u && cli.flags.r && token) {
  main.repoContributors({
    debug: debugMode,
    token: token,
    user: cli.flags.u,
    repo: cli.flags.r,
    before: before,
    after: after
  }).then(x => {
    if (cli.flags.csv) {
      return toCSV(x)
    } else {
      return JSON.stringify(x, null, 2)
    }
  }).then(console.log)
    .catch(e => {
      console.error(e.stack)
    })
} else {
  console.error('You must currently specify both a user and a repo name. And provide a token.')
  process.exit(1)
}
