// Deterministic WebdriverIO + Cucumber codegen from gate decisions. The
// feature files stay the executable spec; this emits their step definitions,
// which act only through the shared page objects (pageobjects.mts), and a
// local and a Sauce Labs config per platform.
import path from 'node:path';
import { APPROVAL_REASON } from './approvals.mts';
import type { GroundingConfig, RunTarget } from './config.mts';
import { importPath, memberCall, type PageMember, type PageModel } from './pageobjects.mts';
import type { Platform, PlatformResult, StepDecision, StepKind, TestData } from './types.mts';
import { VENDOR_ADAPTERS, adapterFor } from './vendors.mts';

const KEYWORD: Record<StepKind, string> = { context: 'Given', action: 'When', outcome: 'Then' };

function stepPattern(text: string): string {
  // Regex rather than a Cucumber Expression: step text may contain {, (, or /
  // which Cucumber Expressions would treat as syntax.
  return `/^${text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$/`;
}

function recordOf(testData: TestData, ref: string | null): Record<string, unknown> | undefined {
  if (!ref) return undefined;
  const [collection, key] = ref.split('.');
  return testData.records[collection]?.[key];
}

const act = (intent: string, el: string, text: string | null, opts = '', helper = '') =>
  ({
    tap: `await ${el}.click();`,
    choose: `await ${helper}(${el}, ${JSON.stringify(text)});`,
    type: `await typeText(${el}, ${JSON.stringify(text)});`,
    assertVisible: `await expectShown(${el}${opts});`,
    assertNotVisible: `await expectHidden(${el}${opts});`,
  })[intent as 'tap' | 'type' | 'choose' | 'assertVisible' | 'assertNotVisible'];

// A gap step acts through its fallback member only once a device run has
// validated that fallback on this platform. Unvalidated, it runs only in a
// validation run (VALIDATE_FALLBACKS=1), which records the result.
function fallbackBody(d: StepDecision, member: PageMember, platform: Platform): string[] {
  const fb = d.fallback!;
  const el = memberCall(member, undefined);
  const head = `// FALLBACK: no testID at ${fb.key} (proposed: ${fb.proposedTestID})`;
  if (fb.state === 'validated') {
    return [
      `${head}; validated on ${fb.device}, ${fb.validatedAt?.slice(0, 10)}, 1 match; approved by ${fb.approvedBy}`,
      act(d.proposal.intent!, el, d.proposal.text),
    ];
  }
  if (fb.state === 'awaiting-approval') {
    return [`${head}; validated on ${fb.device} (1 match), awaiting human approval (npm run approve)`, `return 'pending';`];
  }
  if (fb.state === 'failed') {
    return [`${head}; failed validation on ${platform}: ${fb.matches} matches, needs exactly 1`, `return 'pending';`];
  }
  return [
    `${head}; not yet validated on ${platform}, so this runs only with VALIDATE_FALLBACKS=1`,
    `if (!process.env.VALIDATE_FALLBACKS) return 'pending';`,
    `const el = ${el};`,
    `await validateFallback(${JSON.stringify(fb.key)});`,
    act(d.proposal.intent!, 'el', d.proposal.text),
  ];
}

function body(d: StepDecision, model: PageModel, testData: TestData, pagesUsed: Set<string>, platform: Platform): string[] {
  // A mapping from the agent or a QA entry is not used until a person
  // approves it, whatever the gate said: the gate checks that a mapping is
  // possible, a person checks that it is right.
  if (d.proposal.approval && d.proposal.approval !== 'approved') {
    const what = d.proposal.flag
      ? `Rule match flagged by the match critic ("${d.proposal.flag}")`
      : `${d.proposal.source === 'agent' ? 'Copilot agent' : 'QA'} mapping`;
    return [`// ${what} ${APPROVAL_REASON[d.proposal.approval]}; gate verdict: ${d.verdict}`, `return 'pending';`];
  }
  const fallbackMember = d.fallback && model.byGap.get(d.fallback.key);
  if (fallbackMember) {
    pagesUsed.add(fallbackMember.file);
    return fallbackBody(d, fallbackMember, platform);
  }
  if (d.verdict !== 'accepted') {
    const why =
      d.verdict === 'ungrounded'
        ? [`UNGROUNDED: ${d.proposal.rationale}`, ...(d.proposal.gap ? [`testability gap at ${d.proposal.gap}`] : ['no source evidence'])]
        : ['REJECTED by the grounding gate:', ...d.errors.map((e) => `${e.rule} ${e.message}`)];
    return [...why.map((l) => `// ${l}`), `return 'pending';`];
  }
  const p = d.proposal;
  const by = `proposed by ${{ rules: 'rule match', agent: 'Copilot agent', human: 'QA (manual mapping)', none: '-' }[p.source]}`;
  if (p.action === 'back') return [`// ${by}`, 'await driver.back();'];

  const loc = d.locator!;
  const member = model.byValue.get(p.locator!);
  // The gate only accepts registry values, and every static or templated
  // registry value has a page member, so a miss here is a generator bug.
  if (!member) throw new Error(`no page object member for ${p.locator}`);
  pagesUsed.add(member.file);
  const el = memberCall(member, recordOf(testData, p.record));
  const opts = member.container ? ', { container: true }' : '';
  const notes = [
    `// ${loc.attribute}=${loc.id} (${loc.evidence}), ${by}`,
    ...d.warnings.map((w) => `// WARNING ${w.rule}: ${w.message}`),
  ];
  const helper = p.action === 'choose' ? adapterFor(member.finding.module)!.helper : '';
  if (helper) notes.push(`// vendor adapter for ${member.finding.module} (base.page.ts ${helper})`);
  return [...notes, act(p.action, el, p.text, opts, helper)];
}

// One step definition as generated: its Cucumber pattern, its code, and
// the page object it acts on (null for steps that act on no page).
interface StepDef {
  keyword: string;
  pattern: string;
  params: string[];
  lines: string[];
  page: string | null;
  steps: string[]; // the step texts it covers, for the collision check
}

const QUOTED = /"([^"]*)"/g;
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const isComment = (l: string) => l.trimStart().startsWith('//');

// Steps that differ only in a quoted value ("member.entitled",
// "member.restricted") share one definition with a parameter, when the value
// goes straight into the code (a typed text, a record id) and every step of
// that phrasing produces the same code. Otherwise each step keeps a literal
// definition, so two definitions can never match the same step.
function parameterize(group: { step: string; lines: string[]; page: string | null }[]): StepDef['lines'] | null {
  const shape = (g: (typeof group)[number]) => {
    const values = [...g.step.matchAll(QUOTED)].map((m) => m[1]);
    const code = g.lines.filter((l) => !isComment(l)).join('\n');
    let out = code;
    for (const [i, v] of values.entries()) {
      const lit = JSON.stringify(v);
      if (!out.includes(lit)) return null; // a value the code does not use: keep literal
      out = out.split(lit).join(`\u0000${i}`);
    }
    return out;
  };
  const shapes = group.map(shape);
  if (shapes.some((x) => x === null) || new Set(shapes).size !== 1) return null;
  const params = [...group[0].step.matchAll(QUOTED)].map((_, i) => `arg${i + 1}`);
  // Comments come from the first use, with its values shown as parameters.
  const first = group[0];
  const values = [...first.step.matchAll(QUOTED)].map((m) => m[1]);
  return first.lines.map((l) => {
    let out = l;
    for (const [i, v] of values.entries()) out = out.split(JSON.stringify(v)).join(isComment(l) ? `{${params[i]}}` : params[i]);
    return out;
  });
}

function platformDefs(result: PlatformResult, model: PageModel, testData: TestData): StepDef[] {
  // A step's keyword comes from its first use; Cucumber matches definitions
  // regardless of keyword, so this only affects readability.
  const kinds = new Map<string, StepKind>();
  for (const st of result.feature.scenarios.flatMap((sc) => sc.steps)) {
    if (!kinds.has(st.text)) kinds.set(st.text, st.kind);
  }
  const built = result.steps.map((d) => {
    const pages = new Set<string>();
    const lines = body(d, model, testData, pages, result.platform);
    return { step: d.step, lines, page: [...pages][0] ?? null };
  });

  // Group by phrasing with quoted values blanked out, in first-use order.
  const groups = new Map<string, typeof built>();
  for (const b of built) {
    const template = b.step.replace(QUOTED, '"\u0000"');
    groups.set(template, [...(groups.get(template) ?? []), b]);
  }
  const defs: StepDef[] = [];
  for (const [template, group] of groups) {
    const keyword = KEYWORD[kinds.get(group[0].step) ?? 'action'];
    const lines = template.includes('\u0000') ? parameterize(group) : null;
    if (lines) {
      const params = [...group[0].step.matchAll(QUOTED)].map((_, i) => `arg${i + 1}`);
      const pattern = `/^${template.split('"\u0000"').map(escapeRe).join('"([^"]*)"')}$/`;
      defs.push({ keyword, pattern, params, lines, page: group[0].page, steps: group.map((g) => g.step) });
    } else {
      for (const g of group) defs.push({ keyword, pattern: stepPattern(g.step), params: [], lines: g.lines, page: g.page, steps: [g.step] });
    }
  }
  // Exactly one definition per step, or Cucumber stops on ambiguity.
  for (const b of built) {
    const matching = defs.filter((d) => new RegExp(d.pattern.slice(1, -1)).test(b.step));
    if (matching.length !== 1) throw new Error(`step "${b.step}" matches ${matching.length} definitions on ${result.platform}`);
  }
  return defs;
}

const render = (d: StepDef) => [
  `${d.keyword}(${d.pattern}, async (${d.params.map((p) => `${p}: string`).join(', ')}) => {`,
  ...d.lines.map((l) => `  ${l}`),
  '});',
  '',
];

// Step definitions split by the page object they act on, one file per page
// (login.steps.ts beside login.page.ts), so pages and their steps can be
// collected into a shared corpus. A definition identical on both platforms
// goes in steps/common/; one that differs (a fallback validated on one
// platform only, an approval given for one) goes in steps/<platform>/. Steps
// acting on no page go in pending.steps.ts (not runnable yet) or
// app.steps.ts (device-level, like back). Returns relative path -> content.
export function generateStepFiles(
  results: PlatformResult[],
  model: PageModel,
  testData: TestData,
  stepsRoot: string,
  pageObjectsDir: string,
  story: string,
): Map<string, string> {
  const perPlatform = new Map(results.map((r) => [r.platform, platformDefs(r, model, testData)]));
  const key = (d: StepDef) => `${d.pattern}\n${d.lines.join('\n')}`;
  const everywhere = (d: StepDef) => results.every((r) => perPlatform.get(r.platform)!.some((o) => key(o) === key(d)));

  const files = new Map<string, { dir: string; name: string; page: string | null; defs: StepDef[] }>();
  const add = (dir: string, d: StepDef) => {
    const name = d.page
      ? d.page.replace(/\.page$/, '')
      : d.lines.some((l) => l === `return 'pending';` || l.includes("return 'pending'"))
        ? 'pending'
        : 'app';
    const rel = `${dir}/${name}.steps.ts`;
    const file = files.get(rel) ?? { dir, name, page: d.page, defs: [] };
    if (!file.defs.some((o) => key(o) === key(d))) file.defs.push(d);
    files.set(rel, file);
  };
  for (const r of results) {
    for (const d of perPlatform.get(r.platform)!) add(everywhere(d) ? 'common' : r.platform, d);
  }

  const classOf = new Map([...model.pages.values()].map((pg) => [pg.file, pg.cls]));
  const out = new Map<string, string>();
  for (const [rel, f] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const dir = path.join(stepsRoot, f.dir);
    const code = f.defs.flatMap(render);
    const pages = [...new Set(f.defs.map((d) => d.page).filter((p): p is string => !!p))].sort();
    const baseHelpers = [
      'expectShown',
      'expectHidden',
      'typeText',
      'validateFallback',
      ...new Set(Object.values(VENDOR_ADAPTERS).map((a) => a.helper)),
    ].filter((h) => code.some((l) => l.includes(`${h}(`)));
    const where = f.dir === 'common' ? 'on both platforms' : `on ${f.dir} only`;
    const what = f.page ? `acting on ${classOf.get(f.page)}` : f.name === 'pending' ? 'not runnable yet' : 'acting on the device';
    out.set(
      rel,
      [
        `// GENERATED for ${story}: steps ${what}, ${where}. Do not edit;`,
        `// fix the feature, test data, or app testIDs and regenerate.`,
        `import { Given, When, Then } from '@wdio/cucumber-framework';`,
        ...(code.some((l) => l.includes('driver.')) ? [`import { driver } from '@wdio/globals';`] : []),
        ...(baseHelpers.length ? [`import { ${baseHelpers.join(', ')} } from '${importPath(dir, pageObjectsDir, 'base.page')}';`] : []),
        ...pages.map((pg) => `import ${classOf.get(pg)} from '${importPath(dir, pageObjectsDir, pg)}';`),
        '',
        ...code,
      ].join('\n'),
    );
  }
  return out;
}

export type { RunTarget };

// Local emulator/simulator capabilities. Sauce Labs devices come from the
// config (run.sauce.android / run.sauce.ios).
const LOCAL_DEVICE: Record<Platform, Record<string, string | number>> = {
  // A local emulator sharing a laptop with builds can take longer than
  // Appium's 20s default for routine adb commands (pm clear timed out).
  android: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android Emulator',
    'appium:adbExecTimeout': 60000,
  },
  // WebDriverAgent is built and launched on the simulator on first use,
  // which outlasts Appium's default wait on a busy machine.
  ios: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone 17',
    'appium:wdaLaunchTimeout': 240000,
    'appium:wdaConnectionTimeout': 240000,
  },
};

// Where a local Expo build of the app lands, relative to the app root.
// Override with APP_ANDROID / APP_IOS.
const LOCAL_APP: Record<Platform, string> = {
  android: 'android/app/build/outputs/apk/release/app-release.apk',
  ios: 'ios/build/Build/Products/Release-iphonesimulator/rngroundingtest.app',
};

const PLATFORM_NAME: Record<Platform, string> = { android: 'Android', ios: 'iOS' };

export function generateConfig(
  story: string,
  platform: Platform,
  featureFile: string,
  outDir: string,
  target: RunTarget,
  appId: string,
  config: GroundingConfig,
): string {
  const spec = path.relative(outDir, featureFile);
  const sauce = config.run.sauce;
  const device = sauce.devices[platform];
  const capsOf: Record<string, string | number> =
    target === 'sauce'
      ? {
          platformName: PLATFORM_NAME[platform],
          'appium:automationName': device.automationName,
          'appium:deviceName': device.deviceName,
          ...(device.platformVersion && { 'appium:platformVersion': device.platformVersion }),
        }
      : LOCAL_DEVICE[platform];
  const caps = Object.entries(capsOf)
    .map(([k, v]) => `      '${k}': ${typeof v === 'number' ? v : JSON.stringify(v)},`)
    .join('\n');
  const appEnv = target === 'sauce' ? `SAUCE_APP_${platform.toUpperCase()}` : `APP_${platform.toUpperCase()}`;
  const header =
    target === 'sauce'
      ? `// GENERATED by the grounding generator. Sauce Labs run for ${story} on ${platform}.
// Needs SAUCE_USERNAME and SAUCE_ACCESS_KEY; the app is ${appEnv}, else run.sauce.${platform}.app in grounding.config.json.`
      : `// GENERATED by the grounding generator. Local run for ${story} on ${platform}: starts Appium itself
// and installs the local build (override with ${appEnv}) on a running ${platform === 'ios' ? 'simulator' : 'emulator'}.`;
  const connection =
    target === 'sauce'
      ? `  user: process.env.SAUCE_USERNAME,
  key: process.env.SAUCE_ACCESS_KEY,
  region: (process.env.SAUCE_REGION ?? ${JSON.stringify(sauce.region)}) as WebdriverIO.Config['region'],
  services: ['sauce'],
  // Sauce Labs can take minutes to allocate a real device.
  connectionRetryTimeout: 300000,
  connectionRetryCount: 2,`
      : `  port: 4723,
  services: ['appium'],`;
  const app =
    target === 'sauce'
      ? `process.env.${appEnv}${device.app ? ` ?? ${JSON.stringify(device.app)}` : ''}`
      : `process.env.${appEnv} ?? path.resolve(__dirname, ${JSON.stringify(path.relative(outDir, path.join(config.app.root, LOCAL_APP[platform])))})`;
  const vendor =
    target === 'sauce'
      ? `
      'sauce:options': {
        appiumVersion: 'latest',
        build: process.env.SAUCE_BUILD ?? ${JSON.stringify(sauce.build ?? story)},
        name: '${story} ${platform}',${
          sauce.tunnelName ? `\n        tunnelName: process.env.SAUCE_TUNNEL_NAME ?? ${JSON.stringify(sauce.tunnelName)},` : `\n        ...(process.env.SAUCE_TUNNEL_NAME && { tunnelName: process.env.SAUCE_TUNNEL_NAME }),`
        }
      },`
      : '';
  return `${header}
import fs from 'node:fs';
import path from 'node:path';

// With RESULTS_FILE set (npm run story, the run_on_device tool), each step's
// outcome is appended as a JSON line while the suite runs, for live
// commentary and the run report.
const record = (entry: Record<string, unknown>) => {
  if (process.env.RESULTS_FILE) fs.appendFileSync(process.env.RESULTS_FILE, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\\n');
};

export const config: WebdriverIO.Config = {
${connection}
  specs: ['${spec}'],
  framework: 'cucumber',
  cucumberOpts: {
    // Cucumber resolves these from the working directory, not this file.
    require: [path.resolve(__dirname, 'steps/common/*.steps.ts'), path.resolve(__dirname, 'steps/${platform}/*.steps.ts')],
    timeout: 120000,
  },
  reporters: ['spec'],
  maxInstances: 1,
  // Assertions and element lookups wait up to this long. The 5s default
  // failed a screen transition on a freshly booted emulator.
  waitforTimeout: 15000,
  capabilities: [
    {
${caps}
      'appium:app': ${app},${vendor}
    },
  ],
  // Every scenario starts from a cold launch (the login screen); the app
  // keeps its signed-in session in memory, so a restart is a clean slate.
  beforeScenario: async (world) => {
    await driver.terminateApp('${appId}');
    await driver.activateApp('${appId}');
    record({ event: 'scenario', scenario: world.pickle.name });
  },
  afterStep: async (step, scenario, result) => {
    const error = result.error ? String(result.error).split('\\n')[0] : undefined;
    record({ event: 'step', scenario: scenario.name, step: step.text, passed: result.passed, error });
  },
  afterScenario: async (world, result) => {
    record({ event: 'scenarioEnd', scenario: world.pickle.name, passed: result.passed, status: world.result?.status });
  },
};
`;
}
