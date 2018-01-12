#!/usr/bin/env node
'use strict'

const meow = require('meow')
const main = require('./index')
const done = require('./graphql').done
const cache = require('./graphql').cache

const cli = meow([`
  Usage
    $ name-your-contributors <input> [opts]

  Options
    -t, --token   - GitHub auth token to use
    -a, --after   - Get contributions after date
    -b, --before  - Get contributions before data

    -o, --org     - Search all repos within this organisation
    -r, --repo    - Repository to search
    -u, --user    - User to which repository belongs
    -c, --config  - Operate from config file. In this mode only token, verbose, and
                    debug flags apply.

    --full        - Returns the full tree of contributions rather than the default
                    synopsis.
    --csv         - Output data in CSV format

    --commits     - Get commit authors and comments from GitHub
    --local-dir   - If specified, this script will look for repos being queried in
                    the provided dir and read the commit log from them directly.
    --reactions   - Query reactions of comments as well.

    --wipe-cache  - Wipe local cache before starting query.

    -v, --verbose - Enable verbose logging
    --debug       - Enable extremely verbose logging
    --dry-run     - Check the cost of the query without executing it.

  Authentication
    This script looks for an auth token in the env var GITHUB_TOKEN. Make sure
    this var is set to a valid GitHub oauth token. To create one see:
    https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/
  Examples
    $ name-your-contributors -r ipfs -u ipfs --after=2016-01-15T00:20:24Z --before=2016-01-20T00:20:24Z

    $ name-your-contributors -o ipfs -a 2017-01-01 > ipfs-contrib-2017.json

    $ name-your-contributors --config config.json > combined-out.json
`], {
  alias: {
    a: 'after',
    b: 'before',
    c: 'config',
    r: 'repo',
    t: 'token',
    o: 'org',
    u: 'user',
    v: 'verbose'
  }
})

const token = cli.flags.t || process.env.GITHUB_TOKEN

const after = cli.flags.a ? new Date(cli.flags.a) : new Date(0)
const before = cli.flags.b ? new Date(cli.flags.b) : new Date()

if (cli.flags.wipeCache) {
  if (cli.flags.v) {
    console.log('Wiping cache')
  }
  for (const key of cache.keysSync()) {
    cache.deleteSync(key)
  }
}

const defaultOpts = opts => {
  opts.before = before
  opts.after = after
  opts.token = token
  opts.debug = cli.flags.debug
  opts.dryRun = cli.flags.dryRun
  opts.verbose = cli.flags.v
  opts.commits = !cli.flags.localDir && cli.flags.commits
  opts.reactions = cli.flags.reactions
  opts.full = cli.flags.full

  return opts
}

if (!token && !cli.flags.c) {
  console.error('A token is needed to access the GitHub API. Please provide one with -t or the GITHUB_TOKEN environment variable.')
  process.exit(1)
}

if (cli.flags.full && cli.flags.csv) {
  console.error('Cannot format full tree output as CSV.')
  process.exit(1)
}

const formatReturn = x => {
  if (cli.flags.csv) {
    return main.toCSV(x)
  } else {
    return JSON.stringify(x, null, 2)
  }
}

/** Wait for outstanding requests to resolve and shut down the program. */
const cleanup = ret => {
  if (done()) {
    process.exit(ret)
  } else {
    setTimeout(cleanup, 1000)
  }
}

const handleOut = res => {
  console.log(res)
  cleanup(0)
}

const handleError = e => {
  console.error(e)
  cleanup(1)
}

const handle = (f, opts) =>
     f(opts).then(formatReturn).then(handleOut).catch(handleError)

const fetchRepo = (user, repo) =>
      handle(main.repoContributors, defaultOpts({user, repo}))

if (cli.flags.c) {
  const opts = defaultOpts({file: cli.flags.c})
  main.fromConfig(opts)
    .then(x => JSON.stringify(x, null, 2))
    .then(handleOut)
    .catch(handleError)
} else if (cli.flags.o) {
  handle(main.orgContributors, defaultOpts({orgName: cli.flags.o}))
} else if (cli.flags.u && cli.flags.r) {
  fetchRepo(cli.flags.u, cli.flags.r)
} else if (cli.flags.r) {
  main.currentUser(token).then(user => fetchRepo(user, cli.flags.r))
} else {
  main.getCurrentRepoInfo().then(({user, repo}) => fetchRepo(user, repo))
}
