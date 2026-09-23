import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fallbackFingerprint, mappingApproval, mappingFingerprint, type MappingEntry, type ReviewFlag } from '../approvals.mts';
import { fallbackSelectors, fallbackStatus } from '../fallbacks.mts';
import { ROOT, propose } from '../pipeline.mts';
import { loadRegistry } from '../registry.mts';
import type { RegistryFinding } from '../types.mts';
import { useTempOutput } from './helpers.mts';

const entry = (over: Partial<MappingEntry> = {}): MappingEntry => ({
  action: 'tap', locator: 'dashboard-contribute-button', record: null, text: null, gap: null,
  rationale: 'why', author: 'agent', authoredBy: 'copilot-agent', ...over,
});
const approve = (e: MappingEntry, by: string) => ({ ...e, approval: { by, at: 't', fingerprint: mappingFingerprint(e) } });

test('a non-rule mapping needs a person, and any change to what it does needs them again', () => {
  const e = entry();
  assert.equal(mappingApproval(e), 'awaiting');
  const approved = approve(e, 'Asha');
  assert.equal(mappingApproval(approved), 'approved');
  assert.equal(mappingApproval({ ...approved, rationale: 'reworded' }), 'approved');
  assert.equal(mappingApproval({ ...approved, locator: 'dashboard-view-plans-button' }), 'stale');
  assert.equal(mappingApproval(approve(entry({ authoredBy: 'Asha' }), 'asha ')), 'self-approved');
});

test('unapproved agent mappings reach codegen marked, and rule matches need no approval', () => {
  const input = { platform: 'ios' as const, steps: ['I tap Log In', 'I open the contribution form'], registry: loadRegistry(ROOT), testData: { personas: {}, records: {} } };
  const [rule, agent] = propose(input, { ios: { 'I open the contribution form': entry() } });
  assert.equal(rule.approval, undefined);
  assert.equal(agent.approval, 'awaiting');
  const [, approved] = propose(input, { ios: { 'I open the contribution form': approve(entry(), 'Asha') } });
  assert.equal(approved.approval, 'approved');
});

test('a fallback is usable only once a person approved the exact selector that was validated', () => {
  const gap: RegistryFinding = {
    screen: 'S', element: 'TouchableOpacity', attribute: null, category: 'missing', value: null,
    locatorStrength: null, conditions: [], description: 'Cancel', file: 'src/S.tsx', line: 3,
  };
  const sel = fallbackSelectors(gap)!.ios;
  const rec = (fingerprint?: string) => ({
    'src/S.tsx:3': { ios: { selector: sel, matches: 1, device: 'd', validatedAt: 't', ...(fingerprint && { approval: { by: 'Asha', at: 't', fingerprint } }) } },
  });
  assert.equal(fallbackStatus(gap, 'ios', rec()).state, 'awaiting-approval');
  assert.equal(fallbackStatus(gap, 'ios', rec(fallbackFingerprint('src/S.tsx:3', sel))).state, 'validated');
  assert.equal(fallbackStatus(gap, 'ios', rec(fallbackFingerprint('src/S.tsx:3', 'something else'))).state, 'awaiting-approval');
});

test('npm run approve refuses to let a mapping be approved by its own author', () => {
  const out = useTempOutput();
  const file = path.join(out, 'STORY-101', 'proposals.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mapping = entry({ author: 'human', authoredBy: 'Asha', rationale: 'QA mapping' });
  fs.writeFileSync(file, JSON.stringify({ ios: { 'I open the contribution form': mapping } }, null, 2));
  const before = fs.readFileSync(file, 'utf-8');
  const r = spawnSync(
    process.execPath,
    [path.join(ROOT, 'generator/approve.mts'), 'STORY-101', '--step', 'I open the contribution form', '--platform', 'ios', '--by', 'Asha'],
    { encoding: 'utf-8', env: { ...process.env, GROUNDING_OUTPUT: out } },
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cannot approve it/);
  assert.equal(fs.readFileSync(file, 'utf-8'), before);
});

test('a match-critic flag holds a rule match for a person, only while it describes that exact match', () => {
  const input = { platform: 'ios' as const, steps: ['I tap Log In'], registry: loadRegistry(ROOT), testData: { personas: {}, records: {} } };
  const [unflagged] = propose(input, {});
  assert.equal(unflagged.approval, undefined);
  const fingerprint = mappingFingerprint(unflagged as unknown as MappingEntry);
  const review = (flag: ReviewFlag) => ({ ios: { reviewedAt: 't', reviewedBy: 'critic', ruleMatches: 1, flags: { 'I tap Log In': flag } } });

  const [held] = propose(input, {}, review({ concern: 'doubt', fingerprint }));
  assert.deepEqual([held.flag, held.approval], ['doubt', 'awaiting']);
  const [released] = propose(input, {}, review({ concern: 'doubt', fingerprint, approval: { by: 'Asha', at: 't', fingerprint } }));
  assert.equal(released.approval, 'approved');
  // A flag about a different (older) match does not carry over.
  const [changed] = propose(input, {}, review({ concern: 'doubt', fingerprint: 'something-else' }));
  assert.equal(changed.flag, undefined);
});
