'use strict'

const { spawn } = require('child_process')
const rimraf = require('rimraf')

let rethink

module.exports.init = initialData => t => new Promise((resolve, reject) => {
  const port = 28015 + process.pid
  const r = require('rethinkdb')

  r.net.Connection.prototype.DEFAULT_PORT = port
  rethink = spawn('rethinkdb', ['-o', `${process.pid}`, '-d', `${process.cwd()}/.db-test-${port}`])

  rethink.stdout.on('data', chunk => {
    if (chunk.toString('utf8').startsWith('Server ready')) {
      if (initialData) {
        importData().then(() => resolve(port))
      } else {
        resolve(port)
      }
    }
  })

  rethink.on('error', reject)

  function importData () {
    let conn
    return r.connect({}).then(_ => { conn = _ })
      .then(() => Promise.all(
        Object.keys(initialData).map(db => r.dbCreate(db).run(conn))
      ))
      .then(() => Promise.all(
        collectTables(initialData).map(([db, table]) => r.db(db).tableCreate(table).run(conn))
      ))
      .then(() => Promise.all(
        collectDocuments(initialData).map(([db, table, doc]) => r.db(db).table(table).insert(doc).run(conn))
      ))
  }
})

module.exports.cleanup = () => {
  rethink.kill()
  rimraf.sync(`${process.cwd()}/.db-test-*`)
}

function collectTables (data) {
  return Object.keys(data)
               .map(db => Object.keys(data[db]).map(table => [db, table]))
               .reduce((a, b) => a.concat(b))
}

function collectDocuments (data) {
  return Object.keys(data)
               .map(db => Object.keys(data[db]).map(table => data[db][table].map(doc => [db, table, doc])))
               .reduce((a, b) => a.concat(b))
               .reduce((a, b) => a.concat(b))
}
