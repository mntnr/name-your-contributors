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

test('No contributions in a single second', t => {
  return main.repoContributors({
    token: token,
    user: 'RichardLitt',
    repo: 'name-your-contributors',
    after: new Date('2016-01-01T15:21:08.104Z'),
    before: new Date('2016-01-02T15:21:08.104Z')
  }).then(result => {
    for (let key in result) {
      t.deepEqual(result[key], [])
    }
  })
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
  return main.repoContributors({
    token: token,
    user: 'RichardLitt',
    repo: 'name-your-contributors',
    before: new Date('2017-09-21'),
    after: new Date(0)
  }).then(result => {
    t.true(compareKeys(result, 'prCreators'))
    t.true(compareKeys(result, 'prCommentators'))
    t.true(compareKeys(result, 'issueCreators'))
    t.true(compareKeys(result, 'issueCommentators'))
  })
})

test('Queries without tokens get rejected', t => {
  return main.repoContributors({
    user: 'RichardLitt',
    repo: 'name-your-contributors',
    before: new Date(),
    after: new Date(0)
  }).catch(error => t.is(error.message, 'Unauthorized'))
})

test('user repo names come back', async t => {
  const repos = await main.userRepoNames({token, login: 'tgetgood'})

  console.log(repos)

  t.pass()
})
