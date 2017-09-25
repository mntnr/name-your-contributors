'use strict';

const graphql = require('./graphql');
const queries = require('./queries');

const nameYourContributors = ({token, user, repo, before, after}) =>
	graphql.executequery(token, queries.everything(repo, user))
		.then(json => queries.cleanData(json, before, after));

module.exports = {
	nameYourContributors
};
