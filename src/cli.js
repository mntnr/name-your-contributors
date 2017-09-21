#!/usr/bin/env node
'use strict';

const meow = require('meow');
const graphql = require('./graphql');
const queries = require('./queries');

const cli = meow([`
	Usage
		$ name-your-contributors <input> [opts]

	Options
		-a, --after  - Get contributions after date
		-b, --before - Get contributions before data
		-r, --repo   - Repository to search
		-u, --user   - User to which repository belongs

	Examples
		$ name-your-contributors -r ipfs -u ipfs --after=2016-01-15T00:20:24Z --before=2016-01-20T00:20:24Z
		[@RichardLitt](//github.com/RichardLitt) (Richard Littauer)
`, {
	alias: {
		b: 'before',
		a: 'after',
		r: 'repo',
		u: 'user'
	}
}]);

const token = process.env.GITHUB_TOKEN;

if (cli.flags.u && cli.flags.r && token) {
	graphql.executequery(token, queries.everything(cli.flags.r, cli.flags.u))
		.then(JSON.parse)
		.then(json => queries.cleanData(json, cli.flags.b, cli.flags.a))
		.then(console.log);
} else {
	console.error('You must currently specify both a user and a repo name. And provide a token.');
	process.exit(1);
}
