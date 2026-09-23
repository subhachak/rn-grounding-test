// Pointing the harness at another app is configuration only: a production-
// shaped fixture (tsconfig path aliases, barrel files, Storybook stories, an
// excluded folder, no app.json, its own feature layout, Sauce Labs devices)
// is scanned, generated, and configured for Sauce Labs from its
// grounding.config.json alone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { HARNESS_ROOT, loadConfig } from '../config.mts';
import { generateStory, storyDir } from '../pipeline.mts';
import { loadRegistry } from '../registry.mts';
import { sauceTarget } from '../run/devices.mts';
import { useTempOutput } from './helpers.mts';

useTempOutput();

const REAL_APP = path.join(HARNESS_ROOT, 'generator/test/fixtures/real-app');
const saved = { ...process.env };
const useConfig = (file: string | undefined) => {
  if (file === undefined) delete process.env.GROUNDING_CONFIG;
  else process.env.GROUNDING_CONFIG = file;
};
afterEach(() => {
  for (const k of ['GROUNDING_CONFIG', 'GROUNDING_TARGET', 'SAUCE_USERNAME', 'SAUCE_ACCESS_KEY', 'SAUCE_APP_ANDROID', 'SAUCE_REGION']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test('an empty config means the conventional layout next to it, with Expo ids from app.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defaults-'));
  fs.writeFileSync(path.join(dir, 'grounding.config.json'), '{}');
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.x.app' }, ios: { bundleIdentifier: 'com.x.App' } } }));
  useConfig(path.join(dir, 'grounding.config.json'));
  const c = loadConfig();
  assert.equal(c.app.sourceDir, path.join(dir, 'src'));
  assert.equal(c.features.dir, path.join(dir, 'features'));
  assert.equal(c.testData, path.join(dir, 'test-data/testdata.json'));
  assert.equal(c.output, path.join(dir, 'output'));
  assert.equal(c.run.target, 'local');
  assert.deepEqual(c.app.ids, { android: 'com.x.app', ios: 'com.x.App' });
});

test('config paths resolve from the config file, and tsconfig path aliases are read', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  const c = loadConfig();
  assert.equal(c.features.dir, path.join(REAL_APP, 'qa/stories'));
  assert.deepEqual(c.features.files, { android: 'Android.feature', ios: 'iOS.feature' });
  assert.equal(c.testData, path.join(REAL_APP, 'qa/data.json'));
  assert.equal(c.app.aliases['@/'], path.join(REAL_APP, 'src') + path.sep, 'from tsconfig.json, despite comments and trailing commas');
  assert.equal(c.app.aliases['@ids'], path.join(REAL_APP, 'src/constants/ids.ts'));
  assert.equal(c.app.aliases['~ui/'], path.join(REAL_APP, 'src/components') + path.sep, 'from the config');
  assert.deepEqual(c.app.ids, { android: 'com.example.bank', ios: 'com.example.Bank' }, 'a bare RN app states its ids in the config');
  assert.equal(c.run.target, 'sauce');
  assert.equal(c.run.sauce.devices.ios.deviceName, 'iPhone.*', 'unset device fields keep their defaults');
  process.env.GROUNDING_TARGET = 'local';
  assert.equal(loadConfig().run.target, 'local', 'GROUNDING_TARGET overrides the file');
});

test('the scan follows aliases and barrel re-exports, and skips stories and excluded folders', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  const registry = loadRegistry();
  const find = (value: string) => registry.find((f) => f.value === value);
  // imported as { PrimaryButton } from '@/components', re-exported twice (export *)
  assert.equal(find('rx-home-transfer')?.element, 'TouchableOpacity');
  assert.equal(find('rx-home-transfer')?.component, 'PrimaryButton');
  // the testID constant came through the @ids alias
  assert.equal(find('rx-home-transfer')?.resolvedFrom, 'IDS.home.transfer');
  // export { default as Card } from './Card', and a default import through ~ui/
  assert.equal(find('rx-home-card')?.component, 'Card');
  assert.equal(find('rx-home-plain')?.component, 'Plain');
  // aliased imports are the app's own code, not a vendor package
  assert.ok(registry.every((f) => !f.module), 'no finding is attributed to a vendor module');
  assert.equal(registry.find((f) => f.category === 'missing')?.description, 'Pay');
  assert.equal(find('rx-story-only'), undefined, 'Storybook stories are not app UI');
  assert.equal(find('rx-legacy'), undefined, 'app.exclude is not scanned');
});

test('a story generates from the configured layout, with Sauce Labs configs from the config', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'real-')), 'STORY-9');
  const run = generateStory(storyDir('STORY-9'), { outDir: out });
  assert.equal(run.failed, false);
  const sauce = fs.readFileSync(path.join(out, 'wdio.android.conf.ts'), 'utf-8');
  assert.match(sauce, /'appium:deviceName': "Samsung Galaxy S2\[34\]\.\*"/);
  assert.match(sauce, /'appium:platformVersion': "14"/);
  assert.match(sauce, /process\.env\.SAUCE_APP_ANDROID \?\? "storage:filename=bank\.apk"/);
  assert.match(sauce, /process\.env\.SAUCE_REGION \?\? "eu-central-1"/);
  assert.match(sauce, /tunnelName: process\.env\.SAUCE_TUNNEL_NAME \?\? "corp-tunnel"/);
  assert.match(sauce, /terminateApp\('com\.example\.bank'\)/, 'restarts the configured app id');
  assert.match(sauce, /Android\.feature/, 'runs the configured feature file');
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'wdio.ios.conf.ts'), 'utf-8'), /platformVersion/, 'no version pinned when none is configured');
  assert.match(fs.readFileSync(path.join(out, 'steps/common/home.steps.ts'), 'utf-8'), /I tap Transfer/);
  // the gap is on a wrapper: the testID goes on <PrimaryButton>, which forwards it
  assert.match(fs.readFileSync(path.join(out, 'remediation/testids.patch'), 'utf-8'), /\+\s*<PrimaryButton testID="[a-z-]+" title="Pay"/);
});

test('a Sauce Labs run names what is missing before it starts', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  delete process.env.SAUCE_USERNAME;
  delete process.env.SAUCE_ACCESS_KEY;
  assert.throws(() => sauceTarget('android', () => {}), /SAUCE_USERNAME and SAUCE_ACCESS_KEY/);
  process.env.SAUCE_USERNAME = 'qa';
  process.env.SAUCE_ACCESS_KEY = 'key';
  const said: string[] = [];
  assert.match(sauceTarget('android', (m) => said.push(m)), /Sauce Labs Samsung Galaxy S2\[34\]\.\* \(android 14\), eu-central-1/);
  assert.match(said[0], /storage:filename=bank\.apk through tunnel corp-tunnel/);
  process.env.SAUCE_APP_ANDROID = 'storage:abc123';
  sauceTarget('android', (m) => said.push(m));
  assert.match(said[1], /storage:abc123/, 'SAUCE_APP_ANDROID overrides the config');
});

test('an app with no ids anywhere is told where to put them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noids-'));
  fs.cpSync(REAL_APP, dir, { recursive: true });
  const file = path.join(dir, 'grounding.config.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  delete raw.app.androidPackage;
  delete raw.app.iosBundleId;
  fs.writeFileSync(file, JSON.stringify(raw));
  useConfig(file);
  assert.throws(() => generateStory(storyDir('STORY-9'), { outDir: path.join(dir, 'out') }), /app\.androidPackage \/ app\.iosBundleId/);
});

test('a tap records the screen its handler certainly navigates to, through the navigator routes', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  const to = (value: string) => loadRegistry().find((f) => f.value === value)?.navigatesTo;
  assert.equal(to('rx-home-open-transfer'), 'TransferScreen', 'an inline handler, through a wrapper');
  assert.equal(to('rx-transfer-home'), 'HomeScreen', 'a named handler; Main shows Tabs, whose first route is Home');
  assert.equal(to('rx-transfer-settings'), 'SettingsScreen', 'getParent()?.reset({ routes }) after another call');
  // not certain, so not recorded
  assert.equal(to('rx-transfer-submit'), undefined, 'navigates only past an early return');
  assert.equal(to('rx-transfer-either'), undefined, 'a conditional target');
  assert.equal(to('rx-transfer-back'), undefined, 'back: the previous screen is not known statically');
  assert.equal(to('rx-home-transfer'), undefined, 'a handler with no navigation');
});

test('elements rendered from a constant list carry its real values and labels', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  const registry = loadRegistry().filter((f) => f.screen === 'StatementsScreen');
  // a templated testID lists the values it takes
  const tab = registry.find((f) => f.value === '{`rx-statements-tab-${t.id}`}');
  assert.deepEqual(tab?.options, ['rx-statements-tab-all', 'rx-statements-tab-mine']);
  assert.equal(tab?.optionList, 'TABS');
  // an unlabelled element is one gap per option, with its real label
  const sorts = registry.filter((f) => f.optionList === 'SORT_ORDERS');
  assert.deepEqual(sorts.map((f) => [f.category, f.description, f.optionKey]), [
    ['missing', 'Newest', '${s}'],
    ['missing', 'Oldest', '${s}'],
  ]);
  // a list that is not constant (props, API data) stays one gap with no label
  const accounts = registry.filter((f) => f.category === 'missing' && f.optionList === 'accounts');
  assert.deepEqual(accounts.map((f) => [f.description, f.option, f.itemKey]), [[null, undefined, '${a.id}']]);
});

test('a list gap gets one templated testID in the patch, and each option its own fallback', () => {
  useConfig(path.join(REAL_APP, 'grounding.config.json'));
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'opts-')), 'STORY-9');
  generateStory(storyDir('STORY-9'), { outDir: out });
  const patch = fs.readFileSync(path.join(out, 'remediation/testids.patch'), 'utf-8');
  const added = patch.split('\n').filter((l) => l.startsWith('+') && l.includes('key={s}'));
  assert.equal(added.length, 1, 'one change for the whole list');
  // the screen's own prefix, the list's name, the item, the kind
  assert.match(added[0], /testID=\{`rx-statements-sort-order-\$\{s\}-button`\}/);
  // a list of runtime data: templated by the item's React key, so each item's testID is unique
  assert.match(patch, /\+.*testID=\{`rx-statements-account-\$\{a\.id\}-button`\} key=\{a\.id\}/);
  const page = fs.readFileSync(path.join(out, 'pageobjects/statements.page.ts'), 'utf-8');
  assert.match(page, /StatementsScreen\.tsx:\d+ \[Newest\]/);
  assert.match(page, /StatementsScreen\.tsx:\d+ \[Oldest\]/);
  assert.match(page, /label == \\"Oldest\\"/);
});
