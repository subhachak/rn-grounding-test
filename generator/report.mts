import type { PlatformResult, StepDecision } from './types.mts';

// How a step is described in the reports. A gap step still has a clear
// action (type "monthly", tap); showing it as "unmapped" read as if the step
// had no meaning, when the only thing missing is the element's testID.

export function stepAction(d: StepDecision): string {
  const p = d.proposal;
  const action = p.action === 'unmapped' ? (p.intent ?? 'unmapped') : p.action;
  return p.text !== null && p.text !== undefined ? `${action} "${p.text}"` : action;
}

export type Tone = 'ok' | 'warn' | 'bad';

export function stepDecision(d: StepDecision): { label: string; tone: Tone } {
  const p = d.proposal;
  if (p.approval && p.approval !== 'approved') return { label: `${p.approval} approval`, tone: 'warn' };
  if (d.verdict === 'accepted') return { label: 'accepted', tone: 'ok' };
  if (d.verdict === 'rejected') return { label: 'rejected', tone: 'bad' };
  switch (d.fallback?.state) {
    case 'validated':
      return { label: 'fallback', tone: 'ok' };
    case 'awaiting-approval':
      return { label: 'fallback: awaiting approval', tone: 'warn' };
    case 'unvalidated':
      return { label: 'fallback: not yet validated', tone: 'warn' };
    case 'failed':
      return { label: 'fallback: failed validation', tone: 'bad' };
    default:
      return { label: 'gap', tone: 'warn' };
  }
}

export function stepEvidence(d: StepDecision): string {
  const p = d.proposal;
  if (d.verdict === 'rejected') return d.errors.map((e) => `${e.rule} ${e.message}`).join('; ');
  if (d.locator) return `${d.locator.attribute}=${d.locator.id} (${d.locator.evidence})`;
  if (d.fallback) {
    const fb = d.fallback;
    const by = d.gap
      ? `${d.gap.element === 'TextInput' ? 'placeholder' : 'visible text'} "${d.gap.description ?? ''}"`
      : 'source evidence';
    const status = {
      validated: `1 match on ${fb.device}; approved by ${fb.approvedBy}`,
      'awaiting-approval': `1 match on ${fb.device}; awaiting your approval`,
      unvalidated: 'not yet validated on a device',
      failed: `${fb.matches} matches on ${fb.device}, needs exactly 1`,
    }[fb.state];
    return `No testID at ${fb.key} (proposed ${fb.proposedTestID}). Fallback by ${by}: ${status}.`;
  }
  if (p.gap) return `No testID at ${p.gap}; no fallback possible (${p.rationale})`;
  return p.rationale;
}

export function summarize(r: PlatformResult) {
  // A mapping held for human approval is generated as pending, so it does
  // not count as grounded until approved.
  const usable = (s: PlatformResult['steps'][number]) => !s.proposal.approval || s.proposal.approval === 'approved';
  const count = (v: string) => r.steps.filter((s) => s.verdict === v && (v !== 'accepted' || usable(s))).length;
  const accepted = (src: string) => r.steps.filter((s) => s.verdict === 'accepted' && usable(s) && s.proposal.source === src).length;
  return {
    steps: r.steps.length,
    byRules: accepted('rules'),
    byAgent: accepted('agent'),
    byHuman: accepted('human'),
    fallbacksValidated: r.steps.filter((s) => s.fallback?.state === 'validated').length,
    fallbacksPending: r.steps.filter((s) => s.fallback && s.fallback.state !== 'validated').length,
    flagged: r.steps.filter((s) => s.proposal.flag).length,
    awaitingApproval:
      r.steps.filter((s) => s.proposal.approval && s.proposal.approval !== 'approved').length +
      r.steps.filter((s) => s.fallback?.state === 'awaiting-approval').length,
    awaitingAgent: r.steps.filter((s) => s.proposal.source === 'none').length,
    accepted: count('accepted'),
    rejected: count('rejected'),
    ungrounded: count('ungrounded'),
    warnings: r.steps.reduce((n, s) => n + s.warnings.length, 0),
    scenarioErrors: r.scenarios.reduce((n, s) => n + s.errors.length, 0),
  };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdown(story: string, results: PlatformResult[]): string {
  const out = [`# Grounding report: ${story}`, ''];
  for (const r of results) {
    const s = summarize(r);
    out.push(
      `## ${r.platform}`,
      '',
      `Feature: ${r.feature.name} (\`${r.feature.file}\`).`,
      '',
      `${s.steps} unique steps: ${s.accepted} accepted (${s.byRules} by rules, ${s.byAgent} by the Copilot agent, ` +
        `${s.byHuman} by QA), ${s.rejected} rejected, ${s.ungrounded} ungrounded (${s.awaitingAgent} awaiting the agent; ` +
        `${s.fallbacksValidated} run on a device-validated fallback, ${s.fallbacksPending} fallbacks awaiting validation), ` +
        `${s.warnings} warnings. ${s.scenarioErrors} scenario-level (G5) errors. ` +
        `${s.flagged} rule matches flagged by the match critic. ${s.awaitingApproval} awaiting human approval.`,
      '',
      '| Step | Decision | Source | Action | Locator | Evidence / reason |',
      '|---|---|---|---|---|---|',
    );
    for (const d of r.steps) {
      const flag = d.proposal.flag ? ` (critic: ${d.proposal.flag})` : '';
      const locator = d.locator ? `\`${d.locator.id}\`` : d.proposal.locator ? `\`${d.proposal.locator}\`` : '-';
      const evidence = [stepEvidence(d), ...(d.verdict === 'accepted' ? d.warnings.map((w) => `${w.rule} ${w.message}`) : [])].join('; ');
      out.push(
        `| ${cell(d.step)} | ${stepDecision(d).label}${flag} | ${d.proposal.source} | ${cell(stepAction(d))} | ${cell(locator)} | ${cell(evidence)} |`,
      );
    }
    const scenarioErrors = r.scenarios.filter((sc) => sc.errors.length);
    if (scenarioErrors.length) {
      out.push('', '### Scenario checks (G5)', '');
      for (const sc of scenarioErrors) {
        for (const e of sc.errors) out.push(`- **${sc.scenario}** (line ${sc.line}), step "${e.step}": ${e.message}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}
