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
