import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT, decideStory, storyDir } from '../pipeline.mts';
import { renderHtmlReport } from '../run/html.mts';
import { runStory, type RunIO, type RunState } from '../run/orchestrator.mts';

const watched = ['features/STORY-101/proposals.json', 'fallbacks/validations.json'].map((f) => path.join(ROOT, f));

test('a run whose approver declines records no approval, and still reports', async () => {
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
          { scenario: sc.name, step: sc.steps[0].text, status: 'passed' },
          { scenario: sc.name, step: sc.steps[1].text, status: 'pending' },
        ],
      },
    ],
  };
  const html = renderHtmlReport('STORY-101', decided, run);
  const block = html.slice(html.indexOf(sc.name), html.indexOf('</details>', html.indexOf(sc.name)));
  assert.equal((block.match(/badge muted">skipped/g) ?? []).length, sc.steps.length - 2);
  assert.match(html, /1 passed, 0 failed, 1 pending/);
});
