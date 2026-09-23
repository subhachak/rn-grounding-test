// Reset everything generated for a story: output/<story>/ (tests, page
// objects, reports, the testID patch, and the run's decisions and approvals).
//
//   npm run clean -- STORY-101
//   npm run clean -- --all        # every story, i.e. all of output/
//
// Only ever deletes inside the output root; base files are never touched.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, outputRoot, storyOutput } from './paths.mts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { all: { type: 'boolean', default: false } } });
if (values.all === (positionals.length === 1) || positionals.length > 1) {
  console.error('usage: npm run clean -- <story> | --all');
  process.exit(1);
}

const target = values.all ? outputRoot() : storyOutput(positionals[0]).root;
// A story name like "../src" must not reach outside the output root.
if (!values.all && (!/^[A-Za-z0-9_-]+$/.test(positionals[0]) || path.dirname(target) !== outputRoot())) {
  console.error(`invalid story id \`${positionals[0]}\``);
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.log(`Nothing to clean: ${path.relative(ROOT, target) || target} does not exist.`);
} else {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${path.relative(ROOT, target)}/`);
}
