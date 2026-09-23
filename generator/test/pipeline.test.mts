import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appRoot, featuresDir } from '../paths.mts';
import { Unverifiable, evaluateCondition, resolveTemplate } from '../conditions.mts';
import { ROOT, propose } from '../pipeline.mts';
import { loadRegistry } from '../registry.mts';
import { useTempOutput } from './helpers.mts';

useTempOutput();
import type { MappingInput } from '../types.mts';

test('conditions evaluate the extractor subset and refuse anything else', () => {
  assert.equal(evaluateCondition('!(isEntitled)', { isEntitled: false }), true);
  assert.equal(evaluateCondition("item.tier === 'gold' && ok", { item: { tier: 'gold' }, ok: true }), true);
  assert.equal(resolveTemplate('{`plan-item-${item.id}`}', { item: { id: 'p1' } }), 'plan-item-p1');
  assert.throws(() => evaluateCondition('isEntitled', {}), Unverifiable);
  assert.throws(() => evaluateCondition('user.can("x")', { user: {} }), Unverifiable);
});

// The client has no model provider but GitHub Copilot: nothing in this repo
// may depend on one, and the only AI in the loop is the Copilot agent.
test('no model provider SDK is a dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const banned = /^(@anthropic-ai\/|openai$|@google\/(genai|generative-ai)|@mistralai\/|cohere-ai$|@ai-sdk\/|ai$|langchain|@langchain\/)/;
  assert.deepEqual(deps.filter((d) => banned.test(d)), []);
});

test('an agent proposal never overrides a rule match', () => {
  const input: MappingInput = {
    platform: 'ios',
    steps: ['I tap Log In', 'I open the contribution form'],
    registry: loadRegistry(appRoot()),
    testData: { personas: {}, records: {} },
  };
  const agent = {
    ios: Object.fromEntries(
      input.steps.map((s) => [s, { action: 'tap' as const, locator: 'login-enroll-button', record: null, text: null, gap: null, rationale: '' }]),
    ),
  };
  const [ruled, agentOnly] = propose(input, agent);
  assert.equal(ruled.source, 'rules');
  assert.equal(ruled.locator, 'login-submit-button');
  assert.equal(agentOnly.source, 'agent');
});

test('the pipeline runs end to end, rules are never rejected, and every locator is grounded in source', () => {
  // Page objects land next to the story folder, so give the story its own dir.
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gen-')), 'STORY-101');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'generator/cli.mts'), path.join(featuresDir(), 'STORY-101'), '--out', out], {
    encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);

  const report = JSON.parse(fs.readFileSync(path.join(out, 'grounding-report.json'), 'utf-8'));
  for (const p of report) {
    for (const d of p.steps) {
      if (d.proposal.source === 'rules') assert.notEqual(d.verdict, 'rejected', `${p.platform}: rule-mapped "${d.step}" was rejected`);
    }
  }

  // The registry the tests were grounded against is saved with them.
  const saved = JSON.parse(fs.readFileSync(path.join(out, 'registry.json'), 'utf-8'));
  assert.deepEqual(saved.findings, loadRegistry(appRoot()));
  assert.equal(saved.summary.missing, saved.findings.filter((f: { category: string }) => f.category === 'missing').length);

  // Locators live only in page objects: step files never build a selector.
  const stepFiles = fs.readdirSync(path.join(out, 'steps'), { recursive: true }).map(String).filter((f) => f.endsWith('.steps.ts'));
  assert.ok(stepFiles.length > 1);
  for (const file of stepFiles) {
    const steps = fs.readFileSync(path.join(out, 'steps', file), 'utf-8');
    assert.doesNotMatch(steps, /\$\(|~|UiSelector/, `${file} contains a raw selector`);
  }

  // Every locator in the page objects is a registry value: static IDs
  // verbatim, templated IDs with the same fixed text around each placeholder.
  const registry = loadRegistry(appRoot());
  const shape = (v: string) => v.replace(/\$\{[^}]+\}/g, '${}');
  const known = new Set(
    registry
      .filter((f) => f.category === 'stable' || f.category === 'templated-dynamic')
      .map((f) => shape(f.value!.replace(/^\{`(.*)`\}$/, '$1'))),
  );
  const pagesDir = path.join(out, 'pageobjects');
  let count = 0;
  for (const file of fs.readdirSync(pagesDir).filter((f) => f !== 'base.page.ts')) {
    const code = fs.readFileSync(path.join(pagesDir, file), 'utf-8');
    for (const m of code.matchAll(/this\.by(?:TestId|Label)\((?:"([^"]+)"|`([^`]+)`)\)/g)) {
      count++;
      assert.ok(known.has(shape(m[1] ?? m[2])), `${file}: ${m[1] ?? m[2]} is not grounded in source`);
    }
  }
  assert.ok(count > 0);
});

test('the MCP server behind the Copilot agent loads and registers its tools', () => {
  const mcp = spawnSync(process.execPath, [path.join(ROOT, 'scripts/mcp-server.js')], { encoding: 'utf-8', input: '' });
  assert.equal(mcp.status, 0, mcp.stderr);
});
