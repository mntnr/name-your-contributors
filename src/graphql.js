'use strict'

const https = require('https')

// -----
// Query Builder DSL
// -----

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
    const s = children.map(item => item.toString())
          .reduce((acc, next) => acc + next + '\n', '')
    return '{' + s.substring(0, s.length - 1) + '}'
  }
}

/**
  * Returns a query object, our wrapper for the structured creation of
  * graphql queries.
  * @param name - the property name from the schema
  * @param args - map of args passed to the property (if required by the
  * schema).
  * @param children - an array of subqueries.
  * @method addChild - factory method to add a child to a node.
  * @method toString - Prints out the query as a string. Required by the runtime
  * for query execution, also handy for debugging.
  */
const queryRoot = ({name, args, children, type}) => {
  const item = {name, args, children, type}

  item.addChild = child =>
    queryRoot({name, args, children: children.concat(child), type})

  item.toString = () => {
    if (args == null) {
      throw new Error(`No args passed to ${name}`)
    }
    return name + argsString(args) + childrenString(children)
  }

  return item
}

/** Represents a leaf in the query tree.
  * @param name - property name to query
  */
const queryLeaf = name => queryRoot({
  name,
  args: {},
  children: [],
  type: 'leaf'
})

/** Returns a query node for a property that has no ID. This is necessary due to
  * idiosyncronicities in certain GraphL schemata.
  */
const queryNoid = (name, args, children) => queryRoot({
  name,
  args,
  children,
  type: 'noid'
})

/** Returns a standard interal node of a query.
  * @param name     - property name
  * @param args     - arguments to pass with node
  * @param children - subqueries beneath this node.
  */
const queryNode = (name, args, children) => queryRoot({
  name,
  args,
  children: children.concat([queryLeaf('id'), queryLeaf('__typename')]),
  type: 'node'
})

const pagination = queryRoot({
  name: 'pageInfo',
  args: {},
  children: [queryLeaf('endCursor'), queryLeaf('hasNextPage')],
  type: 'pagination meta'
})

/** Returns a query node that knows it traverses an edge. This makes automatic
  * depagination and result walking possible. Same signature as queryNode.
  */
const queryEdge = (name, args, children) => {
  args.first = args.first || 1

  return queryRoot({
    name,
    args,
    type: 'edge',
    children: [pagination]
  }).addChild(queryNode('nodes', {}, children))
}

const queryOn = (type, children) => queryRoot({
  name: `... on ${type}`,
  args: {},
  children,
  type: 'on',
  nodeType: type
})

/** Returns a branching typecasting query node. Necessary for any node in an API
  * that returns an interface.
  * @param name  - property name
  * @param args  - property args
  * @param types - an array of arrays, each of which is of the form [type,
  *                children] where the children are valid subqueries for the
  *                type in question.
  */
const queryType = (name, args, types) => {
  const children = types.map(([type, children]) => queryOn(type, children))
  return queryRoot({
    name,
    args,
    type: 'typed',
    children: children
  })
}

// -----
// Query Depagination
// -----

// Kludgy non-destructive assoc
/** Returns a shallow copy of o with o[k] = v (and optionally o[k2] = v2).
  */
const assoc = (o, k, v, k2, v2) => {
  const out = {}
  Object.assign(out, o)
  out[k] = v
  if (k2 && v2) {
    out[k2] = v2
  }
  return out
}

/** Find object o with o.name = name in given list. Throws an exception if no
  * object found.
  * @param l    array of objects
  * @param name name to query
  */
const find = (l, name) => {
  for (const o of l) {
    if (o.name === name) {
      return o
    }
  }
  throw new Error(`Could not find ${name} in ${l}`)
}

/** Checks cursor to see if there are more pages to the current query
  * edge. Returns a promise which will yield all nodes in the edge.
  */
const fetchAll = async (reqargs, query, cursor, id, type) => {
  const args = assoc(query.args, 'first', 100, 'after', cursor)
  const q = queryType('node', {id: id}, [
    [type, [
      queryNoid(query.name, args, query.children)
    ]]
  ])

  const response = await initialRequest(assoc(reqargs, 'query', q))
  const {endCursor, hasNextPage} = response.json.node[query.name].pageInfo

  if (hasNextPage) {
    const more = await fetchAll(reqargs, query, endCursor, id, type)

    return {
      pageInfo: more.pageInfo,
      nodes: response.json.node[query.name].nodes.concat(more.nodes)
    }
  } else {
    return {
      pageInfo: {endCursor, hasNextPage},
      nodes: response.json.node[query.name].nodes
    }
  }
}

const walkChildren = async (args, children, response) => {
  await Promise.all(children.map(child => depWalk(args, child, response)))
}

const walkEdge = async (args, query, parent) => {
  const response = parent[query.name]
  const {hasNextPage, endCursor} = response.pageInfo
  if (hasNextPage) {
    const {pageInfo, nodes} = await fetchAll(
      args, query, endCursor, parent.id, parent.__typename
    )

    response.nodes = response.nodes.concat(nodes)
    response.pageInfo = pageInfo
  }

  const children = find(query.children, 'nodes').children
  await Promise.all(
    response.nodes.map(node => walkChildren(args, children, node))
  )
}

const depWalk = async (args, query, response) => {
  const {type, name} = query
  const next = response[name]

  if (next == null || type === 'leaf') {
  } else if (query.type === 'edge') {
    await walkEdge(args, query, response)
  } else if (type === 'typed') {
    for (const child of query.children) {
      await walkChildren(args, child.children, next)
    }
  } else {
    await walkChildren(args, query.children, next)
  }
}

/** Returns a promise which will yield response with all edges replaced by
  * fetched arrays of results.
  */
const depaginate = args => async response => {
  await depWalk(args, args.query, response.json, null)
  return response
}

// -----
// Cleaner models
// -----

const cleanChildren = (json, children) => {
  children.map(child => {
    cleanwalk(json, child)
  })
}

const cleanwalk = (json, query) => {
  const {type, name} = query

  if (json[name] == null || type === 'leaf') {
  } else if (type === 'edge') {
    json[name] = json[name].nodes
    const children = find(query.children, 'nodes').children
    json[name].map(node => {
      delete node.id
      delete node.__typename
      cleanChildren(node, children)
    })
  } else if (type === 'typed') {
    delete json[name].id
    delete json[name].__typename
    for (const child of query.children) {
      cleanChildren(json[name], child.children)
    }
  } else if (type === 'node') {
    delete json[name].id
    delete json[name].__typename
    cleanChildren(json[name], query.children)
  } else {
    cleanChildren(json[name], query.children)
  }
}

/** Given a json response from and original query, returns the response with
  * internal bookkeeping (rate limit info, pagination data, unasked for IDs)
  * removed.
  */
const pruneTree = (json, query) => {
  cleanwalk(json, query)
  delete json.rateLimit
  return json
}

// -----
// Execution of Queries
// -----

/** Returns a query string which asks how much quota the given query would
  * cost, in addition to the query itself. Optionally prevents the query from
  * running.
  */
const queryWithCost = (item, dryRun) => '{"query": ' +
      JSON.stringify(
        `query{rateLimit(dryRun: ${Boolean(dryRun)}){cost, remaining, resetAt}\n` +
          item.toString() + '}') + '}'

/** Inner query dispatch.

    Same params as execute.
    Returns the raw HTTP response body.
  */
const queryRequest = ({token, query, debug, dryRun, verbose, name}) => {
  return new Promise((resolve, reject) => {
    let queryResponse = ''
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '*/*',
      'User-Agent': 'Name-Your-Contributors',
      'Authorization': `bearer ${token}`
    }

    const runQ = queryWithCost(query, dryRun)

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
            resolve({
              query: runQ,
              body: queryResponse,
              status: res.statusCode,
              headers: res.headers
            })
          } else {
            console.error({
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              responseBody: queryResponse
            })
            reject(new Error(res.statusMessage))
          }
        })
      })

    req.on('error', reject)

    req.write(runQ)
    req.end()
  })
}

// Number requests for reference.
let reqCounter = 1

/** Verbose and debug logging middleware. */
const logResponse = (queryName, verbose, debug) => res => {
  const {query, json, headers} = res

  if (debug) {
    console.log(`#${reqCounter++} [${queryName}]:
Query:
${query}
Response headers:
${JSON.stringify(headers, null, 2)}
Response body:
${JSON.stringify(json, null, 2)}
`)
  } else if (verbose) {
    console.log(`#${reqCounter++} [${queryName}]:
  ${JSON.stringify(json.rateLimit)}`)
  }

  return res
}

/** Parses response as json and adds it args. Returns args. Signals an error if
  * the reponse is not valid.
  */
const parseResponse = args => {
  const json = JSON.parse(args.body)
  if (json.data) {
    args.json = json.data
    return args
  } else {
    throw new Error('Graphql error: ' + JSON.stringify(json, null, 2))
  }
}

let running = false

let lastMinute = 0
const maxPerMinute = 300

const queue = []

/** Request pool executor. Sends the next network request if resources permit.
  */
const runQueue = () => {
  if (running) {
    // noop
  } else if (lastMinute >= maxPerMinute) {
    setTimeout(runQueue, 1000)
  } else {
    if (queue.length > 0) {
      running = true
      lastMinute++
      setTimeout(() => lastMinute--, 60000)

      const {args, resolve, reject} = queue.shift()
      const req = queryRequest(args)

      req.then(x => {
        process.nextTick(runQueue)
        running = false
      })

      req.catch(e => {
        running = false
        reject(e)
      })

      resolve(req)
    }
  }
}

/** Enqueue request to be handled by executor. */
const executeOnQueue = args =>
      new Promise((resolve, reject) => {
        queue.push({args, resolve, reject})
        runQueue()
      })

/**
  * Returns a promise which will yield a query result string.
  * @param {string}    token   - Github auth token.
  * @param {queryNode} query   - The query to execute.
  * @param {string}    name    - Name of this query. For debugging only.
  * @param {bool}      verbose - Enable verbose logging.
  * @param {bool}      debug   - Debug mode: VERY verbose logging.
  * @param {bool}      dryRun  - Execute a dry run, check query but don't run.
  */
const rawResponse = args => executeOnQueue(args)

const initialRequest = args =>
      rawResponse(args)
      .then(parseResponse)
      .then(logResponse(args.name, args.verbose, args.debug))

/**
  * Returns a promise which will yield the query result as depaginated JSON.
  * @param {string}    token   - Github auth token.
  * @param {queryNode} query   - The query to execute.
  * @param {string}    name    - Name of this query. For debugging only.
  * @param {bool}      verbose - Enable verbose logging.
  * @param {bool}      debug   - Debug mode: VERY verbose logging.
  * @param {bool}      dryRun  - Execute a dry run, check query but don't run.
  */
const execute = args =>
      initialRequest(args)
      .then(depaginate(args))
      .then(x => x.json)

/**
  * Returns a promise which will yield the query result as depaginated JSON with
  * internal bookeeping logic stripped out.
  * @param {string}    token   - Github auth token.
  * @param {queryNode} query   - The query to execute.
  * @param {string}    name    - Name of this query. For debugging only.
  * @param {bool}      verbose - Enable verbose logging.
  * @param {bool}      debug   - Debug mode: VERY verbose logging.
  * @param {bool}      dryRun  - Execute a dry run, check query but don't run.
  */
const prune = args => execute(args).then(json => pruneTree(json, args.query))

/** Returns true iff all asyncronous processes have terminated and it is safe to
  * shut down the system.
  */
const done = () => !running && queue.length === 0

module.exports = {
  execute,
  prune,
  done,
  queryNode,
  queryNoid,
  queryLeaf,
  queryEdge,
  queryType
}
