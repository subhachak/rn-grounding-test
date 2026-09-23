// Pending human approvals for a story, and recording decisions on them.
// Shared by `npm run approve`, `npm run story`, and the MCP approval tool, so
// every route shows the same evidence and writes the same records.
import fs from 'node:fs';
import path from 'node:path';
import { fallbackFingerprint, mappingApproval, mappingFingerprint } from '../approvals.mts';
import { storyOutput } from '../paths.mts';
import { decideStory, proposalsFile, reviewFile } from '../pipeline.mts';
import { PLATFORMS, type Platform, type StepDecision } from '../types.mts';

export interface Pending {
  kind: 'mapping' | 'flagged rule match' | 'fallback';
  platform: Platform;
  id: string; // step text or gap location
  title: string; // one line, for a checklist
  lines: string[]; // the evidence
}

export function listPending(dir: string, platforms: Platform[] = PLATFORMS): Pending[] {
  const { registry, agent, validations, results } = decideStory(dir);
  const pending: Pending[] = [];

  const mappingItem = (platform: Platform, d: StepDecision, authoredBy?: string): Pending => {
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
      title: `"${d.step}" -> ${p.action === 'unmapped' ? `gap${target ? ` ${target.element} "${target.description ?? ''}"` : ''}` : `${p.action} ${target ? `${target.element} "${target.description ?? p.locator}"` : p.locator}`}`,
      lines: [
        `step:      "${d.step}"`,
        `from:      ${p.source === 'agent' ? 'Copilot agent' : 'QA'}${authoredBy ? ` (${authoredBy})` : ''}, ${p.approval}`,
        `maps to:   ${p.action}${p.intent ? ` (${p.intent})` : ''} ${p.locator ?? (p.gap ? `gap ${p.gap}` : 'nothing')}${p.text ? ` with "${p.text}"` : ''}`,
        ...(target ? [`element:   ${target.element}${target.description ? ` "${target.description}"` : ''} on ${target.screen} (${target.file}:${target.line})`] : []),
        `rationale: ${p.rationale || '-'}`,
        `gate:      ${d.verdict}${d.errors.length ? `: ${d.errors.map((e) => `${e.rule} ${e.message}`).join('; ')}` : ''}`,
      ],
    };
  };

  for (const r of results.filter((x) => platforms.includes(x.platform))) {
    for (const d of r.steps) {
      const entry = agent[r.platform]?.[d.step];
      if (entry && mappingApproval(entry) !== 'approved') pending.push(mappingItem(r.platform, d, entry.authoredBy));
      if (d.proposal.flag && d.proposal.approval !== 'approved') {
        const item = mappingItem(r.platform, d);
        item.kind = 'flagged rule match';
        item.lines.splice(1, 1, `from:      rule match, flagged by the match critic: ${d.proposal.flag}`);
        pending.push(item);
      }
      if (d.fallback?.state === 'awaiting-approval') {
        const fb = d.fallback;
        const gap = d.gap!;
        const rec = validations[fb.key]?.[r.platform];
        pending.push({
          kind: 'fallback',
          platform: r.platform,
          id: fb.key,
          title: `fallback for ${gap.element} "${gap.description ?? ''}" (${fb.key})`,
          lines: [
            `fallback:  ${gap.element}${gap.description ? ` "${gap.description}"` : ''} on ${gap.screen} (${fb.key}), used by "${d.step}"`,
            `selector:  ${rec?.selector}`,
            `device:    ${rec?.matches} match on ${rec?.device}, ${rec?.validatedAt}`,
            `until:     proposed testID ${fb.proposedTestID} lands (remediation/testids.patch)`,
          ],
        });
      }
    }
  }
  return pending;
}

// Records approvals by `by`. Refuses (throws, writing nothing) if `by` wrote
// any of the mappings being approved: whoever wrote a mapping cannot approve it.
export function applyApprovals(dir: string, items: Pending[], by: string): void {
  const { agent, reviews, validations } = decideStory(dir);
  const at = new Date().toISOString();
  const validationsOut = JSON.parse(JSON.stringify(validations));
  for (const p of items) {
    if (p.kind === 'flagged rule match') {
      const flag = reviews[p.platform]!.flags[p.id];
      flag.approval = { by, at, fingerprint: flag.fingerprint };
    } else if (p.kind === 'mapping') {
      const entry = agent[p.platform]![p.id];
      if (entry.authoredBy && entry.authoredBy.trim().toLowerCase() === by.trim().toLowerCase()) {
        throw new Error(`[${p.platform}] "${p.id}": ${by} wrote this mapping and cannot approve it; a second person must`);
      }
      entry.approval = { by, at, fingerprint: mappingFingerprint(entry) };
    } else {
      const rec = validationsOut[p.id][p.platform];
      rec.approval = { by, at, fingerprint: fallbackFingerprint(p.id, rec.selector) };
    }
  }
  if (items.some((p) => p.kind === 'mapping')) fs.writeFileSync(proposalsFile(dir), JSON.stringify(agent, null, 2) + '\n');
  if (items.some((p) => p.kind === 'flagged rule match')) fs.writeFileSync(reviewFile(dir), JSON.stringify(reviews, null, 2) + '\n');
  if (items.some((p) => p.kind === 'fallback')) {
    fs.writeFileSync(storyOutput(path.basename(dir)).validations, JSON.stringify(validationsOut, null, 2) + '\n');
  }
}
