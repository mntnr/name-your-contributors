'use strict'

const graphql = require('./graphql')
const queries = require('./queries')
const csv = require('csv-writer').createArrayCsvStringifier
const exec = require('child_process').exec

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

const parseGitURL = new RegExp('.*github\\.com[:/]([^/]+)\\/(.+)\\n?$')

const getCurrentRepoInfo = () => shellOut(gitConfigCommand)
      .then(x => parseGitURL.exec(x))
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
const repoContributors = ({token, user, repo, before, after, debug}) =>
      graphql.executequery(token, queries.repository(repo, user, before, after), debug)
      .then(json => queries.cleanRepo(token, json.repository, before, after))

/** Returns a list of names of all repos belonging to user. */
const userRepoNames = ({token, login, debug}) =>
      graphql.executequery(token, queries.userRepos(login), debug)
      .then(x => queries.cleanUserRepos(token, x))

/** Returns contributions to all repos owned by orgName.
  * @param token   - GitHub auth token
  * @param orgName - Name of organization
  * @param before  - only return contributions before this timestamp
  * @param after   - only return contributions after this timestamp
  */
const orgContributors = ({token, orgName, before, after, debug}) =>
      graphql.executequery(token, queries.orgRepos(orgName, before, after), debug)
      .then(data => queries.cleanOrgRepos(token, data, before, after))

/** Returns the login of the user to whom the given token is registered.
  * @param token - GitHub Auth token
  */
const currentUser = token =>
      graphql.executequery(token, queries.whoAmI)
      .then(queries.cleanWhoAmI)

module.exports = {
  toCSV,
  getCurrentRepoInfo,
  currentUser,
  repoContributors,
  orgContributors,
  userRepoNames
}
