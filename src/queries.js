'use strict';

const node = require('./graphql').queryNode;

/////
// Queries
/////

const authoredQ = node('nodes')
			.addChild(node('author')
								.addChild(node('login'))
								.addChild(node('... on User')
													.addChild(node('name'))))
			.addChild(node('createdAt'));

const participantsQ = authoredQ
			.addChild(node('comments', {first: 100})
								.addChild(node('totalCount'))
								.addChild(node('pageInfo')
													.addChild(node('endCursor')))
								.addChild(authoredQ));

const multiQs = [
	node('totalCount'),
	node('pageInfo').addChild(node('endCursor')),
	participantsQ
];

/** Returns a query to retrieve all contributors to a repo */
const repository = (repoName, ownerName) =>
			node('repository', {name: repoName, owner: ownerName})
			.addChild(node('pullRequests', {first: 100}, multiQs))
			.addChild(node('issues', {first: 100}, multiQs));

const organization = name =>
			node('organization', {login: name})
			.addChild(node('repositories', {first: 100})
								.addChild(node('nodes')
													.addChild(node('name'))));

/////
// Data Filtering (co-queries if you will)
/////

const timeFilter = (before = new Date(), after = new Date(0)) =>
			data => data.filter(x => {
				const date = new Date(x.createdAt);
				return after <= date && date <= before;
			});

const users = arr =>
	arr.map(x => x.author)
			// Get rid of null authors (weird GitHub problem)
			// Deleted accounts maybe?
			.filter(x => !(null === x || undefined === x))
			.map(x => [x.login, x.name]);

const flatten = arr => arr.reduce((acc, next) => acc.concat(next), []);

const comments = x => flatten(x.map(x => x.comments.nodes));

const uniquify = xs => Array.from(new Map(xs).entries());

const cleanRepo = (result, before, after) => {

	const tf = timeFilter(before, after);
	const process = x => uniquify(users(tf(x)));

	const prs = result.repository.pullRequests.nodes;
	const issues = result.repository.issues.nodes;

	return {
		prCreators: process(prs),
		prCommentators: process(comments(prs)),
		issueCreators: process(issues),
		issueCommentators: process(comments(issues))
	};
};

const mergeRepoResults = repos =>
			repos.reduce((
				acc, {
					prCreators,
					prCommentators,
					issueCreators,
					issueCommentators}) => {
						return {
							prCreators: acc.prCreators.concat(prCreators),
							prCommentators: acc.prCommentators.concat(prCommentators),
							issueCreators: acc.issueCreators.concat(issueCreators),
							issueCommentators: acc.issueCommentators.concat(issueCommentators)
						}}, {
							prCreators: [],
							prCommentators: [],
							issueCreators: [],
							issueCommentators: []
						});

const cleanOrg = data =>
			flatten(data.organization.repositories.nodes).
			map(x => x.name);

module.exports = {
	repository,
	organization,
	cleanOrg,
	timeFilter,
	uniquify,
	flatten,
	users,
	cleanRepo,
	mergeRepoResults,
	authoredQ
};
