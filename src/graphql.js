'use strict'

const https = require('https')

/** Escape strings to prevent injection attacks. Other types aren't an issue. */
const escapeArgValue = val => {
  if (typeof (val) === 'string') {
    return '"' + val + '"'
  } else {
    return val
  }
}

const argsString = args => {
  const keys = Object.keys(args)
  if (keys.length === 0) {
    return ''
  } else {
    const s = keys.map(k => {
      return k + ': ' + escapeArgValue(args[k]) + ','
    }).reduce((acc, next) => acc + next, '')
    return '(' + s.substr(0, s.length - 1) + ')'
  }
}

let itemToString = () => {
  throw new Error('not Implemented')
}

const childrenString = children => {
  if (children.length === 0) {
    return ''
  } else {
    if (!children.map) {
      // This problem comes up if you add nodes as children to other nodes
      // manually and forget to make it a list. Printing out the error makes it
      // easy to see where you made a mistake. At least it has so far.
      console.error('Children must be an array. Instead we got:', children)
    }
    const s = children.map(itemToString)
          .reduce((acc, next) => acc + next + '\n', '')
    return '{' + s.substring(0, s.length - 1) + '}'
  }
}

itemToString = ({name, args, children}) => {
  return name + argsString(args) + childrenString(children)
}

/**
  * Returns a queryNode object, our wrapper for the structured creation of
  * graphql queries.
  * @param name - the property name from the schema
  * @param args - map of args passed to the property (if required by the
  * schema).
  * @param children - an array of subqueries.
  * @method addChild - factory method to add a child to a node.
  * @method toString - Prints out the query as a string. Required by the runtime
  * for query execution, also handy for debugging.
  */
const queryNode = (name, args = {}, children = []) => {
  const item = {name, args, children}

  item.addChild = child => {
    return queryNode(name, args, children.concat(child))
  }

  item.toString = () => itemToString(item)

  return item
}

/** Returns a query string which asks how much quota the given query would
  * cost. Optionally prevents the query from running.
  */
const queryCost = (item, dryRun) => '{"query": ' +
      JSON.stringify(
        `query{rateLimit(dryRun: ${Boolean(dryRun)}){cost, remaining}\n` +
          item.toString() + '}') + '}'

/** Converts a queryNode object into a valid graphql query string according to
Github's conventions. */
const formatQuery = item => '{"query": ' +
      JSON.stringify('query{' + item.toString() + '}') + '}'

// Global debug mode.
let debugMode = false

/**
  * Returns a promise which will yeild a query result.
  * @param {string}    token   - Github auth token.
  * @param {queryNode} query   - The query to execute.
  * @param {string}    name    - Name of this query. For debugging only.
  * @param {bool}      verbose - Enable verbose logging.
  * @param {bool}      debug   - Debug mode: VERY verbose logging.
  * @param {bool}      dryRun  - Execute a dry run, check query but don't run.
  */
const executequery = ({token, query, debug, dryRun, verbose, name}) => {
  if (debug) {
    debugMode = true
  }
  return new Promise((resolve, reject) => {
    let queryResponse = ''
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '*/*',
      'User-Agent': 'Name-Your-Contributors',
      'Authorization': `bearer ${token}`
    }
    const req = https.request(
      {
        method: 'post',
        headers: headers,
        host: 'api.github.com',
        path: '/graphql'
      },
      res => {
        res.on('error', reject)
        res.on('data', chunk => {
          queryResponse += chunk
        })
        res.on('end', () => {
          if (res.statusCode === 200) {
            const json = JSON.parse(queryResponse)
            if (json.data) {
              if (debugMode) {
                console.log('Result of[' + name + ']: ' +
                            JSON.stringify(json.data, null, 2))
              }
              if (verbose) {
                console.log('Cost of[' + name + ']: ' +
                            JSON.stringify(json.data.rateLimit))
              }

              resolve(json.data)
            } else {
              reject(new Error('Graphql error: ' + JSON.stringify(json, null, 2)))
            }
          } else {
            console.error({
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              responseBody: queryResponse
            })
            reject(new Error(res.statusMessage))
          }
        })
      })

    const runQ = queryCost(query, dryRun)

    req.on('error', reject)

    if (debugMode) {
      console.log('Query[' + name + ']: ' + runQ)
    }

    req.write(runQ)
    req.end()
  })
}

module.exports = {
  executequery,
  formatQuery,
  queryNode,
  queryCost
}
