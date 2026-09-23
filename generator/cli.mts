// Usage: npm run generate -- <story | story-dir> [--out <dir>] [--test-data <file>]
//
// A story id (STORY-1) is looked up in the configured features folder; a
// path to a story folder works too. Fully deterministic: steps are mapped by
// generator/mapper/rules.mts, plus any proposals the Copilot "Appium Test
// Generator" agent saved to <output>/<story>/proposals.json for steps the
// rules could not map.
//
// Exit codes: 0 all steps grounded or reported as gaps; 2 the gate rejected a
// proposal or a scenario failed G5, so generated tests would be wrong.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { defaultTestData, shown } from './paths.mts';
import { generateStory, storyDir } from './pipeline.mts';
import { summarize } from './report.mts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    'test-data': { type: 'string' },
  },
});
if (positionals.length !== 1) {
  console.error('usage: npm run generate -- <story | story-dir> [--out <dir>] [--test-data <file>]');
  process.exit(1);
}

const arg = positionals[0];
const dir = fs.existsSync(arg) && fs.statSync(arg).isDirectory() ? path.resolve(arg) : storyDir(arg);
const run = generateStory(dir, {
  outDir: values.out && path.resolve(values.out),
  testDataFile: values['test-data'] ?? defaultTestData(),
});

for (const r of run.results) {
  const s = summarize(r);
  console.log(
    `${r.platform}: ${s.accepted}/${s.steps} steps grounded (${s.byRules} by rules, ${s.byAgent} by agent, ${s.byHuman} by QA), ` +
      `${s.ungrounded} gaps (${s.fallbacksValidated} on approved fallbacks, ${s.fallbacksPending} fallbacks awaiting validation or approval), ` +
      `${s.awaitingAgent} awaiting agent, ${s.rejected} rejected, ` +
      `${s.warnings} warnings, ${s.scenarioErrors} scenario errors, ${s.awaitingApproval} awaiting approval`,
  );
}
console.log(`wrote ${shown(run.outDir)}/`);
process.exit(run.failed ? 2 : 0);
