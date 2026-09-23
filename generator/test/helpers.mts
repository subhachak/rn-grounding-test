import fs from 'node:fs';
import path from 'node:path';
import { after } from 'node:test';
import { ROOT } from '../paths.mts';

// Points the output root at a throwaway folder for this test file, so tests
// never read or write a real story's output (decisions, approvals, reports).
// It sits inside the repo's git-ignored output/ so generated TypeScript still
// resolves node_modules.
export function useTempOutput(): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'output', '.test-'));
  process.env.GROUNDING_OUTPUT = dir;
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
