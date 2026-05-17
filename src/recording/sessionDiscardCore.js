'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TOMBSTONE_PREFIX = '.discarded-session-';
const LIVE_PREFIX = 'session-';

function sessionPath(storageRoot, sessionId) {
  return path.join(storageRoot, LIVE_PREFIX + sessionId);
}

function tombstonePath(storageRoot, sessionId) {
  return path.join(storageRoot, TOMBSTONE_PREFIX + sessionId);
}

function softDelete(storageRoot, sessionId) {
  const src = sessionPath(storageRoot, sessionId);
  const dst = tombstonePath(storageRoot, sessionId);
  fs.renameSync(src, dst);
  return dst;
}

function undo(storageRoot, sessionId) {
  const src = tombstonePath(storageRoot, sessionId);
  const dst = sessionPath(storageRoot, sessionId);
  fs.renameSync(src, dst);
  return dst;
}

function finalize(storageRoot, sessionId) {
  const tomb = tombstonePath(storageRoot, sessionId);
  fs.rmSync(tomb, { recursive: true, force: true });
}

function findOrphans(storageRoot) {
  let entries;
  try {
    entries = fs.readdirSync(storageRoot, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const ids = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(TOMBSTONE_PREFIX)) {
      ids.push(entry.name.slice(TOMBSTONE_PREFIX.length));
    }
  }
  return ids;
}

module.exports = {
  TOMBSTONE_PREFIX,
  LIVE_PREFIX,
  sessionPath,
  tombstonePath,
  softDelete,
  undo,
  finalize,
  findOrphans,
};
