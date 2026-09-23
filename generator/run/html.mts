// The end-of-run report: one self-contained HTML file (no external
// resources) covering device results, how every step was mapped and
// decided, gaps and the proposed testID patch, fallbacks with their
// evidence, critic flags, the human-approval audit trail, and the run log.
import fs from 'node:fs';
import path from 'node:path';
import type { Approval } from '../approvals.mts';
import { ROOT, storyOutput } from '../paths.mts';
import type { decideStory } from '../pipeline.mts';
import { summarize } from '../report.mts';
import { evidence } from '../registry.mts';
import type { Platform, PlatformResult } from '../types.mts';
import type { StepResult, SuiteResult } from './devices.mts';
import type { RunState } from './orchestrator.mts';

type Decided = ReturnType<typeof decideStory>;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const when = (iso?: string) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-');
const badge = (text: string, tone: string) => `<span class="badge ${tone}">${esc(text)}</span>`;

const STATUS_TONE: Record<string, string> = { passed: 'ok', failed: 'bad', pending: 'warn', skipped: 'muted', 'not run': 'muted' };

// Skipped steps fire no hook, so a scenario's remaining steps are filled in
// from the feature file.
function scenarioRows(r: PlatformResult, suite: SuiteResult | undefined) {
  return r.feature.scenarios.map((sc) => {
    const recorded = (suite?.steps ?? []).filter((s) => s.scenario === sc.name);
    const steps = sc.steps.map((st, i): StepResult => recorded[i] ?? { scenario: sc.name, step: st.text, status: suite ? 'skipped' : ('not run' as StepResult['status']) });
    const status = steps.some((s) => s.status === 'failed') ? 'failed' : steps.some((s) => s.status === 'pending') ? 'pending' : suite ? 'passed' : 'not run';
    return { name: sc.name, tags: sc.tags, steps, status };
  });
}

function latestNormal(run: RunState, platform: Platform) {
  return [...run.suites].reverse().find((s) => s.platform === platform && s.mode === 'normal');
}

export function renderHtmlReport(story: string, decided: Decided, run: RunState): string {
  const { results, testIds, agent, reviews, validations } = decided;
  const finishedAt = run.events.at(-1)?.at;

  const cards = results
    .map((r) => {
      const s = summarize(r);
      const suite = latestNormal(run, r.platform);
      const count = (st: string) => suite?.steps.filter((x) => x.status === st).length ?? 0;
      const verdict = !suite ? badge('not run on a device', 'muted') : count('failed') ? badge(`${count('failed')} failed`, 'bad') : badge('no failures', 'ok');
      return `<section class="card">
  <h3>${esc(r.platform)} ${verdict}</h3>
  <dl>
    <dt>Device</dt><dd>${esc(suite ? `${suite.device}, ${when(suite.finishedAt)}` : '-')}</dd>
    <dt>Steps run</dt><dd>${suite ? `${count('passed')} passed, ${count('failed')} failed, ${count('pending')} pending` : '-'}</dd>
    <dt>Unique steps</dt><dd>${s.steps}</dd>
    <dt>Mapped by</dt><dd>${s.byRules} rules, ${s.byAgent} Copilot agent, ${s.byHuman} QA</dd>
    <dt>Awaiting approval</dt><dd>${s.awaitingApproval}</dd>
    <dt>Gaps</dt><dd>${s.ungrounded} (${s.fallbacksValidated} on approved fallbacks)</dd>
    <dt>Rejected by the gate</dt><dd>${s.rejected}</dd>
    <dt>Critic flags</dt><dd>${s.flagged}</dd>
  </dl>
</section>`;
    })
    .join('\n');

  const deviceSections = results
    .map((r) => {
      const suite = latestNormal(run, r.platform);
      const rows = scenarioRows(r, suite)
        .map(
          (sc) => `<details${sc.status === 'failed' ? ' open' : ''}>
  <summary>${badge(sc.status, STATUS_TONE[sc.status])} ${esc(sc.name)} <span class="muted">${esc(sc.tags.join(' '))}</span></summary>
  <ol class="steps">${sc.steps
    .map((st) => `<li>${badge(st.status, STATUS_TONE[st.status])} ${esc(st.step)}${st.error ? `<div class="error">${esc(st.error)}</div>` : ''}</li>`)
    .join('')}</ol>
</details>`,
        )
        .join('\n');
      return `<h3>${esc(r.platform)}${suite ? ` <span class="muted">(${esc(suite.device)})</span>` : ''}</h3>${suite ? rows : '<p class="muted">Not run on a device in this run.</p>'}`;
    })
    .join('\n');

  const mappingSections = results
    .map((r) => {
      const rows = r.steps
        .map((d) => {
          const p = d.proposal;
          const held = p.approval && p.approval !== 'approved';
          const state = held
            ? badge(`${p.approval} approval`, 'warn')
            : d.verdict === 'accepted'
              ? badge('accepted', 'ok')
              : d.verdict === 'rejected'
                ? badge('rejected', 'bad')
                : d.fallback?.state === 'validated'
                  ? badge('fallback', 'ok')
                  : badge('gap', 'warn');
          const why =
            d.verdict === 'rejected'
              ? d.errors.map((e) => `${e.rule} ${e.message}`).join('; ')
              : d.locator
                ? `${d.locator.attribute}=${d.locator.id} (${d.locator.evidence})`
                : d.fallback
                  ? `no testID at ${d.fallback.key}; fallback ${d.fallback.state}${d.fallback.device ? ` on ${d.fallback.device}` : ''}`
                  : p.gap
                    ? `gap at ${p.gap}`
                    : p.rationale;
          return `<tr><td>${esc(d.step)}</td><td>${state}${p.flag ? `<div class="flag">critic: ${esc(p.flag)}</div>` : ''}</td><td>${esc({ rules: 'rules', agent: 'Copilot agent', human: 'QA', none: '-' }[p.source])}</td><td>${esc(p.action)}</td><td class="mono">${esc(why)}</td></tr>`;
        })
        .join('\n');
      return `<h3>${esc(r.platform)}</h3><div class="scroll"><table><thead><tr><th>Step</th><th>Decision</th><th>Mapped by</th><th>Action</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('\n');

  const gapRows = testIds
    .map((t) => `<tr><td>${esc(t.gap.element)}</td><td>${esc(t.gap.description ?? '-')}</td><td class="mono">${esc(evidence(t.gap))}</td><td class="mono">${esc(t.testID)}</td></tr>`)
    .join('\n');
  const patchFile = path.join(storyOutput(story).remediation, 'testids.patch');
  const patch = fs.existsSync(patchFile) ? fs.readFileSync(patchFile, 'utf-8') : '';

  const fallbackRows = Object.entries(validations)
    .flatMap(([key, byPlatform]) =>
      Object.entries(byPlatform).map(
        ([platform, rec]) =>
          `<tr><td class="mono">${esc(key)}</td><td>${esc(platform)}</td><td class="mono">${esc(rec!.selector)}</td><td>${esc(`${rec!.matches} match on ${rec!.device}, ${when(rec!.validatedAt)}`)}</td><td>${rec!.approval ? esc(`${rec!.approval.by}, ${when(rec!.approval.at)}`) : badge('awaiting', 'warn')}</td></tr>`,
      ),
    )
    .join('\n');

  // Every recorded approval, from the files the gates read.
  const audit: { what: string; approval: Approval }[] = [];
  for (const [platform, entries] of Object.entries(agent)) {
    for (const [step, e] of Object.entries(entries ?? {})) {
      if (e.approval) audit.push({ what: `[${platform}] ${e.author === 'human' ? 'QA' : 'agent'} mapping: "${step}"${e.authoredBy ? ` (written by ${e.authoredBy})` : ''}`, approval: e.approval });
    }
  }
  for (const [platform, review] of Object.entries(reviews)) {
    for (const [step, f] of Object.entries(review?.flags ?? {})) {
      if (f.approval) audit.push({ what: `[${platform}] critic-flagged rule match: "${step}"`, approval: f.approval });
    }
  }
  for (const [key, byPlatform] of Object.entries(validations)) {
    for (const [platform, rec] of Object.entries(byPlatform)) {
      if (rec?.approval) audit.push({ what: `[${platform}] fallback ${key}`, approval: rec.approval });
    }
  }
  const auditRows = audit
    .sort((a, b) => a.approval.at.localeCompare(b.approval.at))
    .map((a) => `<tr><td>${esc(a.what)}</td><td>${esc(a.approval.by)}</td><td>${esc(when(a.approval.at))}</td><td class="mono">${esc(a.approval.fingerprint)}</td></tr>`)
    .join('\n');

  const flagRows = Object.entries(reviews)
    .flatMap(([platform, review]) =>
      Object.entries(review?.flags ?? {}).map(
        ([step, f]) => `<tr><td>${esc(platform)}</td><td>${esc(step)}</td><td>${esc(f.concern)}</td><td>${f.approval ? esc(`approved by ${f.approval.by}`) : badge('awaiting', 'warn')}</td></tr>`,
      ),
    )
    .join('\n');
  const reviewNote = Object.entries(reviews)
    .map(([platform, review]) => `${platform}: ${review!.ruleMatches} rule matches reviewed by ${review!.reviewedBy}, ${when(review!.reviewedAt)}`)
    .join('; ');

  const log = run.events.map((e) => `<li><span class="muted mono">${esc(when(e.at).slice(11, 16))}</span> ${esc(e.message)}</li>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(story)} test run</title>
<style>
:root { --bg: #ffffff; --fg: #1d1f23; --muted: #6a6f78; --line: #e3e5e8; --card: #f6f7f9; --ok: #1a7f37; --ok-bg: #dcf5e3; --bad: #b42318; --bad-bg: #fde4e1; --warn: #9a6700; --warn-bg: #fff3cc; --code: #f3f4f6; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171b; --fg: #e6e8eb; --muted: #9aa1ab; --line: #2c3037; --card: #1d2026; --ok: #6fdd8b; --ok-bg: #173623; --bad: #ff9b90; --bad-bg: #401b18; --warn: #f2c14e; --warn-bg: #3a2f12; --code: #1f2329; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.6rem; margin: 0 0 4px; } h2 { font-size: 1.2rem; margin: 40px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; } h3 { font-size: 1rem; margin: 20px 0 8px; }
.muted { color: var(--muted); } .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; word-break: break-word; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; }
.card h3 { margin-top: 4px; } dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0; } dt { color: var(--muted); } dd { margin: 0; }
.badge { display: inline-block; font-size: 0.75rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; vertical-align: middle; }
.ok { color: var(--ok); background: var(--ok-bg); } .bad { color: var(--bad); background: var(--bad-bg); } .warn { color: var(--warn); background: var(--warn-bg); } .badge.muted { background: var(--code); }
.scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 0.9rem; } th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line); } th { color: var(--muted); font-weight: 600; }
details { border: 1px solid var(--line); border-radius: 8px; margin: 6px 0; padding: 6px 10px; } summary { cursor: pointer; }
ol.steps { margin: 8px 0 4px; padding-left: 22px; } ol.steps li { margin: 3px 0; }
.error { color: var(--bad); font-size: 0.85rem; margin-top: 2px; } .flag { color: var(--warn); font-size: 0.8rem; margin-top: 2px; }
pre { background: var(--code); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 0.8rem; }
ul.log { list-style: none; padding: 0; font-size: 0.85rem; } ul.log li { padding: 2px 0; }
</style>
</head>
<body>
<main>
<h1>${esc(story)} test run</h1>
<p class="muted">Started ${esc(when(run.startedAt))}, finished ${esc(when(finishedAt))}. Generated deterministically from the feature files, the app source, and test data; AI (GitHub Copilot) only proposes mappings and flags, and a person approves anything it proposed.</p>

<div class="cards">
${cards}
</div>

<h2>Device results</h2>
${deviceSections}

<h2>How each step was mapped</h2>
${mappingSections}

<h2>Testability gaps</h2>
${testIds.length ? `<p>Elements with no testID, and the testID proposed in each screen's naming convention. Engineering applies <span class="mono">${esc(path.relative(ROOT, patchFile))}</span> with <span class="mono">git apply</span>.</p>
<div class="scroll"><table><thead><tr><th>Element</th><th>Visible text</th><th>Location</th><th>Proposed testID</th></tr></thead><tbody>${gapRows}</tbody></table></div>
<details><summary>Proposed patch</summary><pre>${esc(patch)}</pre></details>` : '<p class="muted">No gaps.</p>'}

<h2>Fallback locators</h2>
${fallbackRows ? `<div class="scroll"><table><thead><tr><th>Gap</th><th>Platform</th><th>Selector</th><th>Device validation</th><th>Approved</th></tr></thead><tbody>${fallbackRows}</tbody></table></div>` : '<p class="muted">None validated.</p>'}

<h2>Match critic</h2>
${reviewNote ? `<p class="muted">${esc(reviewNote)}</p>` : '<p class="muted">The match critic has not reviewed this story.</p>'}
${flagRows ? `<div class="scroll"><table><thead><tr><th>Platform</th><th>Step</th><th>Concern</th><th>Status</th></tr></thead><tbody>${flagRows}</tbody></table></div>` : ''}

<h2>Human approvals</h2>
${auditRows ? `<div class="scroll"><table><thead><tr><th>What</th><th>By</th><th>When</th><th>Fingerprint</th></tr></thead><tbody>${auditRows}</tbody></table></div>` : '<p class="muted">No approvals recorded.</p>'}

<h2>Run log</h2>
<ul class="log">${log}</ul>
</main>
</body>
</html>
`;
}
