// Usage: node generator/cli.mts <story-dir> [--out <dir>] [--test-data <file>]
//
// Fully deterministic: steps are mapped by generator/mapper/rules.mts, plus
// any proposals the Copilot "Appium Test Generator" agent saved to
// <story-dir>/proposals.json for steps the rules could not map.
//
// Exit codes: 0 all steps grounded or reported as gaps; 2 the gate rejected a
// proposal or a scenario failed G5, so generated tests would be wrong.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_TEST_DATA, ROOT, generateStory } from './pipeline.mts';
import { summarize } from './report.mts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    'test-data': { type: 'string', default: DEFAULT_TEST_DATA },
  },
});
if (positionals.length !== 1) {
  console.error('usage: node generator/cli.mts <story-dir> [--out <dir>] [--test-data <file>]');
  process.exit(1);
}

const run = generateStory(path.resolve(positionals[0]), {
  outDir: values.out && path.resolve(values.out),
  testDataFile: values['test-data'],
});

for (const r of run.results) {
  const s = summarize(r);
  console.log(
    `${r.platform}: ${s.accepted}/${s.steps} steps grounded (${s.byRules} by rules, ${s.byAgent} by agent), ` +
      `${s.ungrounded} gaps, ${s.awaitingAgent} awaiting agent, ${s.rejected} rejected, ` +
      `${s.warnings} warnings, ${s.scenarioErrors} scenario errors`,
  );
}
console.log(`wrote ${path.relative(ROOT, run.outDir)}/`);
process.exit(run.failed ? 2 : 0);
