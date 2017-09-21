#!/usr/bin/env node
'use strict'

const meow = require('meow');
const graphql = require("./graphql");
const queries = require("./queries");

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
    b: 'before',
    a: 'after',
    r: 'repo',
    u: 'user'
  }
}])

const token = process.env.GITHUB_TOKEN;

if (cli.flags.u && cli.flags.r && token) {
  graphql.executequery(token, queries.everything(cli.flags.r, cli.flags.u)).
    then(JSON.parse).
    then(queries.cleanData).
    then(console.log);
} else {
  console.error("You must currently specify both a user and a repo name. And provide a token.");
  process.exit(1);
}
