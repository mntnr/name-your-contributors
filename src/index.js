'use strict';

const graphql = require('./graphql');
const queries = require('./queries');

const queryAll = ({token, user, repo, before, after}) =>
	graphql.executequery(token, queries.everything(repo, user))
		.then(JSON.parse)
		.then(json => queries.cleanData(json, before, after));

module.exports = {
	queryAll
};
