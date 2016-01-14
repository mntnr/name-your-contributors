#!/usr/bin/env node
'use strict'
var meow = require('meow')
var ghContrib = require('./')

var cli = meow([
	// 'Usage',
	// '  $ gh-contrib [input]',
	// '',
	// 'Options',
	// '  --foo  Lorem ipsum. [Default: false]',
	// '',
	// 'Examples',
	// '  $ gh-contrib',
	// '  unicorns & rainbows',
	// '  $ gh-contrib ponies',
	// '  ponies & rainbows'
])

ghContrib(cli.input[0] || 'ipfs')
