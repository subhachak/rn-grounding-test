import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { RegistryFinding, TestData } from './types.mts';

const require = createRequire(import.meta.url);
const { extract, summarize } = require('../scripts/extract-selectors.js');

// Scans source on every run rather than reading a saved registry.json, so a
// generated test can never be grounded against a stale registry.
export function loadRegistry(repoRoot: string, srcDir = 'src'): RegistryFinding[] {
  const { findings } = extract(path.join(repoRoot, srcDir)) as { findings: RegistryFinding[] };
  return findings.map((f) => ({ ...f, file: path.relative(repoRoot, f.file) }));
}

// The registry as saved with each story's output: exactly what that story's
// tests were generated from. No timestamp, so regenerating unchanged source
// writes an identical file.
export function registrySnapshot(findings: RegistryFinding[]) {
  return { source: 'src/', summary: summarize(findings), findings };
}

export function loadTestData(file: string): TestData {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as TestData;
}

export function evidence(f: RegistryFinding): string {
  return `${f.file}:${f.line}`;
}
