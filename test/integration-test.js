import test from 'ava'

const main = require('../src/index')

const token = process.env.GITHUB_TOKEN

const contribPre = {
  prCreators:
  new Map([
    ['dignifiedquire', 'Friedel Ziegelmayer'],
    ['jozefizso', 'Jozef Izso'],
    ['greenkeeper', undefined],
    ['RichardLitt', 'Richard Littauer']]),
  prCommentators:
  new Map([
    ['dignifiedquire', 'Friedel Ziegelmayer'],
    ['RichardLitt', 'Richard Littauer']]),
  issueCreators:
  new Map([
    ['jbenet', 'Juan Benet'],
    ['gr2m', 'Gregor Martynus'],
    ['kentcdodds', 'Kent C. Dodds'],
    ['RichardLitt', 'Richard Littauer'],
    ['jywarren', 'Jeffrey Warren'],
    ['diasdavid', 'David Dias']]),
  issueCommentators:
  new Map([
    ['RichardLitt', 'Richard Littauer'],
    ['gr2m', 'Gregor Martynus'],
    ['kentcdodds', 'Kent C. Dodds'],
    ['jywarren', 'Jeffrey Warren'],
    ['diasdavid', 'David Dias']])
}

const emptyResponse = {
  prCreators: [],
  prCommentators: [],
  issueCreators: [],
  issueCommentators: []
}

test('No contributions in a single second', t => {
  return main.nameYourContributors({
    token: token,
    user: 'RichardLitt',
    repo: 'name-your-contributors',
    after: '2016-01-01T15:21:08.104Z',
    before: '2016-01-02T15:21:08.104Z'
  }).then(result => t.deepEqual(result, emptyResponse))
})

const compareKeys = (x, k) =>
  x[k].reduce((acc, next) => {
    if (next[0]) {
      return acc && contribPre[k].get(next[0]) === next[1]
    } else {
      return acc
    }
  }, true)

// Note: To be forward compatible we have to jump through some hoops because 1)
// the order in which users comes back from the api changes (an actually seems
// to change day to day, not just in principle), and 2) if a user account is
// ever deleted, then those contributions will cease to come back, so we have to
// be flexible.
test('Contributors before a fixed date remain static', t => {
  return main.nameYourContributors({
    token: token,
    user: 'RichardLitt',
    repo: 'name-your-contributors',
    before: '2017-09-21'
  }).then(result => {
    t.true(compareKeys(result, 'prCreators'))
    t.true(compareKeys(result, 'prCommentators'))
    t.true(compareKeys(result, 'issueCreators'))
    t.true(compareKeys(result, 'issueCommentators'))
  })
})

test('Queries without tokens get rejected', t => {
  return main.nameYourContributors({
    user: 'RichardLitt',
    repo: 'name-your-contributors'
  }).catch(error => t.is(error.message, 'Unauthorized'))
})
