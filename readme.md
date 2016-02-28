# name-your-contributors [![Build Status](https://travis-ci.org/RichardLitt/name-your-contributors.svg?branch=master)](https://travis-ci.org/RichardLitt/name-your-contributors)

> Name your GitHub contributors; get commits, issues, and comments

## Install

```
$ npm install --save name-your-contributors
```

### API Limits and setting up a GitHub Token

You also need to get a GitHub application token, if you are going to be hitting the API much. Go here: https://github.com/settings/tokens. Click on "Generate New Token". It doesn't need to have any special scopes. Name the token something informative: `name-your-contributors` is a good name.

Set the token with the variable name `$GITHUB_OGN_TOKEN` somewhere in your .bash_profile or .bashrc files. These are normally hidden in your root directory. Alternatively, you can provide it in the CLI each time you run the command by calling `GITHUB_OGN_TOKEN=<token> name-your-contributors`.

The environmental variable is used by several of `name-your-contributor`'s dependencies:

 * [get-code-reviewers](https://github.com/RichardLitt/get-code-reviewers) - Get users who comment on PRs or code for OS GitHub repos.
 * [get-issue-commenters](https://github.com/richardlitt/get-issue-commenters) - Get users who comment on issues for OS GitHub repos.
 * [get-github-issue-creators](https://github.com/RichardLitt/get-github-issue-creators) - Get a list of GitHub issue creators from an organization or repo.
 * [get-github-user](https://github.com/RichardLitt/get-github-user) - Get GitHub user information from just a username.

## Usage

```js
const nameYourContributors = require('name-your-contributors');

nameYourContributors('ipfs', {
  since: '2016-01-15T00:20:24Z'
});
//=> '[@RichardLitt](//github.com/RichardLitt) (Richard Littauer)'
```


## API

### nameYourContributors(org, {since: since})

#### org

Type: `string`

The organization to traverse. If no organization is provided, the script
will find the username and repo for the local git repository and use that.

#### opts.since

Type: `string`

The ISO timestamp to get contributors since.


## CLI

```
$ npm install --global name-your-contributors
```

```
$ name-your-contributors --help

  Usage
    $ name-your-contributors <input> [opts]

  Examples
    $ name-your-contributors ipfs --since=2016-01-15T00:20:24Z
    [@RichardLitt](//github.com/RichardLitt) (Richard Littauer)

```


## License

MIT © [Richard Littauer](http://burntfen.com)
