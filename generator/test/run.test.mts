import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT, decideStory, storyDir } from '../pipeline.mts';
import { renderHtmlReport } from '../run/html.mts';
import { runStory, type RunIO, type RunState } from '../run/orchestrator.mts';
import { useTempOutput } from './helpers.mts';

const out = useTempOutput();
const story = path.join(out, 'STORY-101');
const watched = ['proposals.json', 'validations.json'].map((f) => path.join(story, f));

test('a run whose approver declines records no approval, and still reports', async () => {
  // Something to approve: an agent mapping and a device-validated fallback.
  fs.mkdirSync(story, { recursive: true });
  fs.writeFileSync(watched[0], JSON.stringify({ ios: { 'I open the contribution form': {
    action: 'tap', locator: 'dashboard-contribute-button', record: null, text: null, gap: null, rationale: 'r', author: 'agent', authoredBy: 'copilot-agent',
  } } }, null, 2));
  fs.writeFileSync(watched[1], JSON.stringify({}, null, 2));
  const before = watched.map((f) => fs.readFileSync(f, 'utf-8'));
  const said: string[] = [];
  let asked = 0;
  const io: RunIO = {
    say: (m) => said.push(m),
    approve: async (items) => {
      asked = items.length;
      return null;
    },
  };
  const file = await runStory('STORY-101', io, { devices: false });
  assert.ok(asked > 0, 'the person was asked');
  assert.deepEqual(watched.map((f) => fs.readFileSync(f, 'utf-8')), before, 'nothing was approved');
  assert.ok(said.some((m) => m.includes('stay pending')));
  const html = fs.readFileSync(file, 'utf-8');
  assert.match(html, /<title>STORY-101 test run<\/title>/);
  assert.match(html, /Not run on a device in this run/);
});

test('the report fills in steps skipped after a pending one, from the feature file', () => {
  const decided = decideStory(storyDir('STORY-101'));
  const android = decided.results.find((r) => r.platform === 'android')!;
  const sc = android.feature.scenarios.find((s) => s.name === 'Member abandons a contribution')!;
  const run: RunState = {
    story: 'STORY-101',
    startedAt: '2026-01-01T00:00:00.000Z',
    events: [],
    approvals: [],
    suites: [
      {
        platform: 'android', device: 'emu', mode: 'normal', startedAt: 't', finishedAt: '2026-01-01T00:01:00.000Z', exitCode: 0,
        steps: [
          { scenario: sc.name, occurrence: 1, step: sc.steps[0].text, status: 'passed' },
          { scenario: sc.name, occurrence: 1, step: sc.steps[1].text, status: 'pending' },
        ],
      },
    ],
  };
  const html = renderHtmlReport('STORY-101', decided, run);
  const block = html.slice(html.indexOf(sc.name), html.indexOf('</details>', html.indexOf(sc.name)));
  assert.equal((block.match(/badge muted">skipped/g) ?? []).length, sc.steps.length - 2);
  assert.match(html, /1 passed, 0 failed, 1 pending/);
});

test('npm run clean removes one story\'s output and refuses paths outside it', () => {
  const target = path.join(out, 'STORY-CLEAN');
  fs.mkdirSync(path.join(target, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(target, 'reports', 'latest.html'), 'x');
  const clean = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, 'generator/clean.mts'), ...args], { encoding: 'utf-8', env: { ...process.env, GROUNDING_OUTPUT: out } });
  assert.equal(clean('STORY-CLEAN').status, 0);
  assert.equal(fs.existsSync(target), false);
  assert.notEqual(clean('../src').status, 0);
  assert.ok(fs.existsSync(path.join(ROOT, 'package.json')), 'nothing outside the output root was touched');
});

test('same-named scenarios (a Scenario Outline without placeholders in its title) each get their own results', () => {
  const decided = decideStory(storyDir('STORY-101'));
  const android = decided.results.find((r) => r.platform === 'android')!;
  // Two scenarios under one name, the way an Outline's expansions arrive.
  const [a, b] = android.feature.scenarios;
  const twin = { ...b, name: a.name };
  android.feature = { ...android.feature, scenarios: [a, twin] };
  const run: RunState = {
    story: 'STORY-101', startedAt: '2026-01-01T00:00:00.000Z', events: [], approvals: [],
    suites: [{
      platform: 'android', device: 'emu', mode: 'normal', startedAt: 't', finishedAt: '2026-01-01T00:01:00.000Z', exitCode: 0,
      steps: [
        ...a.steps.map((st) => ({ scenario: a.name, occurrence: 1, step: st.text, status: 'passed' as const })),
        { scenario: a.name, occurrence: 2, step: twin.steps[0].text, status: 'failed' as const, error: 'boom' },
      ],
    }],
  };
  const html = renderHtmlReport('STORY-101', decided, run);
  const blocks = html.split('<details').slice(1).filter((d) => d.includes(a.name));
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /badge ok">passed<\/span> [^<]*<\/summary>|summary><span class="badge ok">passed/);
  assert.doesNotMatch(blocks[0], /boom/);
  assert.match(blocks[1], /boom/);
  assert.equal((blocks[1].match(/badge muted">skipped/g) ?? []).length, twin.steps.length - 1);
});

test('a gap step reads as its intended action and fallback status, not "unmapped"', async () => {
  const { stepAction, stepDecision, stepEvidence } = await import('../report.mts');
  const decided = decideStory(storyDir('STORY-101'));
  const cancel = decided.results.find((r) => r.platform === 'android')!.steps.find((d) => d.step === 'I tap Cancel')!;
  assert.equal(stepAction(cancel), 'tap');
  assert.equal(stepDecision(cancel).label, 'fallback: not yet validated');
  assert.match(stepEvidence(cancel), /No testID at src\/screens\/ContributionFormScreen\.tsx:17 \(proposed contribution-cancel-button\)\. Fallback by visible text "Cancel": not yet validated/);
  const typed = decided.results.find((r) => r.platform === 'android')!.steps.find((d) => d.step.startsWith('I enter username'))!;
  assert.equal(stepAction(typed), 'type "member.entitled"');
});
