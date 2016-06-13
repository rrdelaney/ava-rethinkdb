# Testing utilities for RethinkDB and AVA

```
npm install --save-dev ava-rethinkdb
```

This is a hacky way of using the NodeJS RethinkDB and AVA together. It uses
undocumented features of the RethinkDB driver, and should be considered
experimental.

# Basic Testing

By running `init` and `cleanup` you get a fully managed database instance for
your tests! Everything is cleaned up at the end, so there's no leftover fixtures

```js
import test from 'ava'
import { init, cleanup } from 'ava-rethinkdb'

test.before(init())
test.after.always(cleanup)

test('I should have a RethinkDB instance', async t => {
  let connection = await r.connect({})

  await r.dbCreate('MyDatabase')
})
```

# Seeding

The problem is that if you want to do multiple tests they all happen at the same
time due to the magic of AVA. Luckily you can seed the database with a simple
JSON structure

```js
import test from 'ava'
import { init, cleanup } from 'ava-rethinkdb'

const TEST_DATA = {
  my_database: { // The top level is the database to create
    my_table: [ // Next is a table in the database. This holds an array of documents to insert
      { name: 'A', value: 1},
      { name: 'B', value: 2}
    ],
    users: [
      { username: 'daniel', email: 'wry@gmail.com' },
      { username: 'heya', email: 'ayeh@outlook.com' }
    ]
  }
}

test.before(init(TEST_DATA))
test.after.always(cleanup)

test('These documents should exist', async t => {
  let conn = await r.connect({ db: 'my_database' })
  let results = await r.table('my_table').run(conn)
  let data = await results.toArray()

  console.log(data)
  t.truthy(data)
})
```

# Different database instances
