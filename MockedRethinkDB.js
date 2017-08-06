const filter = require("lodash.filter");
const map = require("lodash.map");
const flatMap = require("lodash.flatmap");
const rimraf = require("rmfr");
const tmp = require("tmp");

/**
 * @typedef {Object} MockedRethinkDBOptions
 * @property {Number} [port] the port to use for RethinkDB.  If port already taken, will try to use other ports.
 * @property {Object} [initialData] initial data to populate RethinkDB with.
 * @property {String} [internalContext] the `t.context` variable to use for the {@link MockedRethinkDB} instance.
 * @todo Document `initialData` (write more `typedef`s)
*/

/**
 * @todo Listen to `opts.internalContext` for static methods.
*/
class MockedRethinkDB {

  /**
   * Fully mock RethinkDB.
   * @param {MockedRethinkDBOptions} [opts] options to control the spawned instance.
   * @return {Function} to be passed to `test.beforeEach()`.
  */
  static init(opts) {
    return initRethinkDB = t => {
      const mocked = new this(opts);
      t.context._mockedRethinkDB = mocked;
      return mocked
        .spawn()
        .then(() => mocked.hackModule())
        .then(() => mocked.importData());
    };
  }

  /**
   * Unmock RethinkDB.  Pairs with {@link MockedRethinkDB.init}.
   * @param {MockedRethinkDBOptions} [opts] options used to spawn the instance.
   * @return {Function} to be passed to `test.afterEach()`.
  */
  static cleanup(opts) {
    return cleanupRethinkDB = t => {
      if(!t.context._mockedRethinkDB || !t.context._mockedRethinkDB instanceof this) {
        console.warn(`cleanup() can't find a mocked RethinkDB instance.  Found ${t.context._mockedRethinkDB}.`);
        return;
      }
      return t.context._mockedRethinkDB.cleanup();
    }
  }

  /**
   * Sets up a series of `beforeEach()` and `afterEach()` statements to mock RethinkDB and cleanup after tests are
   * completed.
   * @param {MockedRethinkDBOptions} [opts] options used to spawn the instance.
   * @return {void}
   * @todo Improve names for each `beforeEach()`/`afterEach()` stage.  Potentially key off of a generated "short code"
   *   or use the test title if possible.
  */
  static mockRethink(opts) {
    const test = require("ava");
    opts.internalContext = "_mockedRethinkDB";

    test.beforeEach("create MockedRethinkDB instance", t => {
      t.context[opts.internalContext] = new this(opts);
    });

    test.beforeEach("generate temporary RethinkDB storage", t => {
      return t.context[opts.internalContext].storage();
    });

    test.beforeEach("spawn local RethinkDB server", t => {
      return t.context[opts.internalContext].spawn();
    });

    test.beforeEach("hack the 'rethinkdb' package to use local server", t => {
      return t.context[opts.internalContext].hackModule();
    });

    if(opts.initialData) {
      test.beforeEach("populate the RethinkDB server with data", t => {
        return t.context[opts.internalContext].importData();
      });
    }

    test.afterEach.always("shutdown 'rethinkdb' server", t => {
      return t.context[opts.internalContext].shutdown();
    });

    test.afterEach.always("cleanup temporary RethinkDB storage", t => {
      return t.context[opts.internalContext].removeStorage();
    });
  }

  /**
   * @param {Object} opts common options to mocking methods.
  */
  constructor(opts) {
    this.opts = opts;
  }

  /**
   * The port to assign to the spawned RethinkDB process.
   * @return {Object} `{ offset, port }` the offset and port to use.
   * @depreciated should not be used in anything except spawning RethinkDB, so spawn can try different ports if one is
   *   in use.
   * @todo If passed a port (e.g. port in use and we need another), select the next port to try.
  */
  port() {
    if(this.opts.port && this.opts.offset) {
      return {
        offset: this.opts.offset,
        port: this.opts.port,
      };
    }
    const maxOffset = 65535 - 28015;
    const pid = process.pid;
    const offset = pid - (Math.floor(pid / maxOffset) * maxOffset);
    return { offset, port: 28015 + offset };
  }

  /**
   * Creates a temporary storage directory to contain the data for the mock database.
   * @return {Promise<String>} resolves with the path for the storage directory once created.
  */
  storage() {
    if(this._storage) { return this._storage; }
    return this._storage = tmp
      .dir()
      .then(o => {
        this._tmpDirData = o;
        return o.path;
      });
  }

  /**
   * Spawn a new RethinkDB server instance, and wait for it to initialize.
   * @return {Promise<Number>} resolves with the server's listening port when the process has started.
   * @todo Retry with different ports if RethinkDB fails because of a taken port.
  */
  spawn() {
    if(this._spawn) { return this._spawn; }
    return this._spawn = Promise
      .all([
        this.port(),
        this.storage(),
      ])
      .then(([ { offset }, storage ]) => {
        this.spawned = spawn('rethinkdb', ['-o', `${offset}`, '-d', `${storage}`]);
        return this.bootWait(this.spawned).then(() => port);
      });
  }

  /**
   * Hack the `require("rethinkdb")` module to use the mocked server.
   * @return {Promise<RethinkDB>} resolves with the RethinkDB module after it's been modified
  */
  hackModule() {
    if(this._hackedModule) { return this._hackedModule; }
    return this._hackedModule = this
      .spawn()
      .then(port => {
        const r = require("rethinkdb");
        r.net.Connection.prototype.DEFAULT_PORT = port;
        return r;
      });
  }

  /**
   * Import all initial data into the mock database.
   * @return {Promise} resolves when all data is imported.
  */
  importData() {
    if(this._importedData) { return this._importedData; }
    if(!this.initialData) {
      return this._importedData = Promise.resolve();
    }
    return this._importedData = this
      .hackModule()
      .then(() => this.createDatabases())
      .then(() => this.createTables())
      .then(() => this.createDocuments());
  }

  /**
   * Cleans up from the mocked server.
  */
  cleanup() {
    if(this._cleanedup) { return this._cleanedup; }
    return this._cleanedup = this
      .shutdown()
      .then(() => this.removeStorage());
  }

  /**
   * Shuts down the RethinkDB instance.
   * @return {void}
   * @todo Check if actually running
  */
  shutdown() {
    this.spawned.kill();
  }

  /**
   * Cleanup the storage directory used for the database.
   * @return {Promise} resolves after the directory has been removed.
  */
  removeStorage() {
    if(this._removedStorage) { return this._removedStorage; }
    return this._removedStorage = Promise
      .all([
        this.storage(),
        this.shutdown(),
      ])
      .then(rimraf);
  }

  /**
   * Waits for the spawned RethinkDB process to fully initialize.
   * @param {child_process.spawn} spawned the spawned RethinkDB process
   * @return {Promise} resolves when the process has initialized.
   * @private
  */
  bootWait(spawned) {
    return new Promise((resolve, reject) => {
      spawned.stdout.on("data", chunk => {
        if(chunk.toString('utf8').startsWith('Listening for client driver connections')) {
          resolve();
        }
      });
    });
  }

  /**
   * Opens an active connection to the mocked database.
   * @return {Promise<Connection>} resolves with a RethinkDB connection.
  */
  connection() {
    if(this._connection) { return this._connection; }
    return this._connection = this
      .hackModule()
      .then(() => require("rethinkdb"));
  }

  /**
   * Creates the databases included in the initial data.
   * @return {Promise} resolves when all databases have been created.
   * @private
  */
  createDatabases() {
    if(this._createDatabases) { return this._createDatabases; }
    return this._createDatabases = Promise
      .all([
        this.hackModule(),
        this.connection(),
        Object.keys(this.initialDatabases()),
      ])
      .then(([ r, conn, dbs ]) => Promise.all( dbs.map(db => r.dbCreate(db).run(conn)) ));
  }

  /**
   * Create the tables included in the initial data.
   * @return {Promise} resolves when all tables have been created.
   * @private
  */
  createTables() {
    if(this._createTables) { return this._createTables; }
    return this._createTables = Promise
      .all([
        this.hackModule(),
        this.connection(),
        this.initialTables(),
        this.createDatabases(),
      ])
      .then(([ r, conn, tables ]) => Promise.all( tables.map(({ db, table }) => {
        return r.db(db).tableCreate(table).run(conn);
      })));
  }

  /**
   * Create the documents included in the initial data.
   * @return {Promise} resolves when all the documents have been created.
   * @private
  */
  createDocuments() {
    if(this._createDocs) { return this._createDocs; }
    return this._createDocs = Promise
      .all([
        this.hackModule(),
        this.connection(),
        this.initialTables(),
        this.createTables(),
      ])
      .then(([ r, conn, docs ]) => Promise.all( docs.map(({ db, table, doc }) => {
        return r.db(db).table(table).insert(doc).run(conn);
      })));
  }

  /**
   * Filters the initial databases to exclude test databases.
   * @return {Array<Object>} the valid databases.
   * @private
  */
  initialDatabases() {
    return filter(this.initialData, (val, index) => index !== "test");
  }

  /**
   * Reduces the tables from all of the inital databases into `[ { db: "name", table: "name", docs: [ ... ] } ]`.
   * @return {Array} each of the tables in the inital data
   * @private
  */
  initialTables() {
    function flattenDatabase(tables, db) {
      return map(tables, (docs, table) => { db, table, docs });
    }
    return flatMap(this.initialDatabases(), flattenDatabase);
  }

  /**
   * Reduces the documents from all tables in the initial databases into
   * ` [ { db: "name", table: "name", doc: { ... } } ]`
   * @return {Array} each of the tables in the initial data.
   * @private
  */
  initialDocuments() {
    function flattenTable({ db, table, docs }) {
      return map(docs, doc => { db, table, doc });
    }
    return flatMap(this.initialTables(), flattenTable);
  }

}

module.exports = MockedRethinkDB;
