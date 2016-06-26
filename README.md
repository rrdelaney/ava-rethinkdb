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

# Different Database Instances

This is where the magic really is. Every single test file is given its own
RethinkDB instance. This makes it perfect for integration tests against
endpoints, because now they can all be used in parallel! The magic comes
from modifying the default port the driver looks at, making it different
in each process, then spinning up a RethinkDB instance at that port.
Check out the `test` directory for a good example.

```js
// app.js

const express = require('express')
const r = require('rethinkdb')

let app = express()

app.get('/users', (req, res) => {
  r.connect({ db: 'app' })
    .then(conn => r.table('users').run(conn))
    .then(results => results.toArray())
    .then(users => res.status(200).send({ users }))
    .catch(e => res.status(500).send(e))
})

module.exports = { app }
```

```js
// test/integration/users-test-1.js
import test from 'ava'
import request from 'supertest-as-promised'
import { init, cleanup } from 'ava-rethinkdb'

import { app } from '../../app.js'

const TEST_DATA = {
  app: {
    users: [
      { name: 'UserA' },
      { name: 'UserB' }
    ]
  }
}

test('Users should be returned from /users', t => {
  return request(app)
    .get('/users')
    .expect(200)
})
```

```js
// test/integration/users-test-2.js
import test from 'ava'
import request from 'supertest-as-promised'
import { init, cleanup } from 'ava-rethinkdb'

import { app } from '../../app.js'

const TEST_DATA = {
  app: {
    users: [
      { name: 'UserC' },
      { name: 'UserD' }
    ]
  }
}

test('Different users should be returned from /users', t => {
  return request(app)
    .get('/users')
    .expect(200)
})
```

The `TEST_DATA` contained in each file creates a new database to be used for
each file!

# Debugging

To view the output from all the server logs, set the environment variable
`AVA_RETHINKDB_DEBUG=on`