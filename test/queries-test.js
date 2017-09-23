'use strict';

import test from 'ava';

const q = require('../src/queries');

const sum = arr => arr.reduce((acc, n) => acc + n, 0);

test('flatten flattens arrays of arrays', t => {
	const a1 = [[1, 2, 0, 2], [2, 3], [4]];
	t.is(sum(q.flatten(a1)), 14);
});

test('flatten only flattens one level deep', t => {
	const a2 = [[[1], [2, 3]], [1]];
	t.is(sum(q.flatten(a2)), '012,31');
});
