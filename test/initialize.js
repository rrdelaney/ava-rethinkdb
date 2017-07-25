import test from 'ava'
import r from 'rethinkdb'
import { init, cleanup } from '../'

const TEST_DATA = {
  fp: {
    users: [
      { name: 'UserA' },
      { name: 'UserB' }
    ]
  },
  meta: {
    data: [
      { something: true }
    ]
  },
  test: {
    data: [
      { something: true }
    ]
  }
}

test.before('Initialize DB', init(TEST_DATA))
test.after.always('Teardown DB', cleanup)

async function shouldDatabaseExist (t, input, expected) {
  let conn = await r.connect({})
  let databases = await r.dbList().run(conn)

  if (expected) {
    t.true(databases.indexOf(input) !== -1)
  } else {
    t.true(databases.indexOf(input) === -1)
  }
}

shouldDatabaseExist.title = (_, input, expected) => `Database ${input} should${expected ? '' : "n't"} exist`

test(shouldDatabaseExist, 'fp', true)
test(shouldDatabaseExist, 'meta', true)
test(shouldDatabaseExist, 'test', true)
test(shouldDatabaseExist, 'sugar', false)

async function shouldUserExist (t, name, expected) {
  let conn = await r.connect({ db: 'fp' })
  let [ user ] = await r.table('users').filter({ name }).run(conn).then(_ => _.toArray())

  if (expected) {
    t.truthy(user, `${name} should exist`)
  } else {
    t.falsy(user, `${name} should not exist`)
  }
}

shouldUserExist.title = (_, input, expected) => `${input} should${expected ? '' : "n't"} exist`

test(shouldUserExist, 'UserA', true)
test(shouldUserExist, 'UserB', true)
test(shouldUserExist, 'UserC', false)
test(shouldUserExist, 'UserD', false)
