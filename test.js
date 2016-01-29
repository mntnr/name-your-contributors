import test from 'ava'
import fn from './'

test('With minimal since and until', t => {
  return fn('opensourcedesign', {
    since: '2016-01-01T15:21:08.104Z',
    until: '2016-01-02T15:21:08.104Z'
  }).then(result => {
    t.same(result, [])
  })
	// TODO add tests
})

test('With a constrained since and until', t => {
  return fn('opensourcedesign', {
    since: '2016-01-01T00:01:01Z',
    until: '2016-01-04T20:00:00Z'
  }).then(result => {
    t.same(result, ['[@bnvk](//github.com/bnvk) (Brennan Novak)', '[@jdittrich](//github.com/jdittrich)'])
  })
})

