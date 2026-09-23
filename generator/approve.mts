// The human approval gate.
//
//   npm run approve -- STORY-101 --list
//   npm run approve -- STORY-101 --step "I open the contribution form" [--platform ios] [--by "Name"]
//   npm run approve -- STORY-101 --fallback src/screens/ContributionFormScreen.tsx:17 [--platform android]
//   npm run approve -- STORY-101 --all [--by "Name"]
//
// --list shows each mapping, critic-flagged rule match, and fallback awaiting
// approval with the evidence behind it. Approving records who and when,
// bound to a fingerprint of what was shown, in features/<story>/proposals.json
// (mappings), features/<story>/review.json (flagged rule matches), or
// fallbacks/validations.json (fallbacks). --by defaults to `git config
// user.name`. Nothing here runs a model; it only records a person's decision.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { storyDir } from './pipeline.mts';
import { applyApprovals, listPending } from './run/approval-store.mts';
import { PLATFORMS, type Platform } from './types.mts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    step: { type: 'string', multiple: true, default: [] },
    fallback: { type: 'string', multiple: true, default: [] },
    platform: { type: 'string' },
    by: { type: 'string' },
  },
});
if (positionals.length !== 1) {
  console.error('usage: npm run approve -- <story> --list | --step "<text>" | --fallback <file:line> | --all [--platform android|ios] [--by "Name"]');
  process.exit(1);
}

const dir = storyDir(path.basename(positionals[0]));
const platforms = (values.platform ? [values.platform] : PLATFORMS) as Platform[];
const pending = listPending(dir, platforms);

if (values.list || (!values.all && !values.step.length && !values.fallback.length)) {
  if (!pending.length) console.log('Nothing awaiting approval.');
  for (const p of pending) console.log(`\n[${p.platform}] ${p.kind}\n  ${p.lines.join('\n  ')}`);
  process.exit(0);
}

let by = values.by;
if (!by) {
  try {
    by = execFileSync('git', ['config', 'user.name'], { encoding: 'utf-8' }).trim();
  } catch {
    // fall through to the error below
  }
}
if (!by) {
  console.error('who is approving? pass --by "Name" or set git config user.name');
  process.exit(1);
}

const chosen = pending.filter(
  (p) => values.all || (p.kind === 'fallback' ? values.fallback.includes(p.id) : values.step.includes(p.id)),
);
const unknown = [...values.step, ...values.fallback].filter((id) => !pending.some((p) => p.id === id));
if (unknown.length) {
  console.error(`not awaiting approval${values.platform ? ` on ${values.platform}` : ''}: ${unknown.join(', ')} (see --list)`);
  process.exit(1);
}

try {
  applyApprovals(dir, chosen, by);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
for (const p of chosen) console.log(`approved [${p.platform}] ${p.kind}: ${p.id}`);
console.log(`${chosen.length} approved by ${by}. Regenerate: npm run generate -- features/${path.basename(dir)}`);
