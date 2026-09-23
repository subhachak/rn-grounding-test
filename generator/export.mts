// Copies the harness, without the demo app, its stories, or its test data,
// into a new folder that can be handed to a team to point at their own app:
//
//   npm run export -- <folder> [--with-local]
//
// The copy gets a package.json with only the harness's own dependencies (no
// Expo or React Native). Sauce Labs runs need nothing else; --with-local also
// keeps Appium and its drivers for runs on local simulators and emulators.
// Then, in the copy: npm install, copy grounding.config.example.json to
// grounding.config.json, edit it, and run npm run doctor.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { HARNESS_ROOT } from './config.mts';

// Harness files, relative to the harness root. The generator's tests and
// their fixture apps go too: they check the harness, not the demo app.
const COPY = ['generator', 'scripts', '.github', '.vscode', 'docs', 'grounding.config.example.json'];

// Only needed to run on local simulators and emulators.
const LOCAL_ONLY = ['appium', 'appium-uiautomator2-driver', 'appium-xcuitest-driver', '@wdio/appium-service'];
// The demo app's, not the harness's.
const APP_ONLY = ['babel-preset-expo', '@types/react'];
const SCRIPTS = ['ground', 'ground:save', 'generate', 'test:generator', 'typecheck:generator', 'approve', 'story', 'clean', 'doctor'];

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'with-local': { type: 'boolean', default: false } } });
if (positionals.length !== 1) {
  console.error('usage: npm run export -- <folder> [--with-local]');
  process.exit(1);
}
const dest = path.resolve(positionals[0]);
if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
  console.error(`${dest} is not empty; export into a new or empty folder`);
  process.exit(1);
}
if (!path.relative(HARNESS_ROOT, dest).startsWith('..')) {
  console.error('export outside the harness, not into it');
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
for (const entry of COPY) {
  const from = path.join(HARNESS_ROOT, entry);
  if (!fs.existsSync(from)) continue;
  // Fixture apps can hold output from test runs; it is git-ignored and not harness.
  fs.cpSync(from, path.join(dest, entry), { recursive: true, filter: (src) => path.basename(src) !== 'output' || !fs.statSync(src).isDirectory() });
}

const pkg = JSON.parse(fs.readFileSync(path.join(HARNESS_ROOT, 'package.json'), 'utf-8'));
const drop = new Set([...APP_ONLY, ...(values['with-local'] ? [] : LOCAL_ONLY)]);
const harnessPkg = {
  name: 'rn-grounding-harness',
  version: pkg.version,
  private: true,
  description: 'Generates Appium (WebdriverIO + Cucumber) tests from Gherkin stories, grounded in a React Native app\'s testIDs. Configure in grounding.config.json.',
  type: 'commonjs',
  engines: { node: '>=22.18' },
  scripts: Object.fromEntries(SCRIPTS.filter((s) => pkg.scripts[s]).map((s) => [s, pkg.scripts[s]])),
  devDependencies: Object.fromEntries(Object.entries(pkg.devDependencies as Record<string, string>).filter(([name]) => !drop.has(name))),
};
fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(harnessPkg, null, 2) + '\n');
fs.writeFileSync(path.join(dest, '.gitignore'), 'node_modules/\noutput/\n');
fs.copyFileSync(path.join(HARNESS_ROOT, 'docs/HANDOFF.md'), path.join(dest, 'README.md'));
// The full reference; its first sections describe the demo app it was built on.
fs.copyFileSync(path.join(HARNESS_ROOT, 'README.md'), path.join(dest, 'docs/REFERENCE.md'));

console.log(`Exported the harness to ${dest}${values['with-local'] ? ' (with local Appium)' : ' (Sauce Labs only)'}.
Next, in ${dest}:
  npm install
  cp grounding.config.example.json grounding.config.json   # then edit it
  npm run doctor`);
