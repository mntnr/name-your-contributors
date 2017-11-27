'use strict'

const graphql = require('./graphql')
const queries = require('./queries')
const csv = require('csv-writer').createArrayCsvStringifier
const exec = require('child_process').exec
const fs = require('fs')

//
// Shell Helpers
//

const shellOut = command =>
      new Promise((resolve, reject) =>
                  exec(command, (err, stdout, stderr) => {
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
    parse[2] = parse[2].substr(0, parse[2].length - 4)
  }
  return parse
}

const getCurrentRepoInfo = () => shellOut(gitConfigCommand)
      .then(parseGitURL)
      .then(x => { return {user: x[1], repo: x[2]} })

//
// CSV Output
//

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

const verifyResultHasKey = (key, query) =>
      x => {
        if (x[key] == null) {
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

/** Returns all contributions to a repo.
  * @param token  - GitHub auth token
  * @param user   - Username to whom the repo belongs
  * @param repo   - repo name
  * @param before - only return contributions before this timestamp
  * @param after  - only return contributions after this timestamp
  */
const repoContributors =
      ({token, user, repo, before, after, debug, dryRun, verbose}) =>
      graphql.executequery({
        token,
        debug,
        dryRun,
        verbose,
        name: `repoContributors: ${user}/${repo}`,
        query: queries.repository(repo, user, before, after)
      }).then(verifyResultHasKey('repository', user + '/' + repo))
      .then(json => {
        if (dryRun) {
          return json
        } else {
          return queries.cleanRepo(token, json.repository, before, after, verbose)
        }
      })

/** Returns contributions to all repos owned by orgName.
  * @param token   - GitHub auth token
  * @param orgName - Name of organization
  * @param before  - only return contributions before this timestamp
  * @param after   - only return contributions after this timestamp
  */
const orgContributors = ({token, orgName, before, after, debug, dryRun, verbose}) =>
      graphql.executequery({
        token,
        debug,
        dryRun,
        verbose,
        name: `orgContributors: ${orgName}`,
        query: queries.orgRepos(orgName, before, after)
      }).then(verifyResultHasKey('organization', orgName))
      .then(data => {
        if (dryRun) {
          return data
        } else {
          return queries.cleanOrgRepos(token, data, before, after, verbose)
        }
      })

/** Returns all contributions to repos and orgs specified in `file`
  * @param token - GitHub auth token
  * @param file  - Config file path
  */
const fromConfig = async ({token, file, verbose, debug, dryRun}) => {
  const config = JSON.parse(fs.readFileSync(file))
  const ght = config.token || token
  if (!ght) {
    throw new Error('No token specified in config or arguments. Aborting.')
  }
  const repoResults = config.repos.map(({login, repo, before, after}) => {
    const afterDate = after ? new Date(after) : new Date(0)
    const beforeDate = before ? new Date(before) : new Date()

    return repoContributors({
      token: ght,
      user: login,
      repo,
      before: beforeDate,
      after: afterDate,
      debug,
      dryRun,
      verbose
    })
  })

  const orgResults = config.orgs.map(({login, before, after}) => {
    const afterDate = after ? new Date(after) : new Date(0)
    const beforeDate = before ? new Date(before) : new Date()
    return orgContributors({
      orgName: login,
      before: beforeDate,
      after: afterDate,
      token: ght,
      verbose,
      debug,
      dryRun
    })
  })

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
      graphql.executequery({
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
