import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { isAtEnd, initialCursorMs } = require(path.join(here, '..', 'media', 'playback-core.js'));

test('isAtEnd: returns true when currentTimeMs equals duration', () => {
  assert.equal(isAtEnd(5000, 5000), true);
});

test('isAtEnd: returns true when currentTimeMs is past duration', () => {
  assert.equal(isAtEnd(5500, 5000), true);
});

test('isAtEnd: returns false when currentTimeMs is before duration', () => {
  assert.equal(isAtEnd(4999, 5000), false);
});

test('isAtEnd: returns false when duration is zero', () => {
  // Sessions with no duration shouldn't trigger restart-on-play.
  assert.equal(isAtEnd(0, 0), false);
});

test('isAtEnd: returns false when duration is missing', () => {
  assert.equal(isAtEnd(0, undefined), false);
  assert.equal(isAtEnd(0, null), false);
});

test('isAtEnd: returns false at the start of playback', () => {
  assert.equal(isAtEnd(0, 5000), false);
});

test('initialCursorMs: returns the duration when positive', () => {
  assert.equal(initialCursorMs({ duration: 5000 }), 5000);
});

test('initialCursorMs: returns 0 when duration is 0', () => {
  assert.equal(initialCursorMs({ duration: 0 }), 0);
});

test('initialCursorMs: returns 0 when duration is missing', () => {
  assert.equal(initialCursorMs({}), 0);
});

test('initialCursorMs: returns 0 when duration is null', () => {
  assert.equal(initialCursorMs({ duration: null }), 0);
});

test('initialCursorMs: returns 0 when duration is NaN', () => {
  assert.equal(initialCursorMs({ duration: NaN }), 0);
});

test('initialCursorMs: returns 0 when duration is negative', () => {
  assert.equal(initialCursorMs({ duration: -1 }), 0);
});

test('initialCursorMs: returns 0 when session is null', () => {
  assert.equal(initialCursorMs(null), 0);
});

test('initialCursorMs: returns 0 when session is undefined', () => {
  assert.equal(initialCursorMs(undefined), 0);
});
