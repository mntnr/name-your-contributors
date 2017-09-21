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

const timeFilter = (before = new Date(), after = new Date(0)) =>
			data => data.filter(x => after <= x.createdAt <= before);

const users = arr =>
	arr.map(x => x.author)
			// Get rid of null authors (weird GitHub problem)
			// Deleted accounts maybe?
			.filter(x => !(null === x || undefined === x))
			.map(x => [x.login, x.url]);

const flatten = arr => arr.reduce((acc, next) => acc.concat(next), []);

const comments = x => flatten(x.map(x => x.comments.nodes));

const uniquify = xs => Array.from(new Map(xs).entries());

const cleanData = result => {
	const prs = result.data.repository.pullRequests.nodes;
	const issues = result.data.repository.issues.nodes;

	return {
		prCreators: uniquify(users(prs)),
		prCommentators: uniquify(users(comments(prs))),
		issueCreators: uniquify(users(issues)),
		issueCommentators: uniquify(users(comments(issues)))
	};
};

module.exports = {
	everything,
	cleanData
};
