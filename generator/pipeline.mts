// One generation run, shared by the CLI and the MCP tools the Copilot agent
// calls, so a story generates identically however it was triggered.
import fs from 'node:fs';
import path from 'node:path';
import { generateConfig, generateSteps } from './codegen.mts';
import { loadStory, uniqueSteps } from './features.mts';
import { decideScenarios, decideStep } from './gate.mts';
import { matchStep } from './mapper/rules.mts';
import { flagApproval, mappingApproval, mappingFingerprint, type MappingEntry, type Reviews } from './approvals.mts';
import { fallbackStatus, loadValidations } from './fallbacks.mts';
import { BASE_PAGE, buildPageModel, renderPage } from './pageobjects.mts';
import { proposeTestIds, renderPatch, renderRemediation } from './remediation.mts';
import { renderMarkdown, summarize } from './report.mts';
import { loadRegistry, loadTestData, registrySnapshot } from './registry.mts';
import { PLATFORMS, type MappingInput, type Platform, type PlatformResult, type Proposal } from './types.mts';

import { loadConfig } from './config.mts';
import { ROOT, appRoot, defaultTestData, featuresDir, shown, storyOutput } from './paths.mts';

export { ROOT };

// Keyed by the story folder (features/<story>) for callers that have it.
export const proposalsFile = (storyDir: string) => storyOutput(path.basename(storyDir)).proposals;
export const defaultOutDir = (story: string) => storyOutput(story).root;

// What the Copilot agent (or a QA engineer, marked "author": "human")
// submitted, per platform and step text.
export type AgentProposals = Partial<Record<Platform, Record<string, MappingEntry>>>;

export const reviewFile = (storyDir: string) => storyOutput(path.basename(storyDir)).review;

export function readReviews(storyDir: string): Reviews {
  const file = reviewFile(storyDir);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
}

export function readAgentProposals(storyDir: string): AgentProposals {
  const file = proposalsFile(storyDir);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
}

// Story names come from MCP tool calls, so they must not reach outside
// features/ (e.g. "../../somewhere").
export function storyDir(story: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(story)) throw new Error(`invalid story id \`${story}\``);
  const dir = path.join(featuresDir(), story);
  if (!fs.existsSync(dir)) throw new Error(`no story folder ${shown(dir)}`);
  return dir;
}

export function mappingInput(dir: string, platform: Platform, testDataFile = defaultTestData()): MappingInput {
  const features = loadStory(dir);
  return { platform, steps: uniqueSteps(features[platform]), registry: loadRegistry(), testData: loadTestData(testDataFile) };
}

// Steps the rule matcher cannot map, with the reason: the only ones the
// Copilot agent is ever asked about.
export function agentSteps(input: MappingInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const step of input.steps) {
    const m = matchStep(step, input);
    if ('unresolved' in m) out[step] = m.unresolved;
  }
  return out;
}

// Rules first. The agent's proposal is used only where the rules found no
// unambiguous match, so it can never override a deterministic mapping.
export function propose(input: MappingInput, agent: AgentProposals, reviews: Reviews = {}): Proposal[] {
  const submitted = agent[input.platform] ?? {};
  const flags = reviews[input.platform]?.flags ?? {};
  return input.steps.map((step): Proposal => {
    const m = matchStep(step, input);
    if ('proposal' in m) {
      // A critic flag holds a rule match for a person, but only while it
      // still describes this exact match.
      const flag = flags[step];
      if (!flag || flag.fingerprint !== mappingFingerprint(m.proposal as MappingEntry)) return m.proposal;
      return { ...m.proposal, flag: flag.concern, approval: flagApproval(flag) };
    }
    if (submitted[step]) {
      const { author, authoredBy, approval, ...rest } = submitted[step];
      return {
        step,
        ...rest,
        intent: (rest.intent ?? null) as Proposal['intent'],
        source: author === 'human' ? 'human' : 'agent',
        approval: mappingApproval(submitted[step]),
      };
    }
    return {
      step,
      action: 'unmapped',
      locator: null,
      record: null,
      text: null,
      gap: null,
      rationale: `no rule match (${m.unresolved}); awaiting the Copilot agent (/generate-appium)`,
      source: 'none',
    };
  });
}

// The installed app's id per platform (from app.json for an Expo app, else
// app.androidPackage / app.iosBundleId in the config), so restarts between
// scenarios target the app actually under test.
function readAppIds(): Record<Platform, string> {
  const { ids } = loadConfig().app;
  const missing = PLATFORMS.filter((p) => !ids[p]);
  if (missing.length) {
    throw new Error(
      `no app id for ${missing.join(' and ')}: set app.androidPackage / app.iosBundleId in grounding.config.json (only an Expo app.json provides them automatically)`,
    );
  }
  return ids as Record<Platform, string>;
}

export interface GenerateOptions {
  outDir?: string;
  testDataFile?: string;
}

// Every decision for a story, with no files written: what the generator
// would emit, and what `npm run approve` shows a person before they sign off.
export function decideStory(dir: string, opts: GenerateOptions = {}) {
  const features = loadStory(dir);
  const registry = loadRegistry();
  const testData = loadTestData(opts.testDataFile ?? defaultTestData());
  const agent = readAgentProposals(dir);
  const reviews = readReviews(dir);
  const testIds = proposeTestIds(registry);
  const model = buildPageModel(registry, testIds);
  const validations = loadValidations(path.basename(dir));

  const results: PlatformResult[] = PLATFORMS.map((platform) => {
    const feature = features[platform];
    const proposals = propose({ platform, steps: uniqueSteps(feature), registry, testData }, agent, reviews);
    const steps = proposals.map((p) => {
      const d = decideStep(p, registry, testData);
      const member = d.gap && model.byGap.get(`${d.gap.file}:${d.gap.line}`);
      if (!d.gap || !member?.fallback) return d;
      const st = fallbackStatus(d.gap, platform, validations);
      if (st.state === 'none') return d;
      const rec = 'record' in st ? st.record : undefined;
      return {
        ...d,
        fallback: {
          state: st.state,
          key: member.fallback.key,
          proposedTestID: member.fallback.proposedTestID,
          matches: rec?.matches,
          device: rec?.device,
          validatedAt: rec?.validatedAt,
          approvedBy: st.state === 'validated' ? rec?.approval?.by : undefined,
        },
      };
    });
    return {
      platform,
      feature: { ...feature, file: shown(feature.file) },
      steps,
      scenarios: decideScenarios(feature, steps, testData),
    };
  });
  return { features, registry, testData, agent, reviews, testIds, model, validations, results };
}

export function generateStory(dir: string, opts: GenerateOptions = {}) {
  const story = path.basename(dir);
  const outDir = opts.outDir ?? defaultOutDir(story);
  const { features, registry, testData, testIds, model, results } = decideStory(dir, opts);

  // Page objects cover the whole app's registry and are regenerated into the
  // story's own output, replacing the folder so a screen removed from the app
  // does not leave a stale page behind.
  const pageObjectsDir = path.join(outDir, 'pageobjects');
  fs.rmSync(pageObjectsDir, { recursive: true, force: true });
  fs.mkdirSync(pageObjectsDir, { recursive: true });
  fs.writeFileSync(path.join(pageObjectsDir, 'base.page.ts'), BASE_PAGE);
  for (const page of model.pages.values()) {
    if (page.members.length) fs.writeFileSync(path.join(pageObjectsDir, `${page.file}.ts`), renderPage(page));
  }

  fs.mkdirSync(outDir, { recursive: true });
  const appIds = readAppIds();
  for (const r of results) {
    const stepsDir = path.join(outDir, r.platform);
    fs.mkdirSync(stepsDir, { recursive: true });
    fs.writeFileSync(path.join(stepsDir, 'steps.ts'), generateSteps(r, model, testData, stepsDir, pageObjectsDir));
    for (const target of ['sauce', 'local'] as const) {
      fs.writeFileSync(
        path.join(outDir, `wdio.${r.platform}${target === 'local' ? '.local' : ''}.conf.ts`),
        generateConfig(story, r.platform, features[r.platform].file, outDir, target, appIds[r.platform], loadConfig()),
      );
    }
  }
  // One patch for every gap in the app, like the page objects.
  const remediationDir = path.join(outDir, 'remediation');
  fs.mkdirSync(remediationDir, { recursive: true });
  fs.writeFileSync(path.join(remediationDir, 'testids.patch'), renderPatch(appRoot(), testIds));
  fs.writeFileSync(path.join(remediationDir, 'README.md'), renderRemediation(testIds));

  fs.writeFileSync(path.join(outDir, 'grounding-report.md'), renderMarkdown(story, results));
  fs.writeFileSync(path.join(outDir, 'grounding-report.json'), JSON.stringify(results, null, 2) + '\n');
  // For the record: the locator registry these tests were grounded against.
  fs.writeFileSync(path.join(outDir, 'registry.json'), JSON.stringify(registrySnapshot(registry), null, 2) + '\n');

  // The gate outcome alone decides pass/fail: a rejected proposal or a G5
  // scenario error means the generated tests would be wrong.
  const failed = results.some((r) => {
    const s = summarize(r);
    return s.rejected > 0 || s.scenarioErrors > 0;
  });
  return { story, outDir, pageObjectsDir, results, failed };
}
