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
  if (args == null) {
    throw new Error(`No args passed to ${name}`)
  }
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
        `query{rateLimit(dryRun: ${Boolean(dryRun)}){cost, remaining, resetAt}\n` +
          item.toString() + '}') + '}'

/** Converts a queryNode object into a valid graphql query string according to
Github's conventions. */
const formatQuery = item => '{"query": ' +
      JSON.stringify('query{' + item.toString() + '}') + '}'

// Global debug mode.
let debugMode = false
let reqCounter = 1

/** Inner query executor.

    Same params and output as executequery
  */
const executequeryRaw = ({token, query, debug, dryRun, verbose, name}) => {
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
                console.log('Cost of[' + name + ']: (' +
                            '#' + reqCounter++ + ') ' +
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

// Global connection
let running = 0
let lastMinute = 0

// Warning about rate throttling
let warned = false

// Rate limit parameters
// We actually wait a minute after the request comes back before allowing the
// next one to run
const maxConnections = 20
const maxPerMinute = 100

const allocate = (args, verbose, debug) => {
  if (debug) {
    if (running > 0) {
      console.log(`Running: ${running}, lastMinute: ${lastMinute}`)
    }
  }
  return new Promise((resolve, reject) => {
    if (running < maxConnections && lastMinute < maxPerMinute) {
      running++
      lastMinute++
      resolve(executequeryRaw(args))
    } else {
      if (!warned && lastMinute >= maxPerMinute) {
        warned = true
        console.log('Warning!!! Rate throttling has taken effect. This query might take awhile; go grab some coffee.')
      }
      if (verbose && !debug && running > 0) {
        console.log(`Throttled!! Running: ${running}, lastMinute: ${lastMinute}`)
      }
      setTimeout(() => resolve(allocate(args)), 1000)
    }
  })
}

const finished = () => {
  running--
}

const free = res => {
  setTimeout(() => lastMinute--, 60000)
  res.then(finished).catch(finished)
}

/**
  * Returns a promise which will yeild a query result.
  * @param {string}    token   - Github auth token.
  * @param {queryNode} query   - The query to execute.
  * @param {string}    name    - Name of this query. For debugging only.
  * @param {bool}      verbose - Enable verbose logging.
  * @param {bool}      debug   - Debug mode: VERY verbose logging.
  * @param {bool}      dryRun  - Execute a dry run, check query but don't run.
  */
const executequery = args => {
  const response = allocate(args, args.verbose, args.debug)
  free(response)
  return response
}

module.exports = {
  executequery,
  formatQuery,
  queryNode,
  queryCost
}
