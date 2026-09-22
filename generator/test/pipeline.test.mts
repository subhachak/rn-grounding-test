import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Unverifiable, evaluateCondition, resolveTemplate } from '../conditions.mts';
import { ROOT, propose } from '../pipeline.mts';
import { loadRegistry } from '../registry.mts';
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
    registry: loadRegistry(ROOT),
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'generator/cli.mts'), path.join(ROOT, 'features/STORY-101'), '--out', out], {
    encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);

  const report = JSON.parse(fs.readFileSync(path.join(out, 'grounding-report.json'), 'utf-8'));
  for (const p of report) {
    for (const d of p.steps) {
      if (d.proposal.source === 'rules') assert.notEqual(d.verdict, 'rejected', `${p.platform}: rule-mapped "${d.step}" was rejected`);
    }
  }

  // Every ID in generated code is either a static registry value or a
  // registry template resolved against test data, never anything else.
  const registry = loadRegistry(ROOT);
  const staticIds = new Set(registry.filter((f) => f.category === 'stable').map((f) => f.value));
  const templates = registry
    .filter((f) => f.category === 'templated-dynamic')
    .map((f) => new RegExp(`^${f.value!.slice(2, -2).replace(/\$\{[^}]+\}/g, '[^"]+')}$`));
  for (const platform of ['android', 'ios']) {
    const code = fs.readFileSync(path.join(out, platform, 'steps.ts'), 'utf-8');
    const ids = [...code.matchAll(/resourceId\(\\"([^\\]+)\\"\)|"~([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    assert.ok(ids.length > 0);
    for (const id of ids) {
      assert.ok(staticIds.has(id) || templates.some((t) => t.test(id)), `${platform}: ${id} is not grounded in source`);
    }
  }
});

test('the MCP server behind the Copilot agent loads and registers its tools', () => {
  const mcp = spawnSync(process.execPath, [path.join(ROOT, 'scripts/mcp-server.js')], { encoding: 'utf-8', input: '' });
  assert.equal(mcp.status, 0, mcp.stderr);
});
