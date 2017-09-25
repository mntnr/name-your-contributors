'use strict';

const graphql = require('./graphql');
const queries = require('./queries');

const nameYourContributors = ({token, user, repo, before, after}) =>
			graphql.executequery(token, queries.repository(repo, user))
			.then(json => queries.cleanRepo(json, before, after));

const reposForOrg = ({token, orgName}) =>
			graphql.executequery(token, queries.organization(orgName))
			.then(queries.cleanOrg);

const nameContributorsToOrg = ({token, orgName, before, after}) =>
	reposForOrg({token, orgName})
			.then(names =>
						names.map(name =>
											nameYourContributors({
												user: orgName,
												repo: name,
												token,
												before,
												after
											})))
			.then(ps => Promise.all(ps))
			.then(queries.mergeRepoResults);

module.exports = {
	nameYourContributors,
	reposForOrg,
	nameContributorsToOrg
};
