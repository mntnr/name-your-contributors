import test from 'ava';

const main = require('../src/index');

const token = process.env.GITHUB_TOKEN;

const contribPre = {
	prCreators: [
		['dignifiedquire', 'https://github.com/dignifiedquire'],
		['jozefizso', 'https://github.com/jozefizso'],
		['greenkeeper', 'https://github.com/apps/greenkeeper']
	],
	prCommentators: [
		['dignifiedquire', 'https://github.com/dignifiedquire'],
		['RichardLitt', 'https://github.com/RichardLitt']
	],
	issueCreators: [
		['jbenet', 'https://github.com/jbenet'],
		['gr2m', 'https://github.com/gr2m'],
		['kentcdodds', 'https://github.com/kentcdodds'],
		['RichardLitt', 'https://github.com/RichardLitt'],
		['jywarren', 'https://github.com/jywarren'],
		['diasdavid', 'https://github.com/diasdavid']
	],
	issueCommentators: [
		['RichardLitt', 'https://github.com/RichardLitt'],
		['gr2m', 'https://github.com/gr2m'],
		['kentcdodds', 'https://github.com/kentcdodds'],
		['jywarren', 'https://github.com/jywarren'],
		['diasdavid', 'https://github.com/diasdavid']
	]
};

const emptyResponse = {
	prCreators: [],
	prCommentators: [],
	issueCreators: [],
	issueCommentators: []
};

test('No contributions in a single second', t => {
	return main.queryAll({
		token: token,
		user: 'RichardLitt',
		repo: 'name-your-contributors',
		after: '2016-01-01T15:21:08.104Z',
		before: '2016-01-02T15:21:08.104Z'
	}).then(result => t.deepEqual(result, emptyResponse));
});

// Note: this is not a very good test, since it will fail if one of the accounts
// above is deleted (user will become null)
test('Contributors before a fixed date remain static', t => {
	return main.queryAll({
		token: token,
		user: 'RichardLitt',
		repo: 'name-your-contributors',
		before: '2017-09-21'
	}).then(result => t.deepEqual(result, contribPre));
});

test('Queries without tokens get rejected', t => {
	return main.queryAll({
		user: 'RichardLitt',
		repo: 'name-your-contributors'
	}).catch(error => t.is(error.statusCode, 401));
});
