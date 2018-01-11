# name-your-contributors

[![Greenkeeper badge](https://badges.greenkeeper.io/mntnr/name-your-contributors.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/mntnr/name-your-contributors.svg?branch=master)](https://travis-ci.org/mntnr/name-your-contributors)

> Name your GitHub contributors; get commits, issues, and comments

`name-your-contributors` gets all of the code reviewers, commenters, issue and PR creators from your organization or repo.

## Install

```
$ npm install --save name-your-contributors
```

### API Limits and setting up a GitHub Token

You also need to get a GitHub application token to access the API. Go here:
https://github.com/settings/tokens. Click on "Generate New Token". It needs to
have the `read:org` scope in order to search by organization. Name the token
something informative: `name-your-contributors` is a good name.

Set the token with the variable name `$GITHUB_TOKEN` before running the script:

```sh
$ export GITHUB_TOKEN=ab34e...
```

You can also set the var automatically in every session by adding the above line
to your `.bashrc` file in your home directory.

The cost of querying a repo is approximately the number of PRs + the number of
issues + the number of comments with reactions (if querying reactions) + the
number of commits / 100 (if querying commit log).

So in the simplest case it's simply the total number of issues and PRs in the
repos being queried.


#### Caveats

GitHub regulates API traffic by a credit system. The limits are quite high; it's
permitted to query hundreds of repos per hour using the `repoContributors`
function, but some organisations have many hundreds of repos, and a single call
to `orgContributors` could potentially exhaust your entire hourly quota. The
WikiMedia Foundation is a good example of an org with way too many repos for
this app to handle.

Unfortunately filtering by contributions before or after a given date has no
effect on quota use, since the data still needs to be queried before it can be
filtered.

For more details on rate limits, see
https://developer.github.com/v4/guides/resource-limitations/.

## Usage

### From Code

```js
const nyc = require('name-your-contributors')

nyc.repoContributors({
	token: process.env.GITHUB_TOKEN,
	user: 'mntnr',
	repo: 'name-your-contributors'
	}).then(//do something with the results
	)
})

nyc.orgContributors({
	token: process.env.GITHUB_TOKEN,
	orgName: 'ipfs',
	before: '2017-01-01',
	after: '2016-01-01'
	}).then(...)
```

### From the Command Line

```sh
$ npm install -g name-your-contributors

$ export GITHUB_TOKEN={your-token}

$ name-your-contributors -u mntnr -r name-your-contributors

$ name-your-contributors -o ipfs -a 2017-01-01 > ipfs-contrib.json

$ name-your-contributors --config config.json > combined-out.json
```

### Config File

For batching convenience, Name Your Contributors takes a config file which
specifies a token, a list of repos, and a list of orgs to grab. The
`config.json.example` is an outline of this file format:

```json
{
  "token": "123435abcdf",
  "repos": [{
	"login": "mntnr",
	"repo": "name-your-contributors",
	"before": "2017-11-30",
	"after": "2017-06-01"
  }, {
	"login": "mntnr",
	"repo": "whodidwhat"
  }],
  "orgs": [{
	"login": "adventure-js",
	"after": "2017-07-01"
  }]
}
```

A token passed in the config file will override any token present in the
environment.

The output when passed a config file is a mirror of the config file with the
token removed and a `contributions` key added to each object, like so:

```json
{
  "repos": [{
	"login": "mntnr",
	"repo": "name-your-contributors",
	"before": "2017-11-30",
	"after": "2017-06-01",
	"contributions" : {
	  "commitAuthors": [...],
	  "commitCommentators": [...],
	  ,,,
	},
	...
  }],
  "orgs": [...]
}
```

The output will be in the format:

```sh
$ name-your-contributors -u mntnr -r name-your-contributors --after 2017-11-10

{
  "commitAuthors": [],
  "commitCommentators": [],
  "prCreators": [],
  "prCommentators": [
	{
	  "login": "RichardLitt",
	  "name": "Richard Littauer",
	  "url": "https://github.com/RichardLitt",
	  "count": 3
	},
	{
	  "login": "tgetgood",
	  "name": "Thomas Getgood",
	  "url": "https://github.com/tgetgood",
	  "count": 2
	}
  ],
  "issueCreators": [
	{
	  "login": "RichardLitt",
	  "name": "Richard Littauer",
	  "url": "https://github.com/RichardLitt",
	  "count": 1
	}
  ],
  "issueCommentators": [
	{
	  "login": "tgetgood",
	  "name": "Thomas Getgood",
	  "url": "https://github.com/tgetgood",
	  "count": 1
	},
	{
	  "login": "RichardLitt",
	  "name": "Richard Littauer",
	  "url": "https://github.com/RichardLitt",
	  "count": 1
	}
  ],
  "reactors": [
	{
	  "login": "patcon",
	  "name": "Patrick Connolly",
	  "url": "https://github.com/patcon",
	  "count": 1
	}
  ],
  "reviewers": []
}
```

### Result formats

Name Your Contributors offers 4 distinct result formats intended for different
consumers.

#### Default

The default result format is an aggregate synopsis of all contributions in the
given time window. This is the format in the examples above.

#### CSV

With the `--csv` flag provided at the command line, nyc will return the default
info in CSV format rather than JSON.

#### Full Contribution Tree

If the `--full` flag is passed at the command line, then nyc will return the
full tree of org->repo->pr->comment->reaction->author for all interactions in
the given time window. This format is quite verbose, but invaluable if you want
to know not only who contributed, but the details of every contribution made.

For example,
```sh
$ name-your-contributors -r name-your-contributors -u mntnr -b 2017-12-10 -a 2017-11-10 --full
```
will return (abbreviated):
```sh
{
  "repository": {
	"homepageUrl": "",
	"name": "name-your-contributors",
	"owner": {
	  "login": "mntnr"
	},
	"pullRequests": [
	  {
		"title": "Cli updates",
		"number": 43,
		"state": "MERGED",
		"author": {
		  "login": "tgetgood",
		  "name": "Thomas Getgood",
		  "url": "https://github.com/tgetgood"
		},
		"createdAt": "2017-10-26T19:48:39Z",
		"comments": [
		  {
			"author": {
			  "login": "RichardLitt",
			  "name": "Richard Littauer",
			  "url": "https://github.com/RichardLitt"
			},
			"createdAt": "2017-11-20T16:35:31Z"
		  },
		  {
			"author": {
			  "login": "tgetgood",
			  "name": "Thomas Getgood",
			  "url": "https://github.com/tgetgood"
			},
			"createdAt": "2017-11-21T21:05:15Z"
		  },
		  ...
		],
		"reviews": []
	  },
	  ...
	]
  }
}
```

Notice that the pull request above was created before the date passed to
before. It is still included because comments made within it were created in the
desired timeframe. If there had been no such comments, the PR would not be
included.

#### Condensed

For an even more condensed output format which also allows filtering on given
users, see the postprocessing script
[Who Did What](https://github.com/mntnr/whodidwhat).

## API

### orgContributors({orgName, token, before, after})

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

### repoContributors({user, repo, token, before, after})

#### opts.user

Type: `string`

Github user name to whom the repo belongs.

#### opts.repo

Type: `string`

Only traverse the given repository.

## Development

There are several extra flags that are useful for development and diagnosing
issues:

`-v, --verbose` prints out each query that is sent to the api along with its
cost and the quota remaining after it is run.

`--debug` prints out each query sent to the server and the raw response. This is
extremely verbose.

`--dry-run` prints the cost of the first query that would have been run *without
running it*. Note that since the query isn't executed, follow up queries aren't
possible. when used with the `-c, --config` option, dry runs the first query for
each entry of the config file.

## License

MIT © [Richard Littauer](http://burntfen.com)
