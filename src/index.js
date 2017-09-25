'use strict';

const graphql = require('./graphql');
const queries = require('./queries');

/** Returns all contributions to a repo.
	*	@param token  - GitHub auth token
	* @param user   - Username to whom the repo belongs
	* @param repo   - repo name
	* @param before - only return contributions before this timestamp
	* @param after  - only return contributions after this timestamp
	*/
const nameYourContributors = ({token, user, repo, before, after}) =>
			graphql.executequery(token, queries.repository(repo, user))
			.then(json => queries.cleanRepo(json.repository, before, after));

/** Returns a list of the names of all repos belonging to orgName.
	*	@param token   - GitHub auth token
	* @param orgName - Name of organization
	*/
const reposForOrg = ({token, orgName}) =>
			graphql.executequery(token, queries.organization(orgName))
			.then(queries.cleanOrgNames);

/** Returns contributions to all repos owned by orgName.
	*	@param token   - GitHub auth token
	* @param orgName - Name of organization
	* @param before  - only return contributions before this timestamp
	* @param after   - only return contributions after this timestamp
	*/
const nameContributorsToOrg = ({token, orgName, before, after}) =>
			graphql.executequery(token, queries.orgRepos(orgName))
			.then(data => queries.cleanOrgRepos(data, before, after));

module.exports = {
	nameYourContributors,
	reposForOrg,
	nameContributorsToOrg
};
