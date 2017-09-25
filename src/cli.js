#!/usr/bin/env node
'use strict';

const meow = require('meow');
const main = require('./index');

const cli = meow([`
	Usage
		$ name-your-contributors <input> [opts]

	Options
		-a, --after  - Get contributions after date
		-b, --before - Get contributions before data
		-r, --repo   - Repository to search
		-u, --user   - User to which repository belongs
		-o, --org    - Search all repos within this organisation
		-t, --token  - GitHub auth token to use

	Authentication
		This script looks for an auth token in the env var GITHUB_TOKEN. Make sure
		this var is set to a valid GitHub oauth token. To create one see:
		https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/
	Examples
		$ name-your-contributors -r ipfs -u ipfs --after=2016-01-15T00:20:24Z --before=2016-01-20T00:20:24Z

		$ name-your-contributors -o ipfs -a 2017-01-01 > ipfs-contrib-2017.json
`, {
	alias: {
		b: 'before',
		a: 'after',
		r: 'repo',
		u: 'user'
	}
}]);

const token = cli.flags.t || process.env.GITHUB_TOKEN;

if (cli.flags.o && token) {
	main.nameContributorsToOrg({
		token: token,
		orgName: cli.flags.o,
		before: cli.flags.b,
		after: cli.flags.after
	}).then(json => JSON.stringify(json, null, 2))
		.then(console.log);
} else if (cli.flags.u && cli.flags.r && token) {
	main.nameYourContributors({
		token: token,
		user: cli.flags.u,
		repo: cli.flags.r,
		before: cli.flags.b,
		after: cli.flags.a
	}).then(x => JSON.stringify(x, null, 2))
		.then(console.log)
		.catch(console.error);
} else {
	console.error('You must currently specify both a user and a repo name. And provide a token.');
	process.exit(1);
}
