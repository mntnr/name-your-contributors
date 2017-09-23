'use strict';

const node = require('./graphql').queryNode;

const authoredQ = node('nodes')
			.addChild(node('author')
								.addChild(node('login'))
								.addChild(node('url')))
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

const everything = (repoName, ownerName) =>
			node('repository', {name: repoName, owner: ownerName})
			.addChild(node('pullRequests', {first: 100}, multiQs))
			.addChild(node('issues', {first: 100}, multiQs));

const timeFilter = (before, after) =>
			data => data.filter(x => {
				const date = new Date(x.createdAt);
				return after <= date && date <= before;
			});

const users = arr =>
	arr.map(x => x.author)
			// Get rid of null authors (weird GitHub problem)
			// Deleted accounts maybe?
			.filter(x => !(null === x || undefined === x))
			.map(x => [x.login, x.url]);

const flatten = arr => arr.reduce((acc, next) => acc.concat(next), []);

const comments = x => flatten(x.map(x => x.comments.nodes));

const uniquify = xs => Array.from(new Map(xs).entries());

const cleanData = (result, b, a) => {
	const before = b && new Date(b) || new Date();
	const after = a && new Date(a) || new Date(0);

	const tf = timeFilter(before, after);
	const process = x => uniquify(users(tf(x)));

	const prs = result.data.repository.pullRequests.nodes;
	const issues = result.data.repository.issues.nodes;

	return {
		prCreators: process(prs),
		prCommentators: process(comments(prs)),
		issueCreators: process(issues),
		issueCommentators: process(comments(issues))
	};
};

module.exports = {
	everything,
	timeFilter,
	flatten,
	users,
	cleanData
};
