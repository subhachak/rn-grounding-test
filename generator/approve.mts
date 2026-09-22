// The human approval gate.
//
//   npm run approve -- STORY-101 --list
//   npm run approve -- STORY-101 --step "I open the contribution form" [--platform ios] [--by "Name"]
//   npm run approve -- STORY-101 --fallback src/screens/ContributionFormScreen.tsx:17 [--platform android]
//   npm run approve -- STORY-101 --all [--by "Name"]
//
// --list shows each mapping and fallback awaiting approval with the evidence
// behind it. Approving records who and when, bound to a fingerprint of what
// was shown, in features/<story>/proposals.json (mappings) or
// fallbacks/validations.json (fallbacks). --by defaults to `git config
// user.name`. Nothing here runs a model; it only records a person's decision.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fallbackFingerprint, mappingApproval, mappingFingerprint } from './approvals.mts';
import { VALIDATIONS_FILE } from './fallbacks.mts';
import { ROOT, decideStory, proposalsFile, storyDir } from './pipeline.mts';
import { PLATFORMS, type Platform, type StepDecision } from './types.mts';

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
const { registry, agent, validations, results } = decideStory(dir);

interface Pending {
  kind: 'mapping' | 'fallback';
  platform: Platform;
  id: string; // step text or gap location
  lines: string[];
}

const pending: Pending[] = [];
for (const r of results.filter((x) => platforms.includes(x.platform))) {
  for (const d of r.steps) {
    const entry = agent[r.platform]?.[d.step];
    if (entry && mappingApproval(entry) !== 'approved') pending.push(mappingItem(r.platform, d, entry.authoredBy));
    if (d.fallback?.state === 'awaiting-approval') pending.push(fallbackItem(r.platform, d));
  }
}

function mappingItem(platform: Platform, d: StepDecision, authoredBy?: string): Pending {
  const p = d.proposal;
  const target = p.locator
    ? registry.find((f) => f.value === p.locator)
    : p.gap
      ? registry.find((f) => `${f.file}:${f.line}` === p.gap)
      : undefined;
  return {
    kind: 'mapping',
    platform,
    id: d.step,
    lines: [
      `step:      "${d.step}"`,
      `from:      ${p.source === 'agent' ? 'Copilot agent' : 'QA'}${authoredBy ? ` (${authoredBy})` : ''}, ${p.approval}`,
      `maps to:   ${p.action}${p.intent ? ` (${p.intent})` : ''} ${p.locator ?? (p.gap ? `gap ${p.gap}` : 'nothing')}${p.text ? ` with "${p.text}"` : ''}`,
      ...(target ? [`element:   ${target.element}${target.description ? ` "${target.description}"` : ''} on ${target.screen} (${target.file}:${target.line})`] : []),
      `rationale: ${p.rationale || '-'}`,
      `gate:      ${d.verdict}${d.errors.length ? `: ${d.errors.map((e) => `${e.rule} ${e.message}`).join('; ')}` : ''}`,
    ],
  };
}

function fallbackItem(platform: Platform, d: StepDecision): Pending {
  const fb = d.fallback!;
  const gap = d.gap!;
  const rec = validations[fb.key]?.[platform];
  return {
    kind: 'fallback',
    platform,
    id: fb.key,
    lines: [
      `fallback:  ${gap.element}${gap.description ? ` "${gap.description}"` : ''} on ${gap.screen} (${fb.key}), used by "${d.step}"`,
      `selector:  ${rec?.selector}`,
      `device:    ${rec?.matches} match on ${rec?.device}, ${rec?.validatedAt}`,
      `until:     proposed testID ${fb.proposedTestID} lands (generated/remediation/testids.patch)`,
    ],
  };
}

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
  (p) => values.all || (p.kind === 'mapping' ? values.step.includes(p.id) : values.fallback.includes(p.id)),
);
const unknown = [...values.step, ...values.fallback].filter((id) => !pending.some((p) => p.id === id));
if (unknown.length) {
  console.error(`not awaiting approval${values.platform ? ` on ${values.platform}` : ''}: ${unknown.join(', ')} (see --list)`);
  process.exit(1);
}

const at = new Date().toISOString();
const proposals = agent;
const validationsOut = JSON.parse(JSON.stringify(validations));
for (const p of chosen) {
  if (p.kind === 'mapping') {
    const entry = proposals[p.platform]![p.id];
    if (entry.authoredBy && entry.authoredBy.trim().toLowerCase() === by.trim().toLowerCase()) {
      console.error(`[${p.platform}] "${p.id}": ${by} wrote this mapping and cannot approve it; a second person must`);
      process.exit(1);
    }
    entry.approval = { by, at, fingerprint: mappingFingerprint(entry) };
  } else {
    const rec = validationsOut[p.id][p.platform];
    rec.approval = { by, at, fingerprint: fallbackFingerprint(p.id, rec.selector) };
  }
  console.log(`approved [${p.platform}] ${p.kind}: ${p.id}`);
}
if (chosen.some((p) => p.kind === 'mapping')) fs.writeFileSync(proposalsFile(dir), JSON.stringify(proposals, null, 2) + '\n');
if (chosen.some((p) => p.kind === 'fallback')) {
  fs.writeFileSync(path.join(ROOT, VALIDATIONS_FILE), JSON.stringify(validationsOut, null, 2) + '\n');
}
console.log(`${chosen.length} approved by ${by}. Regenerate: npm run generate -- features/${path.basename(dir)}`);
