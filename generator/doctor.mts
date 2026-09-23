// Checks a setup before the first run: the config, the app source and how
// much of it the scan can see through, the stories and test data, and the
// run target (local tools, or Sauce Labs credentials and app). Changes
// nothing, except creating the output folder if it is missing.
//
//   npm run doctor                       # everything, for the configured target
//   npm run doctor -- --target sauce     # check another target
//   npm run doctor -- --online           # also ask Sauce Labs: credentials valid, app in storage
//
// Exits 1 when something would stop a run; warnings (!) do not.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { HARNESS_ROOT, loadConfig, type GroundingConfig, type RunTarget } from './config.mts';
import { shown } from './paths.mts';
import { loadRegistry } from './registry.mts';
import { PLATFORMS } from './types.mts';

const { values } = parseArgs({ options: { target: { type: 'string' }, online: { type: 'boolean', default: false } } });

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const warn = (m: string) => console.log(`  ! ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  ✗ ${m}`);
};
const section = (title: string) => console.log(`\n${title}`);

function files(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (!f.startsWith('.') && f !== 'node_modules') files(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(f)) out.push(full);
  }
  return out;
}

// Import prefixes that are neither relative, an alias, a Node builtin, nor a
// dependency of the app: most likely an alias the scan does not know about
// (babel-plugin-module-resolver, a tsconfig that `extends` another), which
// silently hides wrappers and constants behind it.
function unresolvedImports(config: GroundingConfig): Map<string, number> {
  const pkgFile = path.join(config.app.root, 'package.json');
  const pkg = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, 'utf-8')) : {};
  const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }));
  const aliases = Object.keys(config.app.aliases);
  const counts = new Map<string, number>();
  for (const file of files(config.app.sourceDir)) {
    for (const [, source] of fs.readFileSync(file, 'utf-8').matchAll(/(?:from|import|require\()\s*['"]([^'"]+)['"]/g)) {
      if (source.startsWith('.') || aliases.some((a) => source === a || source.startsWith(a.endsWith('/') ? a : a + '/'))) continue;
      const parts = source.split('/');
      const name = source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (deps.has(name) || builtinModules.includes(name.replace(/^node:/, '')) || name === 'react' || name === 'react-native') continue;
      const prefix = source.startsWith('@') && !source.includes('/') ? source : source.startsWith('@') || source.startsWith('~') ? parts[0] + '/' : name;
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }
  return counts;
}

function checkConfig(): GroundingConfig | null {
  section('Config');
  try {
    const config = loadConfig();
    if (config.file) ok(`read ${config.file}`);
    else warn(`no grounding.config.json; using the demo app defaults (copy grounding.config.example.json to start)`);
    return config;
  } catch (e) {
    fail((e as Error).message);
    return null;
  }
}

function checkApp(config: GroundingConfig) {
  section('App source');
  if (!fs.existsSync(config.app.root)) return fail(`app.root ${config.app.root} does not exist`);
  ok(`app root ${config.app.root}`);
  if (!fs.existsSync(config.app.sourceDir)) return fail(`app.sourceDir ${config.app.sourceDir} does not exist`);
  const registry = loadRegistry();
  const count = (c: string) => registry.filter((f) => f.category === c).length;
  const screens = new Set(registry.map((f) => f.screen)).size;
  if (!registry.length) fail(`scanned ${shown(config.app.sourceDir)} and found no locators or interactive elements; is sourceDir the UI source?`);
  else {
    ok(
      `scan: ${registry.length} findings on ${screens} screens (${count('stable')} stable, ${count('templated-dynamic')} templated, ` +
        `${count('expression-dynamic')} expression-based, ${count('missing')} gaps)`,
    );
  }
  if (count('expression-dynamic') > count('stable') / 4) {
    warn(`${count('expression-dynamic')} testIDs are expressions the scan could not resolve; an unknown alias can cause this (see below)`);
  }
  const aliases = Object.entries(config.app.aliases);
  if (aliases.length) ok(`aliases: ${aliases.map(([a, d]) => `${a} -> ${shown(d)}`).join(', ')}`);
  const unresolved = unresolvedImports(config);
  if (unresolved.size) {
    warn(
      `imports that are not relative, an alias, or a dependency in package.json: ${[...unresolved].map(([p, n]) => `${p} (${n})`).join(', ')}. ` +
        `If these are the app's own folders, add them to app.aliases, or wrappers and constants behind them are not seen through.`,
    );
  } else ok('every import resolves (relative, an alias, or a package)');
  for (const p of PLATFORMS) {
    if (config.app.ids[p]) ok(`${p} app id ${config.app.ids[p]}`);
    else fail(`no ${p} app id: set app.${p === 'android' ? 'androidPackage' : 'iosBundleId'}`);
  }
}

function checkStories(config: GroundingConfig) {
  section('Stories and test data');
  if (!fs.existsSync(config.features.dir)) return fail(`features.dir ${config.features.dir} does not exist`);
  const stories = fs.readdirSync(config.features.dir).filter((d) => fs.statSync(path.join(config.features.dir, d)).isDirectory());
  if (!stories.length) warn(`no story folders in ${shown(config.features.dir)} yet`);
  for (const story of stories) {
    const missing = PLATFORMS.filter((p) => !fs.existsSync(path.join(config.features.dir, story, config.features.files[p])));
    if (missing.length) fail(`${story}: missing ${missing.map((p) => config.features.files[p]).join(' and ')}`);
    else if (!/^[A-Za-z0-9_-]+$/.test(story)) fail(`${story}: story folder names may use only letters, digits, - and _`);
    else ok(`${story}`);
  }
  if (!fs.existsSync(config.testData)) return fail(`testData ${config.testData} does not exist`);
  try {
    const data = JSON.parse(fs.readFileSync(config.testData, 'utf-8'));
    ok(`test data: ${Object.keys(data.personas ?? {}).length} personas, ${Object.keys(data.records ?? {}).length} record collections`);
  } catch (e) {
    fail(`testData is not valid JSON: ${(e as Error).message}`);
  }
  try {
    fs.mkdirSync(config.output, { recursive: true });
    fs.accessSync(config.output, fs.constants.W_OK);
    ok(`output ${shown(config.output)} is writable`);
  } catch {
    fail(`output ${config.output} is not writable`);
  }
}

function checkHarness(target: RunTarget) {
  section('Harness');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 18)) ok(`Node ${process.versions.node}`);
  else fail(`Node ${process.versions.node}: needs 22.18 or later (runs TypeScript directly)`);
  const needed = ['@wdio/cli', '@wdio/cucumber-framework', '@wdio/local-runner', '@cucumber/gherkin', '@babel/parser'];
  needed.push(target === 'sauce' ? '@wdio/sauce-service' : '@wdio/appium-service');
  // A file check: several of these packages do not export package.json.
  const missing = needed.filter((m) => !fs.existsSync(path.join(HARNESS_ROOT, 'node_modules', m, 'package.json')));
  if (missing.length) fail(`not installed: ${missing.join(', ')} (run npm install in the harness)`);
  else ok('dependencies installed');
}

const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

function checkLocal() {
  section('Run target: local devices');
  if (has('xcrun', ['simctl', 'help'])) ok('Xcode simulator tools'); else warn('no Xcode simulator tools: iOS runs need Xcode');
  const adb = path.join(process.env.ANDROID_HOME ?? path.join(process.env.HOME ?? '', 'Library/Android/sdk'), 'platform-tools/adb');
  if (fs.existsSync(adb)) ok('Android SDK'); else warn('no Android SDK (ANDROID_HOME): Android runs need it');
}

// Sauce Labs REST API hosts per region name.
const SAUCE_API: Record<string, string> = {
  us: 'api.us-west-1.saucelabs.com',
  'us-west-1': 'api.us-west-1.saucelabs.com',
  'us-east-4': 'api.us-east-4.saucelabs.com',
  eu: 'api.eu-central-1.saucelabs.com',
  'eu-central-1': 'api.eu-central-1.saucelabs.com',
};

async function checkSauce(config: GroundingConfig, online: boolean) {
  section('Run target: Sauce Labs');
  const { sauce } = config.run;
  const user = process.env.SAUCE_USERNAME;
  const key = process.env.SAUCE_ACCESS_KEY;
  if (user && key) ok(`credentials in the environment (SAUCE_USERNAME=${user})`);
  else fail(`set ${[!user && 'SAUCE_USERNAME', !key && 'SAUCE_ACCESS_KEY'].filter(Boolean).join(' and ')} in the environment`);
  if (SAUCE_API[sauce.region]) ok(`region ${sauce.region}`);
  else fail(`run.sauce.region "${sauce.region}" is not one of ${Object.keys(SAUCE_API).join(', ')}`);
  if (sauce.tunnelName) ok(`Sauce Connect tunnel ${sauce.tunnelName} (must be running when tests run)`);
  const apps: Partial<Record<(typeof PLATFORMS)[number], string>> = {};
  for (const p of PLATFORMS) {
    const d = sauce.devices[p];
    const app = process.env[`SAUCE_APP_${p.toUpperCase()}`] ?? d.app;
    if (app) {
      apps[p] = app;
      ok(`${p}: ${d.deviceName}${d.platformVersion ? ` ${d.platformVersion}` : ''}, app ${app}`);
    } else fail(`${p}: no app; set run.sauce.${p}.app (e.g. storage:filename=MyApp.${p === 'ios' ? 'ipa' : 'apk'}) or SAUCE_APP_${p.toUpperCase()}`);
  }
  if (!online) return console.log('  (add --online to check the credentials and that each app is in Sauce storage)');
  if (!user || !key || !SAUCE_API[sauce.region]) return;
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    warn('HTTPS_PROXY is set but Node ignores it unless NODE_USE_ENV_PROXY=1 is also set');
  }
  const auth = `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`;
  for (const [p, app] of Object.entries(apps)) {
    const byName = app.match(/^storage:filename=(.+)$/);
    const byId = app.match(/^storage:([0-9a-f-]{8,})$/i);
    if (!byName && !byId) {
      warn(`${p}: ${app} is not a storage reference; not checked`);
      continue;
    }
    const url = byName
      ? `https://${SAUCE_API[sauce.region]}/v1/storage/files?q=${encodeURIComponent(byName[1])}`
      : `https://${SAUCE_API[sauce.region]}/v1/storage/files/${byId![1]}`;
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.status === 401) {
        fail('Sauce Labs rejected the credentials (401)');
        return;
      }
      const body = (await res.json()) as { items?: { name: string }[]; item?: unknown };
      const found = byName ? body.items?.some((i) => i.name === byName[1]) : res.ok && body.item;
      if (found) ok(`${p}: ${app} is in Sauce storage`);
      else fail(`${p}: ${app} is not in Sauce storage for this account and region (upload it first; see docs/HANDOFF.md)`);
    } catch (e) {
      fail(`could not reach ${SAUCE_API[sauce.region]}: ${(e as Error).message} (proxy? see docs/HANDOFF.md)`);
      return;
    }
  }
}

const config = checkConfig();
if (config) {
  const target = (values.target as RunTarget | undefined) ?? config.run.target;
  checkApp(config);
  checkStories(config);
  checkHarness(target);
  if (target === 'sauce') await checkSauce(config, values.online);
  else checkLocal();
}
console.log(failures ? `\n${failures} problem(s) to fix before a run.` : '\nReady.');
process.exit(failures ? 1 : 0);
