# Fix Marketplace "No Data Provider" Error Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the runtime error "There is no data provider registered that can provide view data" in the marketplace-installed extension, and add regression tests so the bug class cannot recur.

**Architecture:** The root cause is that `.vscodeignore` excludes all of `node_modules/**`, but `esbuild` marks `serialport`, `@serialport/bindings-cpp`, and `node-record-lpcm16` as `external` (not bundled). When the `.vsix` is installed from the marketplace, `require('serialport')` throws `MODULE_NOT_FOUND` at module load, the extension never reaches `activate()`, and the contributed views are left without a registered `TreeDataProvider`. Fix is three-layer: (1) ship the required runtime modules in the `.vsix` by adding negation patterns to `.vscodeignore`; (2) make runtime imports of `serialport` lazy and wrap `activate()` in defensive error handling so a future load failure surfaces a real error message instead of an orphan view; (3) lock the invariants with static and packaging tests run by CI before publish.

**Tech Stack:** TypeScript, esbuild (bundler), `@vscode/vsce` (packaging), `node:test` + `node:assert/strict` (tests), GitHub Actions (CI).

---

## File Structure

**Modify:**
- `.vscodeignore` — keep external runtime deps in the published `.vsix`
- `package.json` — add explicit `activationEvents`; add `package:verify` script
- `src/extension.ts` — move `serialport` to dynamic import; wrap `activate()` body in try/catch
- `src/serialPort/serialPortManager.ts` — dynamic import of `serialport` inside `refresh()`
- `.github/workflows/publish-extension.yml` — run `npm run package:verify` before publish

**Create:**
- `tests/manifest.test.mjs` — static invariants between `package.json`, `esbuild.js`, `.vscodeignore`, and `src/extension.ts`
- `tests/packaging.integration.mjs` — end-to-end: run `vsce package`, unzip, assert runtime deps + dist are present and the bundle is loadable. **Named `.integration.mjs` (not `.test.mjs`) so it does not match the `tests/*.test.mjs` glob in `npm test`** — it is invoked separately via `npm run package:verify`.
- `tests/activation.test.mjs` — call `activate()` with a stubbed `vscode`; assert both tree views are registered with non-null providers before any other work
- `tests/fixtures/vscode-stub.cjs` — minimal `vscode` API stub used only by `activation.test.mjs` (CJS so `dist/extension.js` can `require('vscode')` synchronously)

---

## Task 1: Static Manifest Consistency Test (failing first)

**Files:**
- Create: `tests/manifest.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/manifest.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const esbuildSrc = readFileSync(join(root, 'esbuild.js'), 'utf8');
const ignoreSrc = readFileSync(join(root, '.vscodeignore'), 'utf8');
const extSrc = readFileSync(join(root, 'src/extension.ts'), 'utf8');

function parseExternals(src) {
  const m = src.match(/external:\s*\[([\s\S]*?)\]/);
  assert.ok(m, 'esbuild.js must declare an `external` array');
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

const externals = parseExternals(esbuildSrc).filter((n) => n !== 'vscode');

test('every esbuild external (except vscode) is a runtime dependency', () => {
  const deps = pkg.dependencies ?? {};
  for (const name of externals) {
    assert.ok(deps[name], `"${name}" is external in esbuild.js but missing from package.json dependencies`);
  }
});

test('.vscodeignore preserves every external runtime dep', () => {
  for (const name of externals) {
    const re = new RegExp(`^!\\s*node_modules/${name.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}/\\*\\*`, 'm');
    assert.match(
      ignoreSrc,
      re,
      `.vscodeignore must contain "!node_modules/${name}/**" so the module ships in the .vsix`,
    );
  }
});

test('every contributed view is registered via createTreeView in extension.ts', () => {
  const contributed = Object.values(pkg.contributes?.views ?? {})
    .flat()
    .map((v) => v.id);
  assert.ok(contributed.length > 0, 'package.json must contribute at least one view');
  for (const viewId of contributed) {
    const re = new RegExp(`createTreeView\\(\\s*['"]${viewId}['"]`);
    assert.match(
      extSrc,
      re,
      `view "${viewId}" is contributed in package.json but never registered with createTreeView() in src/extension.ts`,
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="vscodeignore preserves"`
Expected: FAIL — current `.vscodeignore` contains `node_modules/**` with no negations, so the `!node_modules/serialport/**` assertion fails. The other two assertions should already pass.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/manifest.test.mjs
git commit -m "test: assert packaging invariants between package.json, esbuild, and .vscodeignore"
```

---

## Task 2: Fix `.vscodeignore` to Ship Runtime Deps

**Files:**
- Modify: `.vscodeignore`

- [ ] **Step 1: Enumerate transitive runtime deps**

Run: `npm ls --omit=dev --all --parseable | sed 's#.*/node_modules/##' | sort -u`

Expected: a list of every package that the production install pulls in. Record it — you'll need it for the negation patterns. At time of writing the runtime tree includes `serialport`, the entire `@serialport/*` scope (parsers and bindings), `node-record-lpcm16`, `debug`, `ms`, and `node-addon-api`. If your output differs, use yours.

- [ ] **Step 2: Replace `.vscodeignore` with selective exclusion**

Replace the contents of `.vscodeignore` with:

```
.vscode/**
src/**
*.ts
tsconfig.json
esbuild.js
.eslintrc*
.gitignore
test/**
tests/**
CLAUDE.md
DEPLOYMENT.md
DEVELOPMENT.md
.claude/
.github/
.superpowers/
.worktrees/
docs-site/
test-arduino/
docs/

# Exclude all of node_modules by default, but keep the runtime externals
# declared in esbuild.js and their transitive dependencies.
node_modules/**
!node_modules/serialport/**
!node_modules/@serialport/**
!node_modules/node-record-lpcm16/**
!node_modules/debug/**
!node_modules/ms/**
!node_modules/node-addon-api/**
```

If Step 1 surfaced any additional transitive runtime deps not listed above, add a `!node_modules/<name>/**` line for each.

- [ ] **Step 3: Run the manifest test to verify it now passes**

Run: `npm test`
Expected: PASS — all three tests in `manifest.test.mjs` pass.

- [ ] **Step 4: Commit**

```bash
git add .vscodeignore
git commit -m "fix: ship serialport and other runtime externals in published .vsix"
```

---

## Task 3: Packaging Integrity Test

**Files:**
- Create: `tests/packaging.integration.mjs`
- Modify: `package.json` (add `package:verify` script)

- [ ] **Step 1: Add `package:verify` script**

In `package.json` `scripts`, add a `package:verify` entry alongside `build` and `test`:

```json
"scripts": {
  "vscode:prepublish": "npm run build",
  "build": "node esbuild.js --production",
  "watch": "node esbuild.js --watch",
  "lint": "eslint src --ext ts",
  "test": "node --test tests/*.test.mjs",
  "package:verify": "npm run build && node --test tests/packaging.integration.mjs"
}
```

The packaging test is excluded from the default `npm test` (it is slow — it runs `vsce package`) and runs as its own CI step.

- [ ] **Step 2: Write the packaging test**

Create `tests/packaging.integration.mjs`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let workdir;
let extDir;

before(() => {
  workdir = mkdtempSync(join(tmpdir(), 'smp-pkg-'));
  const vsix = join(workdir, 'test.vsix');

  execFileSync(
    'npx',
    ['--yes', '@vscode/vsce', 'package', '--out', vsix],
    { cwd: root, stdio: 'inherit' },
  );

  extDir = join(workdir, 'unpacked');
  execFileSync('unzip', ['-q', vsix, '-d', extDir]);
});

after(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

test('packaged .vsix contains the bundled extension entry', () => {
  assert.ok(existsSync(join(extDir, 'extension/dist/extension.js')));
});

test('packaged .vsix contains serialport and bindings-cpp', () => {
  assert.ok(
    existsSync(join(extDir, 'extension/node_modules/serialport/package.json')),
    'serialport must be present in the published package',
  );
  assert.ok(
    existsSync(join(extDir, 'extension/node_modules/@serialport/bindings-cpp/package.json')),
    '@serialport/bindings-cpp must be present in the published package',
  );
});

test('packaged extension resolves all externals from its own node_modules', () => {
  const esbuildSrc = readFileSync(join(root, 'esbuild.js'), 'utf8');
  const m = esbuildSrc.match(/external:\s*\[([\s\S]*?)\]/);
  const externals = [...m[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((x) => x[1])
    .filter((n) => n !== 'vscode');

  const result = spawnSync(
    process.execPath,
    [
      '-e',
      externals.map((n) => `require.resolve(${JSON.stringify(n)});`).join('\n'),
    ],
    { cwd: join(extDir, 'extension'), encoding: 'utf8' },
  );

  assert.equal(
    result.status,
    0,
    `One or more externals failed to resolve from the packaged extension:\n${result.stderr}`,
  );
});
```

Notes for the implementer:
- `unzip` is available on macOS and Ubuntu (which the CI runs on). If you ever add Windows CI, swap to `tar -xf` (Win10+ tar supports zip) or extract via a small Node helper.

- [ ] **Step 3: Run the packaging test**

Run: `npm run package:verify`
Expected: PASS — `.vsix` is built, all required `node_modules` paths exist, and every external resolves from the packaged extension's own `node_modules`.

- [ ] **Step 4: Commit**

```bash
git add tests/packaging.integration.mjs package.json
git commit -m "test: end-to-end packaging verification with vsce + node_modules checks"
```

---

## Task 4: Make `serialport` Imports Lazy

**Files:**
- Modify: `src/extension.ts` (remove top-level import; dynamic import inside `showPortQuickPick`)
- Modify: `src/serialPort/serialPortManager.ts` (dynamic import inside `refresh()`)

Why: today, `require('serialport')` runs at module load. If `serialport` is ever unresolvable (missing native bindings on a platform, partial install, etc.), the entire extension fails to load and the tree views become orphan. Lazy imports localize that failure to the feature that actually needs the module — the existing `try/catch` in `refresh()` already shows a user-visible error in that case.

- [ ] **Step 1: Remove top-level `serialport` import in extension.ts**

In `src/extension.ts`, delete line 7:

```ts
import { SerialPort } from 'serialport';
```

- [ ] **Step 2: Use dynamic import inside `showPortQuickPick`**

In `src/extension.ts`, change the body of `showPortQuickPick`. Replace:

```ts
async function showPortQuickPick(
  portManager: SerialPortManager,
  extensionUri: vscode.Uri,
  sessionRecorder: SessionRecorder,
) {
  await portManager.refresh();

  const ports = await SerialPort.list();
```

with:

```ts
async function showPortQuickPick(
  portManager: SerialPortManager,
  extensionUri: vscode.Uri,
  sessionRecorder: SessionRecorder,
) {
  await portManager.refresh();

  const { SerialPort } = await import('serialport');
  const ports = await SerialPort.list();
```

- [ ] **Step 3: Use dynamic import inside `SerialPortManager.refresh`**

In `src/serialPort/serialPortManager.ts`, delete line 2:

```ts
import { SerialPort } from 'serialport';
```

Then change `refresh()` to import on demand. Replace:

```ts
  async refresh(): Promise<void> {
    try {
      const portList = await SerialPort.list();
```

with:

```ts
  async refresh(): Promise<void> {
    try {
      const { SerialPort } = await import('serialport');
      const portList = await SerialPort.list();
```

- [ ] **Step 4: Build and lint to confirm nothing else referenced the import**

Run: `npm run build && npm run lint`
Expected: both succeed. If lint complains about unused import `SerialPort` anywhere else, remove that reference.

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/serialPort/serialPortManager.ts
git commit -m "refactor: lazy-load serialport so a missing native module no longer breaks activate()"
```

---

## Task 5: Defensive `activate()` + Activation Resilience Test

**Files:**
- Create: `tests/fixtures/vscode-stub.cjs`
- Create: `tests/activation.test.mjs`
- Modify: `src/extension.ts` (wrap `activate` body in try/catch)

- [ ] **Step 1: Create the `vscode` stub fixture (CommonJS)**

Create `tests/fixtures/vscode-stub.cjs`. It must be CJS because the bundled `dist/extension.js` does `require('vscode')` synchronously — CJS cannot synchronously load ESM.

```js
// Minimal `vscode` API surface used by src/extension.ts.
// Tracks createTreeView and registerCommand calls so tests can assert against them.

const _calls = {
  createTreeView: [],
  registerCommand: [],
  errors: [],
};

class EventEmitter {
  constructor() {
    this.event = () => ({ dispose() {} });
  }
  fire() {}
  dispose() {}
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class ThemeIcon {
  constructor(id) { this.id = id; }
}

const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

const window = {
  createTreeView(id, opts) {
    _calls.createTreeView.push({ id, hasProvider: !!(opts && opts.treeDataProvider) });
    return { dispose() {} };
  },
  showErrorMessage(msg) { _calls.errors.push(msg); return Promise.resolve(undefined); },
  showWarningMessage() { return Promise.resolve(undefined); },
  showInformationMessage() { return Promise.resolve(undefined); },
  showInputBox() { return Promise.resolve(undefined); },
  showQuickPick() { return Promise.resolve(undefined); },
};

const commands = {
  registerCommand(id /* , cb */) {
    _calls.registerCommand.push(id);
    return { dispose() {} };
  },
};

const Uri = { file: (p) => ({ fsPath: p, toString: () => p }) };

module.exports = {
  _calls,
  window,
  commands,
  EventEmitter,
  TreeItem,
  ThemeIcon,
  TreeItemCollapsibleState,
  Uri,
};
```

- [ ] **Step 2: Write the activation test**

Create `tests/activation.test.mjs`:

```js
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
  // Ensure the bundle exists before we try to require it. Only build when missing
  // so `npm test` stays fast in the inner-loop.
  const distPath = join(root, 'dist/extension.js');
  if (!existsSync(distPath)) {
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  }

  const stubPath = join(__dirname, 'fixtures/vscode-stub.cjs');
  stub = require(stubPath);

  // Intercept `require('vscode')` from dist/extension.js so it resolves to our stub.
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') return stubPath;
    return origResolve.call(this, request, ...rest);
  };

  extension = require(join(root, 'dist/extension.js'));
});

test('activate() registers both contributed tree views with non-null providers', async () => {
  await extension.activate({
    subscriptions: [],
    extensionUri: { fsPath: root, toString: () => root },
    // Provide a minimal globalStorageUri / storageUri in case SessionStorage reads them.
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
```

Notes for the implementer:
- After Task 4 (lazy imports), `serialport` is not loaded during `activate()`, so we don't need to stub it. This test locks in the invariant that **both contributed view IDs are registered with a non-null `TreeDataProvider` whenever `activate()` returns successfully**. Combined with the defensive try/catch added in Step 4 below, this means a future synchronous failure during init can no longer leave the views unregistered.
- The test allows extra `createTreeView` calls beyond the two we require (the defensive pattern in Step 4 first registers placeholders, then disposes and replaces them — so there may be 2 *or* 4 calls in total).

- [ ] **Step 3: Run the activation test to verify the current behavior**

Run: `node --test tests/activation.test.mjs`
Expected: this test should already pass after Task 4 (because no top-level import touches `serialport` anymore). If it fails, the failure should be visible — proceed to Step 4 to add the defensive guard.

- [ ] **Step 4: Wrap `activate()` body in defensive try/catch**

In `src/extension.ts`, change `activate` so that any synchronous throw during construction still leaves both tree views registered with a placeholder provider and surfaces a real error to the user. Replace the existing function body with:

```ts
export async function activate(context: vscode.ExtensionContext) {
  console.log('Serial Monitor Pro is now active');

  // Register both tree views up front with a placeholder provider so the UI
  // never shows VS Code's cryptic "no data provider registered" error, even
  // if downstream initialization throws.
  const emptyProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (e) => e,
    getChildren: () => Promise.resolve([]),
  };

  let portTreeView = vscode.window.createTreeView('serialMonitorPorts', {
    treeDataProvider: emptyProvider,
  });
  let sessionTreeView = vscode.window.createTreeView('serialMonitorSessions', {
    treeDataProvider: emptyProvider,
  });
  context.subscriptions.push(portTreeView, sessionTreeView);

  try {
    // Initialize storage
    const sessionStorage = new SessionStorage(context);

    // Initialize session recorder
    const sessionRecorder = new SessionRecorder(sessionStorage);
    await sessionRecorder.initialize();

    // Replace placeholder providers with real ones.
    const portManager = new SerialPortManager();
    portTreeView.dispose();
    portTreeView = vscode.window.createTreeView('serialMonitorPorts', {
      treeDataProvider: portManager,
    });

    const sessionTreeProvider = new SessionTreeProvider(sessionStorage);
    sessionTreeView.dispose();
    sessionTreeView = vscode.window.createTreeView('serialMonitorSessions', {
      treeDataProvider: sessionTreeProvider,
    });

    void portManager.refresh();

    context.subscriptions.push(
      sessionRecorder.onSessionSaved(() => {
        sessionTreeProvider.refresh();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('serialMonitorPro.openMonitor', (item?: PortTreeItem) => {
        if (item && item instanceof PortTreeItem && !item.isDetail) {
          MonitorPanel.createOrShow(context.extensionUri, item, sessionRecorder);
        } else {
          void showPortQuickPick(portManager, context.extensionUri, sessionRecorder);
        }
      }),

      vscode.commands.registerCommand('serialMonitorPro.refreshPorts', () => {
        void portManager.refresh();
      }),

      vscode.commands.registerCommand('serialMonitorPro.startRecording', () => {
        void vscode.window.showInformationMessage(
          'Use the Record button in an open Serial Monitor panel to start recording.'
        );
      }),

      vscode.commands.registerCommand('serialMonitorPro.stopRecording', async () => {
        if (sessionRecorder.isRecording) {
          const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for this recording session',
            placeHolder: 'Session name',
          });
          await sessionRecorder.stopRecording(name ?? undefined);
        }
      }),

      vscode.commands.registerCommand('serialMonitorPro.openPlayback', async (item?: SessionTreeItem | string) => {
        let sessionId: string | undefined;

        if (item instanceof SessionTreeItem) {
          sessionId = item.sessionId;
        } else if (typeof item === 'string') {
          sessionId = item;
        } else {
          const sessions = await sessionStorage.listSessions();
          if (sessions.length === 0) {
            void vscode.window.showInformationMessage('No recorded sessions found.');
            return;
          }

          interface SessionQuickPickItem extends vscode.QuickPickItem {
            sessionId: string;
          }
          const items: SessionQuickPickItem[] = sessions.map((s) => ({
            label: s.name,
            description: `${new Date(s.date).toLocaleString()} • ${s.hasAudio ? '🎤 ' : ''}${formatDuration(s.duration ?? 0)}`,
            sessionId: s.id,
          }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a recording session to play back',
          });

          if (picked) {
            sessionId = picked.sessionId;
          }
        }

        if (sessionId) {
          await PlaybackPanel.createOrShow(context.extensionUri, sessionId, sessionStorage);
        }
      }),

      vscode.commands.registerCommand('serialMonitorPro.refreshSessions', () => {
        sessionTreeProvider.refresh();
      }),
    );

    context.subscriptions.push(
      portTreeView,
      sessionTreeView,
      portManager,
      sessionTreeProvider,
      sessionStorage,
      sessionRecorder,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(
      `Serial Monitor Pro failed to activate fully: ${msg}. The extension is loaded with limited functionality.`,
    );
    console.error('Serial Monitor Pro activation error:', err);
  }
}
```

Important: keep the existing imports and the `showPortQuickPick`/`formatDuration`/`deactivate` functions untouched. Only the `activate` function body changes.

- [ ] **Step 5: Build and run all tests**

Run: `npm run build && npm test`
Expected: PASS — all tests in `manifest.test.mjs`, `activation.test.mjs`, `smoke.test.mjs`, and `waveform-core.test.mjs` pass.

- [ ] **Step 6: Run the packaging test**

Run: `npm run package:verify`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts tests/fixtures/vscode-stub.mjs tests/activation.test.mjs
git commit -m "fix: register tree views before risky init so activation failures stay visible"
```

---

## Task 6: Explicit Activation Events

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace the empty activationEvents array**

In `package.json`, replace line 28:

```json
"activationEvents": [],
```

with:

```json
"activationEvents": [
  "onView:serialMonitorPorts",
  "onView:serialMonitorSessions"
],
```

This is redundant under VS Code 1.74+ implicit activation but is cheap defense against any regression of implicit-activation behavior.

- [ ] **Step 2: Build and verify nothing regressed**

Run: `npm run build && npm test && npm run package:verify`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: declare explicit activationEvents for serial monitor views"
```

---

## Task 7: CI Gate

**Files:**
- Modify: `.github/workflows/publish-extension.yml`

- [ ] **Step 1: Add `package:verify` step before publish**

In `.github/workflows/publish-extension.yml`, locate the `verify` job. After the existing `Build` step and before `Verify tag matches package.json version`, add:

```yaml
      - name: Verify packaged extension contents
        run: npm run package:verify
```

The resulting block should read:

```yaml
      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Verify packaged extension contents
        run: npm run package:verify

      - name: Verify tag matches package.json version
        if: startsWith(github.ref, 'refs/tags/')
        ...
```

- [ ] **Step 2: Verify the workflow locally where possible**

Run: `npm run lint && npm test && npm run build && npm run package:verify`
Expected: PASS — every step the workflow runs succeeds locally.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-extension.yml
git commit -m "ci: run package:verify before marketplace publish"
```

---

## Final Verification

- [ ] **Step 1: Clean build and full test pass**

Run:

```bash
rm -rf dist
npm run build
npm run lint
npm test
npm run package:verify
```

Expected: every command exits 0.

- [ ] **Step 2: Manual smoke test of the produced .vsix**

Run:

```bash
npx @vscode/vsce package --out /tmp/serial-monitor-pro-smoketest.vsix
code --install-extension /tmp/serial-monitor-pro-smoketest.vsix --force
```

Then in VS Code: open the Serial Monitor Pro view container in the activity bar. The "Serial Ports" view should populate (or show "no items" if no ports are connected). It must **not** display "There is no data provider registered that can provide view data."

If the view is empty, run command `Serial Monitor Pro: Refresh Ports` from the command palette and check the output panel for any errors.

- [ ] **Step 3: Uninstall the smoketest build**

Run:

```bash
code --uninstall-extension millsit.vscode-serial-monitor-pro
rm /tmp/serial-monitor-pro-smoketest.vsix
```

---

## Out of Scope (Noted for Follow-Up)

- **Per-platform `.vsix` publish.** `@serialport/bindings-cpp` ships platform-specific native binaries. The current pipeline builds on Ubuntu only, so the published `.vsix` ships Linux x64 bindings. macOS and Windows users will hit `MODULE_NOT_FOUND` for the binding even after this fix. Resolving this requires using `vsce package --target` for each platform; track separately.
- **Removal of `node-record-lpcm16`.** It is listed as a runtime dep but the audio path actually spawns the `rec` CLI. If the JS wrapper is genuinely unused, dropping the dep would shrink the `.vsix`. Verify usage before removing.
