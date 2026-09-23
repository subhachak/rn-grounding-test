import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sourceFingerprint, staleReason } from '../run/build-fingerprint.mts';

function app(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
  for (const [f, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), content);
  }
  return dir;
}

const base = { 'src/screens/A.tsx': 'a', 'src/B.tsx': 'b', 'App.tsx': 'app', 'app.json': '{}', 'package.json': '{"v":1}' };

test('the same app source always fingerprints the same, whatever order files were written in', () => {
  const one = app(base);
  const two = app(Object.fromEntries(Object.entries(base).reverse()));
  assert.deepEqual(sourceFingerprint(one), sourceFingerprint(two));
});

test('a source edit changes the bundle fingerprint only; a dependency edit changes the native one', () => {
  const before = sourceFingerprint(app(base));
  const src = sourceFingerprint(app({ ...base, 'src/B.tsx': 'b2' }));
  assert.notEqual(src.bundle, before.bundle);
  assert.equal(src.native, before.native);
  const deps = sourceFingerprint(app({ ...base, 'package.json': '{"v":2}' }));
  assert.equal(deps.bundle, before.bundle);
  assert.notEqual(deps.native, before.native);
  // output/, native folders, and the generator are not app source
  assert.deepEqual(sourceFingerprint(app({ ...base, 'output/x.json': '1', 'generator/y.mts': '2' })), before);
});

test('a build is stale when unrecorded or built from different source or config', () => {
  const fp = { bundle: 'b', native: 'n' };
  const stamp = { ...fp, builtAt: 't' };
  assert.equal(staleReason(stamp, fp), null);
  assert.match(staleReason(null, fp)!, /no record/);
  assert.match(staleReason(stamp, { ...fp, bundle: 'x' })!, /source changed/);
  assert.match(staleReason(stamp, { ...fp, native: 'x' })!, /config or dependencies/);
});
