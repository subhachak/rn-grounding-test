import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import './helpers.mts';
import { appRoot, featuresDir } from '../paths.mts';
import { fallbackSelectors, fallbackStatus } from '../fallbacks.mts';
import { decideStep } from '../gate.mts';
import { buildPageModel } from '../pageobjects.mts';
import { ROOT } from '../pipeline.mts';
import { evidence, loadRegistry } from '../registry.mts';
import { proposeTestIds, renderPatch } from '../remediation.mts';
import type { Proposal, RegistryFinding } from '../types.mts';

// Apply the generated patch to a copy of the app and re-scan it.
function patchedCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remed-'));
  fs.cpSync(path.join(appRoot(), 'src'), path.join(dir, 'src'), { recursive: true });
  const registry = loadRegistry(appRoot());
  const proposals = proposeTestIds(registry);
  fs.writeFileSync(path.join(dir, 'testids.patch'), renderPatch(appRoot(), proposals));
  const git = spawnSync('git', ['apply', 'testids.patch'], { cwd: dir, encoding: 'utf-8' });
  assert.equal(git.status, 0, git.stderr);
  return { registry, proposals, after: loadRegistry(dir) };
}

test('the testID patch applies cleanly and closes every gap with the proposed IDs', () => {
  const { registry, proposals, after } = patchedCopy();
  assert.ok(proposals.length > 0);
  assert.equal(after.filter((f) => f.category === 'missing').length, 0);
  for (const p of proposals) {
    const landed = after.find((f) => f.value === p.testID);
    assert.ok(landed, `${p.testID} not found after patching`);
    assert.equal(landed.element, p.gap.element);
  }
  // New IDs follow the screen's convention and collide with nothing.
  const existing = new Set(registry.map((f) => f.value));
  for (const p of proposals) assert.ok(!existing.has(p.testID), `${p.testID} already exists`);
  assert.ok(proposals.some((p) => p.testID === 'contribution-cancel-button'));
});

test('page object member names do not change when a testID replaces a fallback', () => {
  const { registry, proposals, after } = patchedCopy();
  const before = buildPageModel(registry, proposals);
  const later = buildPageModel(after, []);
  for (const p of proposals) {
    const fallback = before.byGap.get(evidence(p.gap));
    assert.ok(fallback?.fallback, `no fallback member for ${evidence(p.gap)}`);
    assert.equal(later.byValue.get(p.testID)?.name, fallback.name);
  }
});

test('a fallback counts as device-validated only for the selector that was tested, with one match', () => {
  const gap: RegistryFinding = {
    screen: 'S', element: 'TouchableOpacity', attribute: null, category: 'missing', value: null,
    locatorStrength: null, conditions: [], description: 'Cancel', file: 'src/S.tsx', line: 3,
  };
  const sel = fallbackSelectors(gap)!;
  const rec = (selector: string, matches: number) => ({ 'src/S.tsx:3': { ios: { selector, matches, device: 'd', validatedAt: 't' } } });
  assert.equal(fallbackStatus(gap, 'ios', {}).state, 'unvalidated');
  assert.equal(fallbackStatus(gap, 'ios', rec(sel.ios, 1)).state, 'awaiting-approval');
  assert.equal(fallbackStatus(gap, 'ios', rec(sel.ios, 2)).state, 'failed');
  assert.equal(fallbackStatus(gap, 'ios', rec('-ios predicate string:label == "Close"', 1)).state, 'unvalidated');
  assert.equal(fallbackStatus(gap, 'android', rec(sel.ios, 1)).state, 'unvalidated');
  assert.equal(fallbackStatus({ ...gap, description: null }, 'ios', {}).state, 'none');
});

test('G9 lets a fallback act on a gap only when the intent fits the element', () => {
  const registry: RegistryFinding[] = [
    { screen: 'S', element: 'TouchableOpacity', attribute: null, category: 'missing', value: null,
      locatorStrength: null, conditions: [], description: 'Cancel', file: 'src/S.tsx', line: 3 },
  ];
  const testData = { personas: {}, records: {} };
  const p = (over: Partial<Proposal>): Proposal => ({
    step: 's', action: 'unmapped', locator: null, record: null, text: null, gap: 'src/S.tsx:3',
    rationale: '', source: 'rules', intent: 'tap', ...over,
  });
  assert.ok(decideStep(p({}), registry, testData).gap);
  const typed = decideStep(p({ intent: 'type', text: 'x' }), registry, testData);
  assert.equal(typed.gap, null);
  assert.deepEqual(typed.warnings.map((w) => w.rule), ['G9']);
  assert.equal(decideStep(p({ intent: null }), registry, testData).gap, null);
});
