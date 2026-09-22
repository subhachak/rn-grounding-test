import type { PlatformResult } from './types.mts';

export function summarize(r: PlatformResult) {
  const count = (v: string) => r.steps.filter((s) => s.verdict === v).length;
  const accepted = (src: string) => r.steps.filter((s) => s.verdict === 'accepted' && s.proposal.source === src).length;
  return {
    steps: r.steps.length,
    byRules: accepted('rules'),
    byAgent: accepted('agent'),
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
      `${s.steps} unique steps: ${s.accepted} accepted (${s.byRules} by rules, ${s.byAgent} by the Copilot agent), ` +
        `${s.rejected} rejected, ${s.ungrounded} ungrounded (${s.awaitingAgent} awaiting the agent), ` +
        `${s.warnings} warnings. ${s.scenarioErrors} scenario-level (G5) errors.`,
      '',
      '| Step | Verdict | Source | Action | Locator | Evidence / reason |',
      '|---|---|---|---|---|---|',
    );
    for (const d of r.steps) {
      const locator = d.locator ? `\`${d.locator.id}\`` : d.proposal.locator ? `\`${d.proposal.locator}\`` : '-';
      const reason =
        d.verdict === 'accepted'
          ? [d.locator ? d.locator.evidence : 'no locator needed', ...d.warnings.map((w) => `${w.rule} ${w.message}`)].join('; ')
          : d.verdict === 'rejected'
            ? d.errors.map((e) => `${e.rule} ${e.message}`).join('; ')
            : `${d.proposal.gap ? `gap at ${d.proposal.gap}` : 'no source evidence'}: ${d.proposal.rationale}`;
      out.push(`| ${cell(d.step)} | ${d.verdict} | ${d.proposal.source} | ${d.proposal.action} | ${cell(locator)} | ${cell(reason)} |`);
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
