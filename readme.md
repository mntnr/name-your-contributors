# name-your-contributors

[![Greenkeeper badge](https://badges.greenkeeper.io/RichardLitt/name-your-contributors.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/RichardLitt/name-your-contributors.svg?branch=master)](https://travis-ci.org/RichardLitt/name-your-contributors)

> Name your GitHub contributors; get commits, issues, and comments

`name-your-contributors` gets all of the code reviewers, commenters, issue and PR creators from your organization or repo.

## Install

```
$ npm install --save name-your-contributors
```

### API Limits and setting up a GitHub Token

You also need to get a GitHub application token to access the API. Go here:
https://github.com/settings/tokens. Click on "Generate New Token". It doesn't
need to have any special scopes. Name the token something informative:
`name-your-contributors` is a good name.

Set the token with the variable name `$GITHUB_TOKEN` before running the script:

```sh
$ export GITHUB_TOKEN=ab34e...
```

You can also set the var automatically in every session by adding the above line
to your `.bashrc` file in your home directory.

#### Other repositories using this token

The environmental variable is also used by several of `name-your-contributor`'s similar repositories:

 * [get-code-reviewers](https://github.com/RichardLitt/get-code-reviewers) - Get users who comment on PRs or code for OS GitHub repos.
 * [get-issue-commenters](https://github.com/richardlitt/get-issue-commenters) - Get users who comment on issues for OS GitHub repos.
 * [get-github-issue-creators](https://github.com/RichardLitt/get-github-issue-creators) - Get a list of GitHub issue creators from an organization or repo.
 * [get-github-pr-creators](https://github.com/RichardLitt/get-pr-creators) - Get a list of GitHub PR creators from an organization or repo.
 * [get-github-user](https://github.com/RichardLitt/get-github-user) - Get GitHub user information from just a username.

## Usage

### From Code

```js
const nyc = require('name-your-contributors');

nyc.nameYourContributors({
	token: process.env.GITHUB_TOKEN,
	user: 'RichardLitt',
	repo: 'name-your-contributors'
	}).then(//do something with the results
	);

nyc.nameContributorsToOrg({
	token: process.env.GITHUB_TOKEN,
	orgName: 'ipfs',
	before: '2017-01-01,
	after: '2016-01-01
	}).then(...);
```

### From the Command Line

```sh
$ npm -i -g name-your-contributors

$ export GITHUB_TOKEN={your-token}
$ name-your-contributors -u RichardLitt -r name-your-contributors

$ name-your-contributors -o ipfs -a 2017-01-01 > ipfs-contrib.json
```

## API

### nameContributorsToOrg({orgName, token, before, after})

#### token

Type: `string`

Github auth token

#### org

Type: `string`

The organization to traverse. If no organization is provided, the script
will find the username and repo for the local git repository and use that.

#### opts.after

Type: `string`

The ISO timestamp to get contributors after.

Any string that will be accepted by `new Date("...")` will work here as
expected.

#### opts.before

Type: `string`

Get contributors from before this ISO timestamp.

### nameYourContributors({user, repo, token, before, after})

#### opts.user

Type: `string`

Github user name to whom the repo belongs.

#### opts.repo

Type: `string`

Only traverse the given repository.

## License

MIT © [Richard Littauer](http://burntfen.com)
