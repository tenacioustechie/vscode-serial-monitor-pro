import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const core = require(path.join(here, '..', 'src', 'recording', 'sessionDiscardCore.js'));

function makeStorage() {
  return mkdtempSync(path.join(tmpdir(), 'smp-discard-'));
}

function makeSession(root, id) {
  const dir = path.join(root, `session-${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id }), 'utf8');
  return dir;
}

test('softDelete renames session-<id> to .discarded-session-<id>', () => {
  const root = makeStorage();
  try {
    const dir = makeSession(root, 'aaa');
    const tomb = core.softDelete(root, 'aaa');
    assert.equal(existsSync(dir), false);
    assert.equal(existsSync(tomb), true);
    assert.equal(tomb, path.join(root, '.discarded-session-aaa'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('undo renames .discarded-session-<id> back to session-<id>', () => {
  const root = makeStorage();
  try {
    const dir = makeSession(root, 'bbb');
    const tomb = core.softDelete(root, 'bbb');
    core.undo(root, 'bbb');
    assert.equal(existsSync(dir), true);
    assert.equal(existsSync(tomb), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('finalize removes the tombstone directory', () => {
  const root = makeStorage();
  try {
    makeSession(root, 'ccc');
    core.softDelete(root, 'ccc');
    core.finalize(root, 'ccc');
    assert.equal(existsSync(path.join(root, '.discarded-session-ccc')), false);
    assert.equal(existsSync(path.join(root, 'session-ccc')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('softDelete on missing session throws ENOENT', () => {
  const root = makeStorage();
  try {
    assert.throws(() => core.softDelete(root, 'missing'), { code: 'ENOENT' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('undo when no tombstone exists throws ENOENT', () => {
  const root = makeStorage();
  try {
    assert.throws(() => core.undo(root, 'missing'), { code: 'ENOENT' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('finalize is a no-op when no tombstone exists', () => {
  const root = makeStorage();
  try {
    core.finalize(root, 'never-existed');
    assert.equal(existsSync(path.join(root, '.discarded-session-never-existed')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findOrphans lists every .discarded-session-* directory', () => {
  const root = makeStorage();
  try {
    makeSession(root, 'keep');
    makeSession(root, 'd1');
    makeSession(root, 'd2');
    core.softDelete(root, 'd1');
    core.softDelete(root, 'd2');
    const orphans = core.findOrphans(root).sort();
    assert.deepEqual(orphans, ['d1', 'd2']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findOrphans returns [] when storage dir does not exist', () => {
  const orphans = core.findOrphans(path.join(tmpdir(), 'smp-nope-' + Date.now()));
  assert.deepEqual(orphans, []);
});
