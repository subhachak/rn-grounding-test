// Deterministic WebdriverIO + Cucumber codegen from gate decisions. The
// feature files stay the executable spec; this emits their step definitions,
// which act only through the shared page objects (pageobjects.mts), and a
// local and a Sauce Labs config per platform.
import path from 'node:path';
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
    return [`${head}; validated on ${fb.device}, ${fb.validatedAt?.slice(0, 10)}, 1 match`, act(d.proposal.intent!, el, d.proposal.text)];
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

export function generateSteps(
  result: PlatformResult,
  model: PageModel,
  testData: TestData,
  stepsDir: string,
  pageObjectsDir: string,
): string {
  // A step's keyword comes from its first use; Cucumber matches definitions
  // regardless of keyword, so this only affects readability.
  const kinds = new Map<string, StepKind>();
  for (const s of result.feature.scenarios.flatMap((sc) => sc.steps)) {
    if (!kinds.has(s.text)) kinds.set(s.text, s.kind);
  }

  const pagesUsed = new Set<string>();
  const defs: string[] = [];
  for (const d of result.steps) {
    defs.push(`${KEYWORD[kinds.get(d.step) ?? 'action']}(${stepPattern(d.step)}, async () => {`);
    defs.push(...body(d, model, testData, pagesUsed, result.platform).map((l) => `  ${l}`));
    defs.push('});', '');
  }

  const classOf = new Map([...model.pages.values()].map((pg) => [pg.file, pg.cls]));
  return [
    `// GENERATED by generator/cli.mts from ${result.feature.file}. Do not edit;`,
    `// fix the feature, test data, or app testIDs and regenerate.`,
    `import { Given, When, Then } from '@wdio/cucumber-framework';`,
    ...(defs.some((l) => l.includes('driver.')) ? [`import { driver } from '@wdio/globals';`] : []),
    `import { ${[
      'expectShown',
      'expectHidden',
      'typeText',
      ...(defs.some((l) => l.includes('validateFallback(')) ? ['validateFallback'] : []),
      ...[...new Set(Object.values(VENDOR_ADAPTERS).map((a) => a.helper))].filter((h) => defs.some((l) => l.includes(`${h}(`))),
    ].join(', ')} } from '${importPath(stepsDir, pageObjectsDir, 'base.page')}';`,
    ...[...pagesUsed].sort().map((f) => `import ${classOf.get(f)} from '${importPath(stepsDir, pageObjectsDir, f)}';`),
    '',
    ...defs,
  ].join('\n');
}

export type RunTarget = 'sauce' | 'local';

const DEVICE: Record<RunTarget, Record<Platform, Record<string, string | number>>> = {
  sauce: {
    android: { platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:deviceName': 'Google Pixel.*' },
    ios: { platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:deviceName': 'iPhone.*' },
  },
  local: {
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
  },
};

// The app binary each target installs. Local builds come from
// `npx expo run:*` / Gradle; override with APP_ANDROID / APP_IOS.
const LOCAL_APP: Record<Platform, string> = {
  android: 'android/app/build/outputs/apk/release/app-release.apk',
  ios: 'ios/build/Build/Products/Release-iphonesimulator/rngroundingtest.app',
};

export function generateConfig(
  story: string,
  platform: Platform,
  featureFile: string,
  outDir: string,
  target: RunTarget,
  appId: string,
): string {
  const spec = path.relative(outDir, featureFile);
  const caps = Object.entries(DEVICE[target][platform])
    .map(([k, v]) => `      '${k}': ${typeof v === 'number' ? v : `'${v}'`},`)
    .join('\n');
  const appEnv = target === 'sauce' ? `SAUCE_APP_${platform.toUpperCase()}` : `APP_${platform.toUpperCase()}`;
  const header =
    target === 'sauce'
      ? `// GENERATED by generator/cli.mts. Sauce Labs run for ${story} on ${platform}.
// Needs SAUCE_USERNAME, SAUCE_ACCESS_KEY, and ${appEnv} (e.g. storage:filename=app.${platform === 'ios' ? 'ipa' : 'apk'}).`
      : `// GENERATED by generator/cli.mts. Local run for ${story} on ${platform}: starts Appium itself
// and installs the local build (override with ${appEnv}) on a running ${platform === 'ios' ? 'simulator' : 'emulator'}.`;
  const connection =
    target === 'sauce'
      ? `  user: process.env.SAUCE_USERNAME,
  key: process.env.SAUCE_ACCESS_KEY,
  region: (process.env.SAUCE_REGION as 'us' | 'eu' | undefined) ?? 'us',
  services: ['sauce'],`
      : `  port: 4723,
  services: ['appium'],`;
  const app =
    target === 'sauce'
      ? `process.env.${appEnv}`
      : `process.env.${appEnv} ?? path.resolve(__dirname, ${JSON.stringify(path.relative(outDir, path.join(path.dirname(featureFile), '../..', LOCAL_APP[platform])))})`;
  const vendor =
    target === 'sauce'
      ? `
      'sauce:options': {
        appiumVersion: 'latest',
        build: process.env.SAUCE_BUILD ?? '${story}',
        name: '${story} ${platform}',
      },`
      : '';
  return `${header}
import path from 'node:path';

export const config: WebdriverIO.Config = {
${connection}
  specs: ['${spec}'],
  framework: 'cucumber',
  cucumberOpts: {
    // Cucumber resolves these from the working directory, not this file.
    require: [path.resolve(__dirname, '${platform}/steps.ts')],
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
  beforeScenario: async () => {
    await driver.terminateApp('${appId}');
    await driver.activateApp('${appId}');
  },
};
`;
}
