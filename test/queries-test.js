'use strict'

import test from 'ava'

const q = require('../src/queries')

const sum = arr => arr.reduce((acc, n) => acc + n, 0)

test('flatten flattens arrays of arrays', t => {
  const a1 = [[1, 2, 0, 2], [2, 3], [4]]
  t.is(sum(q.flatten(a1)), 14)
})

test('flatten only flattens one level deep', t => {
  const a2 = [[[1], [2, 3]], [1]]
  t.deepEqual(q.flatten(a2), [[1], [2, 3], 1])
})

const dates = [
  { createdAt: new Date('2016-09-24') },
  { createdAt: new Date('2015-09-24') },
  { createdAt: new Date('2014-09-24') },
  { createdAt: new Date('2017-09-24T19:30') },
  { createdAt: new Date('2017-09-24T12:00') },
  { createdAt: new Date('2017-09-24T04:15') }
]

const tf = q.timeFilter
const fdate = new Date('2017-09-24')

test('time filtering granularity', t => {
  t.is(tf(fdate, fdate)(dates).length, 0)
  t.is(tf(new Date('2017-09-24T11:00'), new Date('2017'))(dates).length, 1)
})

test('time filtering <=', t => {
  t.is(tf(fdate, fdate)([{ createdAt: fdate }]).length, 1)
})

test('merge', t => {
  const testusers = [{ login: 'x', count: 1, name: 'x', url: 'x' },
    { login: 'y', count: 1, name: 'x', url: 'x' },
    { login: 'x', count: 3, name: 'x', url: 'x' },
    { login: 'z', count: 2, name: 'x', url: 'x' }]

  t.deepEqual(q.mergeContributions(testusers), [
    { login: 'x', count: 4, name: 'x', url: 'x', email: undefined },
    { login: 'y', count: 1, name: 'x', url: 'x', email: undefined },
    { login: 'z', count: 2, name: 'x', url: 'x', email: undefined }
  ])
  // Objects don't get modified when counting:
  t.deepEqual(q.mergeArrays(testusers, testusers), [
    { login: 'x', count: 8, name: 'x', url: 'x', email: undefined },
    { login: 'y', count: 2, name: 'x', url: 'x', email: undefined },
    { login: 'z', count: 4, name: 'x', url: 'x', email: undefined }
  ])
})

test('extended merge', t => {
  const testusers = [{ author: { login: 'x', name: 'x', url: 'x' }, count: 1, labels: { nodes: [{ name: 'a' }] } },
    { author: { login: 'y', name: 'x', url: 'x' }, count: 1, labels: { nodes: [] } },
    { author: { login: 'x', name: 'x', url: 'x' }, count: 3, labels: { nodes: [{ name: 'b' }] } },
    { author: { login: 'z', name: 'x', url: 'x' }, count: 2, labels: { nodes: [{ name: 'c' }] } }]

  t.deepEqual(q.mergeExtendedContributions(testusers), [
    { login: 'x', count: 4, name: 'x', url: 'x', email: undefined, labels: ['a', 'b'] },
    { login: 'y', count: 1, name: 'x', url: 'x', email: undefined, labels: [] },
    { login: 'z', count: 2, name: 'x', url: 'x', email: undefined, labels: ['c'] }
  ])
})

test('null users get filtered', t => {
  const ulist = [{ author: { login: 'me', name: 'just me' } }, { author: null }]
  t.deepEqual(q.users(ulist), [{ login: 'me', name: 'just me', count: 1 }])
})

const tree = {
  'repository': {
    'homepageUrl': '',
    'name': 'name-your-contributors',
    'owner': {
      'login': 'mntnr'
    },
    'pullRequests': [
      {
        'title': 'Cli updates',
        'number': 43,
        'state': 'MERGED',
        'author': {
          'login': 'tgetgood',
          'name': 'Thomas Getgood',
          'url': 'https://github.com/tgetgood'
        },
        'createdAt': '2017-10-26T19:48:39Z',
        'comments': [
          {
            'author': {
              'login': 'RichardLitt',
              'name': 'Richard Littauer',
              'url': 'https://github.com/RichardLitt'
            },
            'createdAt': '2017-11-20T16:35:31Z'
          },
          {
            'author': {
              'login': 'tgetgood',
              'name': 'Thomas Getgood',
              'url': 'https://github.com/tgetgood'
            },
            'createdAt': '2017-11-21T21:05:15Z'
          },
          {
            'author': {
              'login': 'RichardLitt',
              'name': 'Richard Littauer',
              'url': 'https://github.com/RichardLitt'
            },
            'createdAt': '2017-11-22T10:50:51Z'
          },
          {
            'author': {
              'login': 'tgetgood',
              'name': 'Thomas Getgood',
              'url': 'https://github.com/tgetgood'
            },
            'createdAt': '2017-11-22T15:47:46Z'
          },
          {
            'author': {
              'login': 'RichardLitt',
              'name': 'Richard Littauer',
              'url': 'https://github.com/RichardLitt'
            },
            'createdAt': '2017-11-22T15:58:52Z'
          },
          {
            'author': {
              'login': 'tgetgood',
              'name': 'Thomas Getgood',
              'url': 'https://github.com/tgetgood'
            },
            'createdAt': '2017-11-24T01:53:14Z'
          },
          {
            'author': {
              'login': 'RichardLitt',
              'name': 'Richard Littauer',
              'url': 'https://github.com/RichardLitt'
            },
            'createdAt': '2017-11-27T17:52:07Z'
          }
        ],
        'reviews': []
      }
    ],
    'issues': []
  }
}

test('time filtering in full mode', t => {
  const before = new Date('2017-11-23')
  const after = new Date('2017-11-21')
  const out = q.timeFilterFullTree(tree, before, after)
  t.is(out.repository.pullRequests[0].comments.length, 4)
})

test('Recursive filtering in full mode', t => {
  const date = new Date('2017-11-10')
  t.is(q.timeFilterFullTree(tree, date, date), null)
})
