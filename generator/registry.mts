import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from './config.mts';
import type { RegistryFinding, TestData } from './types.mts';

const require = createRequire(import.meta.url);
const { extract, summarize } = require('../scripts/extract-selectors.js');

// Scans source on every run rather than reading a saved registry.json, so a
// generated test can never be grounded against a stale registry. By default
// the configured app; finding files are relative to the app root, which is
// where the testID patch applies.
export function loadRegistry(repoRoot?: string, srcDir?: string): RegistryFinding[] {
  const config = loadConfig();
  const root = repoRoot ?? config.app.root;
  const dir = path.resolve(root, srcDir ?? (repoRoot ? 'src' : config.app.sourceDir));
  const { findings } = extract(dir, { aliases: config.app.aliases, exclude: config.app.exclude }) as { findings: RegistryFinding[] };
  return findings.map((f) => ({ ...f, file: path.relative(root, f.file) }));
}

// The registry as saved with each story's output: exactly what that story's
// tests were generated from. No timestamp, so regenerating unchanged source
// writes an identical file.
export function registrySnapshot(findings: RegistryFinding[]) {
  const config = loadConfig();
  return { source: path.relative(config.app.root, config.app.sourceDir) + '/', summary: summarize(findings), findings };
}

export function loadTestData(file: string): TestData {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as TestData;
}

export function evidence(f: RegistryFinding): string {
  return `${f.file}:${f.line}`;
}
