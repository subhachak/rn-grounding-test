// Reset everything generated for a story: output/<story>/ (tests, page
// objects, reports, the testID patch, and the run's decisions and approvals).
//
//   npm run clean -- STORY-1
//   npm run clean -- --all        # every story, i.e. all of output/
//
// Only ever deletes inside the output root; base files are never touched.
// In Copilot Chat: /clean-story STORY-1 (asks you to confirm first).
import { parseArgs } from 'node:util';
import { cleanTarget, removeOutput } from './run/clean-store.mts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { all: { type: 'boolean', default: false } } });
if (values.all === (positionals.length === 1) || positionals.length > 1) {
  console.error('usage: npm run clean -- <story> | --all');
  process.exit(1);
}
try {
  console.log(removeOutput(cleanTarget(values.all ? null : positionals[0])));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
