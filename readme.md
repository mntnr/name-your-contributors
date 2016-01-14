# gh-contrib [![Build Status](https://travis-ci.org/RichardLitt/gh-contrib.svg?branch=master)](https://travis-ci.org/RichardLitt/gh-contrib)

> My smashing module


## Install

```
$ npm install --save gh-contrib
```


## Usage

```js
const ghContrib = require('gh-contrib');

ghContrib('unicorns');
//=> 'unicorns & rainbows'
```


## API

### ghContrib(input, [options])

#### input

Type: `string`

Lorem ipsum.

#### options

##### foo

Type: `boolean`  
Default: `false`

Lorem ipsum.


## CLI

```
$ npm install --global gh-contrib
```

```
$ gh-contrib --help

  Usage
    gh-contrib [input]

  Options
    --foo  Lorem ipsum. [Default: false]

  Examples
    $ gh-contrib
    unicorns & rainbows
    $ gh-contrib ponies
    ponies & rainbows
```


## License

MIT © [Richard Littauer](http://burntfen.com)
