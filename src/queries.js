'use strict';

const node = require('./graphql').queryNode;

const authoredQ = node('nodes').
			addChild(node('author').
								addChild(node('login')).
								addChild(node('url'))).
			addChild(node('createdAt'));

const participantsQ = authoredQ.
			addChild(node('comments', {first: 100}).
							 addChild(node('totalCount')).
							 // addChild(node('pageInfo').
							 //          addChild(node('endCursor'))),
							 addChild(authoredQ));

const multiQs = [node('totalCount'),
								 node('pageInfo').addChild(node('endCursor')),
								 participantsQ];

const everything = (repoName, ownerName) =>
			node('repository', {name: repoName, owner: ownerName}).
			addChild(node('pullRequests', {first: 100}, multiQs)).
			addChild(node('issues', {first: 100}, multiQs));

const timeFilter = (before = new Date(), since = new Date(0)) =>
			(data) => data.filter((x) => since <= x.createdAt <= before);

const user = x => {
	return [x.author.login, x.author.url];
};

const comments = x => x.map(x => x.comments.nodes.map(user)).
			reduce((arr, next) => arr.concat(next), []);

const uniquify = xs => Array.from(new Map(xs).entries());

const cleanData = result => {
	const prs = result.data.repository.pullRequests.nodes;
	const issues = result.data.repository.issues.nodes;

	return {prCreators: uniquify(prs.map(user)),
					prCommentators: uniquify(comments(prs)),
					issueCreators: uniquify(issues.map(user)),
					issueCommentators: uniquify(comments(issues))};
};

module.exports = {
	everything,
	cleanData
};
