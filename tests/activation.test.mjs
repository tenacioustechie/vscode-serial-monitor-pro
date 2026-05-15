import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);

let extension;
let stub;

before(() => {
  const distPath = join(root, 'dist/extension.js');
  if (!existsSync(distPath)) {
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  }

  const stubPath = join(__dirname, 'fixtures/vscode-stub.cjs');
  stub = require(stubPath);

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') return stubPath;
    return origResolve.call(this, request, ...rest);
  };

  extension = require(distPath);
});

test('activate() registers both contributed tree views with non-null providers', async () => {
  await extension.activate({
    subscriptions: [],
    extensionUri: { fsPath: root, toString: () => root },
    globalStorageUri: { fsPath: root, toString: () => root },
    storageUri: { fsPath: root, toString: () => root },
    extensionPath: root,
  });

  const registeredIds = stub._calls.createTreeView
    .map((c) => c.id)
    .filter((id) => id === 'serialMonitorPorts' || id === 'serialMonitorSessions');

  assert.ok(
    registeredIds.includes('serialMonitorPorts'),
    'serialMonitorPorts view must be registered',
  );
  assert.ok(
    registeredIds.includes('serialMonitorSessions'),
    'serialMonitorSessions view must be registered',
  );

  for (const call of stub._calls.createTreeView) {
    assert.ok(
      call.hasProvider,
      `view "${call.id}" was registered without a TreeDataProvider`,
    );
  }
});
