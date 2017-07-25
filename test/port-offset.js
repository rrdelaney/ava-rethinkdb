import test from 'ava'
import { getPortOffset } from '../'

test('port offsets shouldn\'t exceed the maximum offset', async t => {
  const maxOffset = 65535 - 28015

  t.true(getPortOffset(0) <= maxOffset)
  t.true(getPortOffset(10) <= maxOffset)
  t.true(getPortOffset(maxOffset / 2) <= maxOffset)
  t.true(getPortOffset(maxOffset - 1) <= maxOffset)
  t.true(getPortOffset(maxOffset + 1) <= maxOffset)
  t.true(getPortOffset(maxOffset) <= maxOffset)
  t.true(getPortOffset(maxOffset * 2) <= maxOffset)
  t.true(getPortOffset(maxOffset * 2.5) <= maxOffset)
})
