import test from "ava";
import r from 'rethinkdb';
import { init, cleanup } from '../../';

test.before('Initialize DB', init());
test.after.always('Teardown DB', cleanup);

test("connects to database", async t => {
  let connection = await r.connect({});
  t.true(connection.open);
});
