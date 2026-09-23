import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appRoot, featuresDir } from '../paths.mts';
import { ROOT } from '../pipeline.mts';
import { loadRegistry } from '../registry.mts';
import { useTempOutput } from './helpers.mts';

useTempOutput();

const FIXTURE = 'generator/test/fixtures/blindspots';
const registry = () => loadRegistry(path.join(ROOT, FIXTURE));
const find = (value: string) => registry().find((f) => f.value === value);

test('constants resolve to their literal testID, including nested and imported ones', () => {
  const nested = find('fx-login-submit');
  assert.equal(nested?.category, 'stable');
  assert.equal(nested?.resolvedFrom, 'IDS.login.submit');
  assert.equal(find('fx-local')?.category, 'stable');
  // constant parts of a template are inlined, runtime parts stay placeholders
  assert.equal(find('{`fx-cancel-${item.id}`}')?.category, 'templated-dynamic');
  assert.equal(find('fx-title-icon')?.category, 'stable');
});

test('a wrapper is recorded as the native element its testID lands on, through nested wrappers', () => {
  const save = find('fx-save');
  assert.equal(save?.element, 'TouchableOpacity');
  assert.equal(save?.component, 'PrimaryButton');
  assert.equal(save?.description, 'Save');
  const icon = find('fx-title-icon');
  assert.equal(icon?.element, 'TouchableOpacity');
  assert.equal(icon?.component, 'IconButton');
  // a wrapper used without a testID is a gap on the native element
  const gap = registry().find((f) => f.category === 'missing' && f.component === 'PrimaryButton');
  assert.equal(gap?.element, 'TouchableOpacity');
  assert.equal(gap?.description, 'No id');
});

test("a wrapper's own testID pass-through is not reported as a locator or a gap", () => {
  const inWrappers = registry().filter((f) => f.file.includes('components/'));
  assert.deepEqual(inWrappers, []);
});

test('each component in a file is its own screen', () => {
  assert.equal(find('fx-settings-screen')?.screen, 'SettingsScreen');
  assert.equal(find('fx-save')?.screen, 'HomeScreen');
});

test('generation is byte-identical run to run', () => {
  const run = () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'det-')), 'STORY-101');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'generator/cli.mts'), path.join(featuresDir(), 'STORY-101'), '--out', out], { encoding: 'utf-8' });
    assert.equal(r.status, 0, r.stderr);
    const root = path.dirname(out);
    const files = (fs.readdirSync(root, { recursive: true, encoding: 'utf-8' }) as string[]).filter((f) => fs.statSync(path.join(root, f)).isFile()).sort();
    return Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf-8')]));
  };
  const a = run();
  const b = run();
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const f of Object.keys(a)) assert.equal(a[f], b[f], `${f} differs between runs`);
});
