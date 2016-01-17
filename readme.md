# name-your-contributors [![Build Status](https://travis-ci.org/RichardLitt/name-your-contributors.svg?branch=master)](https://travis-ci.org/RichardLitt/name-your-contributors)

> Name your GitHub contributors; get commits, issues, and comments

## Install

```
$ npm install --save name-your-contributors
```

You also need to get a GitHub application token: https://github.com/settings/tokens. Provide it in the CLI or set it as `$GITHUB_OGN_TOKEN` somewhere in your bash_profile.

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

The organization to traverse.

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
