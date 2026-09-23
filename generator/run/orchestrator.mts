// One story, end to end: scan and generate, human approvals, device runs
// (validating fallbacks first when needed), and an HTML report. Every phase
// is deterministic; the only inputs from outside are a person's approvals,
// asked through the RunIO port (terminal prompt or a VS Code form), never
// answered by a model.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, decideStory, generateStory, storyDir } from '../pipeline.mts';
import { summarize } from '../report.mts';
import { PLATFORMS, type Platform } from '../types.mts';
import { applyApprovals, listPending, type Pending } from './approval-store.mts';
import { ensureBuild, ensureDevice, runSuite, type SuiteResult } from './devices.mts';
import { renderHtmlReport } from './html.mts';

export interface ApprovalDecision {
  by: string;
  approved: Pending[];
}

export interface RunIO {
  say(message: string): void;
  // Show the items and their evidence to a person; null means they chose
  // not to decide now (the items stay pending).
  approve(items: Pending[]): Promise<ApprovalDecision | null>;
}

export interface RunState {
  story: string;
  startedAt: string;
  events: { at: string; message: string }[];
  approvals: { at: string; by: string; items: string[] }[];
  suites: SuiteResult[];
}

export const runDir = (story: string) => path.join(ROOT, 'reports', story);
const runFile = (story: string) => path.join(runDir(story), 'run.json');

export function loadRun(story: string): RunState {
  const file = runFile(story);
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf-8'))
    : { story, startedAt: new Date().toISOString(), events: [], approvals: [], suites: [] };
}

export function startRun(story: string): RunState {
  const state: RunState = { story, startedAt: new Date().toISOString(), events: [], approvals: [], suites: [] };
  saveRun(state);
  return state;
}

function saveRun(state: RunState) {
  fs.mkdirSync(runDir(state.story), { recursive: true });
  fs.writeFileSync(runFile(state.story), JSON.stringify(state, null, 2) + '\n');
}

// Every change re-reads run.json and writes it straight back: phases run
// for minutes and several writers (commentary, suite results, approvals)
// interleave, and a phase holding its own copy overwrote the suite results
// with a stale one.
function updateRun(story: string, change: (state: RunState) => void) {
  const state = loadRun(story);
  change(state);
  saveRun(state);
}

// Commentary goes to the caller and into the run log for the report.
function narrator(story: string, io: RunIO) {
  return (message: string) => {
    updateRun(story, (s) => s.events.push({ at: new Date().toISOString(), message }));
    io.say(message);
  };
}

export function phaseScan(story: string, io: RunIO): string[] {
  const say = narrator(story, io);
  const dir = storyDir(story);
  say(`Scanning the app source and generating tests for ${story}.`);
  const run = generateStory(dir);
  const notes: string[] = [];
  for (const r of run.results) {
    const s = summarize(r);
    say(
      `${r.platform}: ${s.steps} steps. ${s.byRules} mapped by rules, ${s.byAgent + s.byHuman} by agent/QA (approved), ` +
        `${s.awaitingApproval} awaiting approval, ${s.awaitingAgent} with no mapping yet, ${s.rejected} rejected, ` +
        `${s.fallbacksValidated} on approved fallbacks, ${s.flagged} flagged by the critic.`,
    );
    if (s.awaitingAgent) notes.push(`${r.platform}: ${s.awaitingAgent} steps have no mapping; they run as pending until the agent or QA maps them.`);
    if (s.rejected) notes.push(`${r.platform}: ${s.rejected} mappings were rejected by the gate; see the report.`);
    if (s.scenarioErrors) notes.push(`${r.platform}: ${s.scenarioErrors} scenario checks failed (persona/test data); see the report.`);
  }
  for (const n of notes) say(n);
  return notes;
}

export async function phaseApprovals(story: string, io: RunIO, platforms: Platform[] = PLATFORMS): Promise<number> {
  const say = narrator(story, io);
  const dir = storyDir(story);
  const pending = listPending(dir, platforms);
  if (!pending.length) {
    say('Nothing is waiting for human approval.');
    return 0;
  }
  say(`${pending.length} item(s) need a person's approval before tests use them. Pausing for your decision.`);
  const decision = await io.approve(pending);
  if (!decision || !decision.approved.length) {
    say('No approvals given; those steps stay pending in this run.');
    return 0;
  }
  applyApprovals(dir, decision.approved, decision.by);
  updateRun(story, (s) =>
    s.approvals.push({ at: new Date().toISOString(), by: decision.by, items: decision.approved.map((p) => `[${p.platform}] ${p.kind}: ${p.id}`) }),
  );
  say(`${decision.approved.length} approved by ${decision.by}. Regenerating.`);
  generateStory(dir);
  return decision.approved.length;
}

export async function phaseDevice(story: string, platform: Platform, io: RunIO, opts: { rebuild?: boolean } = {}): Promise<SuiteResult> {
  const say = narrator(story, io);
  const dir = storyDir(story);
  const device = await ensureDevice(platform, say);
  await ensureBuild(platform, say, opts.rebuild);

  const unvalidated = () =>
    decideStory(dir).results.find((r) => r.platform === platform)!.steps.filter((d) => d.fallback?.state === 'unvalidated');
  if (unvalidated().length) {
    say(`${unvalidated().length} fallback locator(s) are not yet validated on ${platform}; validating them on the device first.`);
    const validation = await runSuite(story, platform, device, { validateFallbacks: true, say });
    updateRun(story, (s) => s.suites.push(validation));
    generateStory(dir);
    await phaseApprovals(story, io, [platform]);
  }

  const result = await runSuite(story, platform, device, { validateFallbacks: false, say });
  updateRun(story, (s) => s.suites.push(result));
  const count = (s: string) => result.steps.filter((x) => x.status === s).length;
  say(`${platform} done: ${count('passed')} passed, ${count('failed')} failed, ${count('pending')} pending.`);
  return result;
}

export function phaseReport(story: string, io: RunIO): string {
  const say = narrator(story, io);
  const state = loadRun(story);
  const html = renderHtmlReport(story, decideStory(storyDir(story)), loadRun(story));
  const stamp = state.startedAt.replace(/[:.]/g, '-');
  const file = path.join(runDir(story), `report-${stamp}.html`);
  fs.writeFileSync(file, html);
  fs.writeFileSync(path.join(runDir(story), 'latest.html'), html);
  say(`Report written: ${path.relative(ROOT, file)} (also reports/${story}/latest.html).`);
  return file;
}

export async function runStory(story: string, io: RunIO, opts: { platforms?: Platform[]; devices?: boolean; rebuild?: boolean } = {}) {
  startRun(story);
  phaseScan(story, io);
  await phaseApprovals(story, io);
  if (opts.devices !== false) {
    for (const platform of opts.platforms ?? PLATFORMS) {
      try {
        await phaseDevice(story, platform, io, { rebuild: opts.rebuild });
      } catch (e) {
        narrator(story, io)(`${platform} device run failed: ${(e as Error).message}`);
      }
    }
  }
  return phaseReport(story, io);
}
