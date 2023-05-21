'use strict'

const graphql = require('./graphql')
const queries = require('./queries')
const csv = require('csv-writer').createArrayCsvStringifier
const exec = require('child_process').exec
const readFileSync = require('fs').readFileSync
const Spinner = require('clui').Spinner
const use = require('nclr').use

const loader = new Spinner('Loading...')

//
// Shell Helpers
//

const shellOut = command =>
  new Promise((resolve, reject) =>
    exec(command, (err, stdout, _stderr) => {
      if (err) {
        reject(err)
      } else {
        resolve(stdout)
      }
    }))

const gitConfigCommand = 'git config --get remote.origin.url'

const parseGitURLRE = new RegExp('.*github\\.com[:/]([^/]+)\\/(.+)$')

const parseGitURL = url => {
  const parse = parseGitURLRE.exec(url.trim())
  if (parse[2].endsWith('.git')) {
    parse[2] = parse[2].substring(0, parse[2].indexOf('.git'))
  }
  return parse
}

const getCurrentRepoInfo = () => shellOut(gitConfigCommand)
  .then(parseGitURL)
  .then(x => { return { user: x[1], repo: x[2] } })

//
// CSV Output
//

const flatten = json => {
  const prs = json.prCreators.map(x => ['pr creator'].concat(x))
  const prcs = json.prCommentators.map(x => ['pr commentator'].concat(x))
  const is = json.issueCreators.map(x => ['issue creator'].concat(x))
  const iscs = json.issueCommentators.map(x => ['issue commentator'].concat(x))
  const co = json.commitAuthors.map(x => ['commit creator'].concat(x))
  const cocs = json.commitCommentators.map(x => ['commit commentator'].concat(x))

  return [...prs, ...prcs, ...is, ...iscs, ...co, ...cocs]
}

const toCSV = json => {
  const writer = csv({
    header: ['TYPE', 'LOGIN', 'NAME']
  })
  return writer.getHeaderString() +
    writer.stringifyRecords(flatten(json))
}

const verifyResultHasKey = (key, query, dryRun) =>
  x => {
    if (!dryRun && x[key] == null) {
      throw new Error(`Bad query: ${key} '${query}' does not exist`)
    } else {
      return x
    }
  }

//
// Config File Parsing

//
// API
//

const epochDate = new Date(0)

const prunedFetch = args => graphql.prune(args)
  .then(json => queries.timeFilterFullTree(json, args.before, args.after))

/** Returns all contributions to a repo.
  * @param token  - GitHub auth token
  * @param user   - Username to whom the repo belongs
  * @param repo   - repo name
  * @param {Date} [before = new Date()] - only return contributions before this timestamp
  * @param {Date} [after = new Date(0)] - only return contributions after this timestamp
  */
const repoContributors = ({
  token, user, repo, before = new Date(), after = epochDate, debug, dryRun, verbose, commits, reactions, full
}) => {
  loader.message(`Getting all contributors from repo ${use('inp', repo)}...`)
  loader.start()
  const summarise = args =>
    graphql.execute(args)
      .then(verifyResultHasKey('repository', user + '/' + repo, dryRun))
      .then(json => {
        if (dryRun) {
          return json
        } else {
          return queries.repoSynopsis({ json, before, after, commits, reactions })
        }
      })

  const qfn = full ? prunedFetch : summarise

  loader.stop()
  return qfn({
    token,
    debug,
    dryRun,
    before,
    after,
    verbose,
    name: `${user}/${repo}`,
    query: queries.repository(repo, user, before, after, commits, reactions)
  })
}

/** Returns contributions to all repos owned by orgName.
  * @param token   - GitHub auth token
  * @param orgName - Name of organization
  * @param {Date} [before = new Date()]  - only return contributions before this timestamp
  * @param {Date} [after = new Date(0)]  - only return contributions after this timestamp
  */
const orgContributors = ({
  token, orgName, before = new Date(), after = epochDate, debug, dryRun, verbose, commits, reactions, full
}) => {
  loader.message(`Getting all contributors of ${use('inp', orgName)}...`)
  loader.start()
  const summarise = args =>
    graphql.execute(args)
      .then(verifyResultHasKey('organization', orgName, dryRun))
      .then(json => {
        if (dryRun) {
          return json
        } else {
          return queries.orgSynopsis({
            json, before, after, commits, reactions
          })
        }
      })

  const qfn = full ? prunedFetch : summarise

  loader.stop()
  return qfn({
    token,
    debug,
    before,
    after,
    dryRun,
    verbose,
    name: orgName,
    query: queries.orgRepos(orgName, before, after, commits, reactions)
  })
}

/** Returns all contributions to repos and orgs specified in `file`
  * @param token - GitHub auth token
  * @param file  - Config file path
  */
const fromConfig = async ({
  token, file, commits, reactions, verbose, debug, dryRun, full
}) => {
  loader.message(`Getting config from ${use('inp', file)}...`)
  loader.start()
  const config = JSON.parse(readFileSync(file))
  const ght = config.token || token
  if (!ght) {
    throw new Error('No token specified in config or arguments. Aborting.')
  }

  loader.message('Getting repo information from the config')
  const repoResults = config.repos.map(({ login, repo, before, after }) => {
    const afterDate = after ? new Date(after) : new Date(0)
    const beforeDate = before ? new Date(before) : new Date()

    return repoContributors({
      token: ght,
      user: login,
      repo,
      before: beforeDate,
      after: afterDate,
      commits,
      reactions,
      full,
      debug,
      dryRun,
      verbose
    })
  })

  loader.message('Getting org information from the config')
  const orgResults = config.orgs.map(({ login, before, after }) => {
    const afterDate = after ? new Date(after) : new Date(0)
    const beforeDate = before ? new Date(before) : new Date()
    return orgContributors({
      orgName: login,
      before: beforeDate,
      after: afterDate,
      token: ght,
      commits,
      reactions,
      full,
      verbose,
      debug,
      dryRun
    })
  })

  loader.stop()
  return {
    repos: (await Promise.all(repoResults)).map((result, index) => {
      const repo = config.repos[index]
      repo.contributions = result
      return repo
    }),
    orgs: (await Promise.all(orgResults)).map((result, index) => {
      const org = config.orgs[index]
      org.contributions = result
      return org
    })
  }
}

/** Returns the login of the user to whom the given token is registered.
 * @param token - GitHub Auth token
 */
const currentUser = token =>
  graphql.execute({
    token,
    query: queries.whoAmI
  }).then(queries.cleanWhoAmI)

module.exports = {
  toCSV,
  fromConfig,
  parseGitURL,
  getCurrentRepoInfo,
  currentUser,
  repoContributors,
  orgContributors
}
