// Deterministic WebdriverIO page objects, one per screen, generated from the
// whole app's registry and shared by every story's step definitions. Locators
// live only here; steps reference page members, so a changed testID is one
// regenerated line rather than an edit in every step that uses it.
import path from 'node:path';
import { evaluateExpression } from './conditions.mts';
import { fallbackSelectors, type Selectors } from './fallbacks.mts';
import { evidence } from './registry.mts';
import type { TestIdProposal } from './remediation.mts';
import type { RegistryFinding } from './types.mts';

export interface PageMember {
  page: string; // class name, e.g. LoginPage
  file: string; // e.g. login.page
  name: string; // getter or method name
  params: string[]; // empty for a getter
  paramSources: string[]; // template expressions feeding each param, e.g. item.id
  container: boolean; // an RN View wrapping other elements
  finding: RegistryFinding;
  // Set for a testability gap: located by source-derived fallback selectors
  // until its proposed testID lands. The member already has the name that
  // testID will produce, so steps are unchanged when it does.
  fallback?: { key: string; selectors: Selectors; proposedTestID: string };
}

export interface PageModel {
  pages: Map<string, { cls: string; file: string; screen: string; members: PageMember[]; gaps: RegistryFinding[] }>;
  byValue: Map<string, PageMember>;
  byGap: Map<string, PageMember>; // gap location (file:line) -> fallback member
}

const words = (s: string) => s.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean).map((w) => w.toLowerCase());
const camel = (ws: string[]) => ws.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
const pascal = (ws: string[]) => ws.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const TEMPLATE = /^\{`(.*)`\}$/s;

function screenWords(screen: string): string[] {
  const ws = words(screen);
  return ws[ws.length - 1] === 'screen' ? ws.slice(0, -1) : ws;
}

// A member is named from its testID. The screen's own words are dropped when
// the ID starts with all of them (login-submit-button on Login -> submitButton);
// a screen's root container is `root`.
function memberName(f: RegistryFinding, screen: string[]): string {
  const raw = (f.value ?? '').replace(TEMPLATE, '$1').replace(/\$\{[^}]*\}/g, ' ');
  let ws = words(raw);
  const prefixed = screen.length < ws.length && screen.every((w, i) => ws[i] === w);
  if (prefixed) ws = ws.slice(screen.length);
  if (/View$/.test(f.element) && ws[ws.length - 1] === 'screen') return 'root';
  const name = camel(ws.length ? ws : ['element']);
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

export function buildPageModel(registry: RegistryFinding[], proposals: TestIdProposal[] = []): PageModel {
  const pages: PageModel['pages'] = new Map();
  const byValue = new Map<string, PageMember>();
  const byGap = new Map<string, PageMember>();
  const proposedFor = new Map(proposals.map((p) => [evidence(p.gap), p.testID]));

  for (const f of registry) {
    let page = pages.get(f.screen);
    if (!page) {
      const sw = screenWords(f.screen);
      page = { cls: `${pascal(sw)}Page`, file: `${sw.join('-')}.page`, screen: f.screen, members: [], gaps: [] };
      pages.set(f.screen, page);
    }
    if (f.category === 'missing') {
      page.gaps.push(f);
      const selectors = fallbackSelectors(f);
      const proposedTestID = proposedFor.get(evidence(f));
      if (selectors && proposedTestID) {
        const taken = new Set(page.members.map((m) => m.name));
        let name = memberName({ ...f, value: proposedTestID }, screenWords(f.screen));
        for (let n = 2; taken.has(name); n++) name = `${name}${n}`;
        const member: PageMember = {
          page: page.cls,
          file: page.file,
          name,
          params: [],
          paramSources: [],
          container: false,
          finding: f,
          fallback: { key: evidence(f), selectors, proposedTestID },
        };
        page.members.push(member);
        byGap.set(evidence(f), member);
      }
      continue;
    }
    // Expression IDs cannot be written as a selector; the gate rejects them too.
    if (f.category === 'expression-dynamic' || !f.value || byValue.has(f.value)) continue;

    const paramSources = [...(f.value.match(TEMPLATE)?.[1] ?? '').matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());
    const params = paramSources.map((src, i) => {
      const last = words(src).pop() ?? 'value';
      return paramSources.slice(0, i).some((s) => words(s).pop() === last) ? `${last}${i + 1}` : last;
    });
    let name = memberName(f, screenWords(f.screen));
    const taken = new Set(page.members.map((m) => m.name));
    for (let n = 2; taken.has(name); n++) name = `${memberName(f, screenWords(f.screen))}${n}`;

    const member: PageMember = {
      page: page.cls,
      file: page.file,
      name,
      params,
      paramSources,
      container: /View$/.test(f.element),
      finding: f,
    };
    page.members.push(member);
    byValue.set(f.value, member);
  }
  return { pages, byValue, byGap };
}

// The call expression a step uses, with template params filled from the
// test-data record the gate already validated.
export function memberCall(m: PageMember, record: Record<string, unknown> | undefined): string {
  if (!m.params.length) return `${m.page}.${m.name}`;
  const args = m.paramSources.map((src) => JSON.stringify(String(evaluateExpression(src, { item: record }))));
  return `${m.page}.${m.name}(${args.join(', ')})`;
}

export function importPath(fromDir: string, pageObjectsDir: string, file: string): string {
  const rel = path.relative(fromDir, path.join(pageObjectsDir, file)).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export const BASE_PAGE = `// GENERATED by generator/cli.mts. Base for every page object: the one place
// that knows how React Native locators surface on each platform.
import fs from 'node:fs';
import path from 'node:path';
import { $, $$, driver, expect } from '@wdio/globals';

type Selectors = { android: string; ios: string };
const fallbacks = new Map<string, Selectors>();

export default class Page {
  // RN sets testID as the view's resource-id on Android and as its
  // accessibilityIdentifier on iOS (verified on an Android 36 emulator and
  // the iOS 27 simulator).
  protected byTestId(id: string) {
    return $(driver.isAndroid ? \`android=new UiSelector().resourceId("\${id}")\` : \`~\${id}\`);
  }

  // accessibilityLabel: content-desc on Android, the accessibility id on iOS.
  protected byLabel(label: string) {
    return $(\`~\${label}\`);
  }

  // A testability gap located from source evidence until its testID lands.
  protected fallback(key: string, selectors: Selectors) {
    fallbacks.set(key, selectors);
    return $(driver.isAndroid ? selectors.android : selectors.ios);
  }
}

// Device validation for a fallback (run with VALIDATE_FALLBACKS=1): waits for
// the screen, requires exactly one match, and records the result with the
// selector tested in fallbacks/validations.json, which the generator reads to
// decide whether steps may use the fallback.
export async function validateFallback(key: string) {
  const selectors = fallbacks.get(key);
  if (!selectors) throw new Error(\`fallback \${key} was not accessed before validation\`);
  const platform = driver.isAndroid ? 'android' : 'ios';
  const selector = selectors[platform];
  await driver.waitUntil(async () => (await $$(selector).length) > 0, { timeout: 15000 }).catch(() => undefined);
  const matches = await $$(selector).length;
  const caps = driver.capabilities as Record<string, unknown>;
  const file = path.resolve(__dirname, '../../fallbacks/validations.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
  // Keep a person's approval when the same selector is re-validated; the
  // generator ignores it anyway if the selector ever changes.
  const prior = all[key]?.[platform];
  all[key] = { ...all[key], [platform]: {
    ...(prior?.selector === selector && prior.approval && { approval: prior.approval }),
    selector,
    matches,
    device: \`\${caps.deviceName ?? caps['appium:deviceName'] ?? '?'} \${caps.platformVersion ?? caps['appium:platformVersion'] ?? ''}\`.trim(),
    validatedAt: new Date().toISOString(),
  } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\\n');
  if (matches !== 1) throw new Error(\`fallback \${key} matched \${matches} elements on \${platform}, needs exactly 1\`);
}

type Element = ReturnType<typeof $>;

// XCUITest reports RN container views as visible="false" even while their
// screen is on top, so on iOS a container is asserted by presence instead.
export async function expectShown(el: Element, opts: { container?: boolean } = {}) {
  if (opts.container && driver.isIOS) await expect(el).toBeExisting();
  else await expect(el).toBeDisplayed();
}

export async function expectHidden(el: Element, opts: { container?: boolean } = {}) {
  if (opts.container && driver.isIOS) await expect(el).not.toBeExisting();
  else await expect(el).not.toBeDisplayed();
}

// Typing into RN inputs over XCUITest intermittently lost the first
// characters (the keyboard was still coming up) and occasionally reordered
// them, which signed in the wrong persona. Focus first, wait for the
// keyboard, then read the field back and retype on a mismatch. Secure fields
// read back as bullets, so a bullet string of the right length counts.
export async function typeText(el: Element, text: string) {
  let got = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    await el.click();
    await driver.waitUntil(() => driver.isKeyboardShown(), { timeout: 5000 }).catch(() => undefined);
    await el.clearValue();
    await el.setValue(text);
    got = await el.getText();
    if (got === text || (got.length === text.length && /^[•●]+$/.test(got))) return;
  }
  throw new Error(\`typed "\${text}" but the field shows "\${got}" after 3 attempts\`);
}

// Vendor adapter for @react-native-community/datetimepicker (display
// "spinner"). Its native wheels are invisible to static extraction; on iOS
// they are three XCUIElementTypePickerWheel children, month / day / year in
// the en_US order the simulator uses. Sets each wheel, then reads them back.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function chooseDate(el: Element, isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!driver.isIOS) throw new Error('chooseDate: the Android adapter for datetimepicker is not implemented yet');
  await el.waitForExist({ timeout: 15000 });
  const wheels = await el.$$('-ios class chain:**/XCUIElementTypePickerWheel');
  if ((await wheels.length) !== 3) throw new Error(\`chooseDate: expected 3 picker wheels, found \${await wheels.length}\`);
  const want = [MONTHS[month - 1], String(day), String(year)];
  // Wheels coast after a spin, and a month or year change can shift the day,
  // so set year, month, then day, let them settle, read back, and re-set any
  // wheel that drifted (a first run landed on the 3rd instead of the 1st).
  // A wheel's value is the item text, sometimes followed by ", n of m".
  const shows = (v: string, w: string) => v === w || v.startsWith(\`\${w},\`);
  let got: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const i of [2, 0, 1]) {
      if (!shows(String(await wheels[i].getAttribute('value')), want[i])) await wheels[i].setValue(want[i]);
    }
    await driver.pause(500);
    got = await Promise.all([0, 1, 2].map(async (i) => String(await wheels[i].getAttribute('value'))));
    if (got.every((v, i) => shows(v, want[i]))) return;
  }
  throw new Error(\`chooseDate: wanted \${want.join(' ')}, the wheels show \${got.join(' ')}\`);
}
`;

export function renderPage(page: PageModel['pages'] extends Map<string, infer P> ? P : never): string {
  const out = [
    `// GENERATED by generator/cli.mts from ${page.screen}. Do not edit; change the`,
    `// app's testIDs and regenerate.`,
    `import Page from './base.page';`,
    '',
  ];
  const unreachable = page.gaps.filter((g) => !page.members.some((m) => m.fallback?.key === evidence(g)));
  if (unreachable.length) {
    out.push('// Testability gaps with no fallback (no visible text to locate them by):');
    for (const g of unreachable) out.push(`//   ${g.element} at ${evidence(g)}`);
    out.push('');
  }
  out.push(`class ${page.cls} extends Page {`);
  page.members.forEach((m, i) => {
    const f = m.finding;
    if (m.fallback) {
      if (i) out.push('');
      out.push(
        `  // FALLBACK: ${f.element} has no testID (${m.fallback.key}); located by its visible text`,
        `  // "${f.description}". Proposed testID: ${m.fallback.proposedTestID} (generated/remediation/).`,
        `  get ${m.name}() {`,
        `    return this.fallback(${JSON.stringify(m.fallback.key)}, {`,
        `      android: ${JSON.stringify(m.fallback.selectors.android)},`,
        `      ios: ${JSON.stringify(m.fallback.selectors.ios)},`,
        `    });`,
        `  }`,
      );
      return;
    }
    const notes = [
      `${f.attribute}=${f.value} (${evidence(f)})`,
      ...(f.conditions.length ? [`renders only when ${f.conditions.join(' && ')}`] : []),
      ...(f.locatorStrength !== 'strong' ? [`WARNING: ${f.attribute} only; ask for a testID`] : []),
    ];
    const by = f.attribute === 'testID' ? 'byTestId' : 'byLabel';
    let n = 0;
    const arg = m.params.length
      ? `\`${(f.value as string).replace(TEMPLATE, '$1').replace(/\$\{[^}]+\}/g, () => `\${${m.params[n++]}}`)}\``
      : JSON.stringify(f.value);
    if (i) out.push('');
    out.push(...notes.map((n) => `  // ${n}`));
    out.push(
      m.params.length
        ? `  ${m.name}(${m.params.map((p) => `${p}: string`).join(', ')}) {\n    return this.${by}(${arg});\n  }`
        : `  get ${m.name}() {\n    return this.${by}(${arg});\n  }`,
    );
  });
  out.push('}', '', `export default new ${page.cls}();`, '');
  return out.join('\n');
}
