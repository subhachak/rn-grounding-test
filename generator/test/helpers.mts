import fs from 'node:fs';
import path from 'node:path';
import { after } from 'node:test';
import { ROOT } from '../paths.mts';

// The generator's tests run against a frozen copy of the original sample app
// (screens, STORY-101, test data), never the demo app in src/, so the demo
// app can be redesigned freely. Set on import, before any test runs.
export const FIXTURE_APP = path.join(ROOT, 'generator/test/fixtures/sample-app');
// The fixture app is configured like any other app, by its own config file.
process.env.GROUNDING_CONFIG = path.join(FIXTURE_APP, 'grounding.config.json');

// Points the output root at a throwaway folder for this test file, so tests
// never read or write a real story's output (decisions, approvals, reports).
// It sits inside the repo's git-ignored output/ so generated TypeScript still
// resolves node_modules.
export function useTempOutput(): string {
  // output/ does not exist on a fresh clone or after npm run clean -- --all
  fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, 'output', '.test-'));
  process.env.GROUNDING_OUTPUT = dir;
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
