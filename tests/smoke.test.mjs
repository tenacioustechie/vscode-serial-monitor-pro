import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: node:test is wired up', () => {
  assert.equal(1 + 1, 2);
});
