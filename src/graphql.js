'use strict'

const https = require('https');

/** Escape strings to prevent injection attacks. Other types aren't an issue. */
const escapeArgValue = val => {
	if ('string' === typeof(val)) {
		return  '"' + encodeURIComponent(val) + '"';
	} else {
		return val;
	}
};

const argsString = args => {
	const keys = Object.keys(args);
	if (keys.length === 0) {
		return "";
	} else {
		const s = keys.map(k => {
			return encodeURIComponent(k) + ': ' + escapeArgValue(args[k]) + ',';
		}).reduce((acc, next) => acc + next, '');
		return '(' + s.substr(0, s.length - 1) + ')';
	}
};

const childrenString = (children) => {
	if (children.length === 0) {
		return "";
	} else {
		const s = children.map(itemToString).
					reduce((acc, next) => acc + next + '\n', '');
		return '{' + s + '}';
	}
};

const itemToString = ({name, args, children}) => {
	return encodeURIComponent(name) + argsString(args) + childrenString(children)
};

/**
	* Returns a queryNode object, our wrapper for the structured creation of
	* graphql queries.
	* @param name - the property name from the schema
	* @param args - map of args passed to the property (if required by the
	* schema).
	* @param children - an array of subqueries.
	* @method addChild - factory method to add a child to a node.
	* @method toString - Prints out the query as a string. Required by the runtime
	* for query execution, also handy for debugging.
	*/
const queryNode = (name, args = {}, children = []) => {
	const item = {name, args, children};

	item.addChild = child => {
		return queryNode(name, args, children.concat(child));
	};

	item.toString = () => itemToString(item);

	return item;
};

/** Converts a queryNode object into a valid graphql query string according to
Github's conventions. */
const formatQuery = item => '{"query": ' +
			JSON.stringify('query{' + item.toString() + '}') +'}';

/**
	* Returns a promise which will yeild a query result.
	* @param {string} token - Github auth token
	* @param {queryNode} query - The query to execute
	*/
const executequery = (token, query) => {
	return new Promise((resolve, reject) => {
		let queryResponse = "";
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Accept': '*/*',
			'User-Agent': 'Name-Your-Contributors',
			'Authorization': `bearer ${token}`
		};
		const req = https.request(
			{
				method: 'post',
				headers: headers,
				host: 'api.github.com',
				path : '/graphql'
			},
			res => {
				res.on('error', reject);
				res.on('data', chunk => {
					queryResponse += chunk;
				});
				res.on('end', () => {
					resolve(queryResponse);
				});
			});
		req.on('error', reject);
		req.write(formatQuery(query));
		req.end();
	});
};

module.exports = {
	executequery,
	queryNode
};
