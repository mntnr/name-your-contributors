#!/usr/bin/env node
'use strict'

const meow = require('meow')
const main = require('./index')

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
    o: 'org',
    u: 'user'
  }
})

const token = cli.flags.t || process.env.GITHUB_TOKEN

const after = cli.flags.a ? new Date(cli.flags.a) : new Date(0)
const before = cli.flags.b ? new Date(cli.flags.b) : new Date()

const debugMode = cli.flags.debug

if (!token) {
  console.error('A token is needed to access the GitHub API. Please provide one with -t or the GITHUB_TOKEN environment variable.')
  process.exit(1)
}

const formatReturn = x => {
  if (cli.flags.csv) {
    return main.toCSV(x)
  } else {
    return JSON.stringify(x, null, 2)
  }
}

const handleOut = console.log

const handleError = e => {
  console.error(e.stack)
  process.exit(1)
}

const callWithDefaults = (f, opts) => {
  opts.before = before
  opts.after = after
  opts.token = token
  opts.debug = debugMode

  return f(opts).then(formatReturn).then(handleOut).catch(handleError)
}

const fetchRepo = (user, repo) =>
      callWithDefaults(main.repoContributors, {user, repo})

if (cli.flags.o) {
  callWithDefaults(main.orgContributors, {orgName: cli.flags.o})
} else if (cli.flags.u && cli.flags.r) {
  fetchRepo(cli.flags.u, cli.flags.r)
} else if (cli.flags.r) {
  main.currentUser(token).then(user => fetchRepo(user, cli.flags.r))
} else if (cli.flags.u) {
  console.error('-u alone is not currently supported. Rate limits make it infeasible')
  // callWithDefaults(main.userContributors, {user: cli.flags.u})
} else {
  main.getCurrentRepoInfo().then(({user, repo}) => fetchRepo(user, repo))
}
