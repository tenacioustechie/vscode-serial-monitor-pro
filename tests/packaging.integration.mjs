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
