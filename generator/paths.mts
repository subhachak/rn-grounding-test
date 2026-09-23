// Where everything lives. Base files (app, features, test data, generator)
// are in git; everything a run produces for a story goes under
// output/<story>/, which is git-ignored and removed by `npm run clean`.
// GROUNDING_OUTPUT points the output root elsewhere (the tests use it so they
// never touch a real story's output); it is read on every call so a test can
// set it before running anything.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The app the generator reads: its src/, features/, test-data/, and app.json.
// This repo's own app by default; GROUNDING_APP_ROOT points elsewhere (the
// generator's tests use a frozen fixture app, so redesigning the demo app
// never breaks them). Read on every call, like the output root.
export const appRoot = () => (process.env.GROUNDING_APP_ROOT ? path.resolve(process.env.GROUNDING_APP_ROOT) : ROOT);
export const featuresDir = () => path.join(appRoot(), 'features');
export const defaultTestData = () => path.join(appRoot(), 'test-data', 'testdata.json');

export const outputRoot = () => (process.env.GROUNDING_OUTPUT ? path.resolve(process.env.GROUNDING_OUTPUT) : path.join(ROOT, 'output'));

export function storyOutput(story: string) {
  const root = path.join(outputRoot(), story);
  return {
    root,
    pageobjects: path.join(root, 'pageobjects'),
    remediation: path.join(root, 'remediation'),
    reports: path.join(root, 'reports'),
    // Decisions recorded during runs: agent/QA mappings, critic flags, and
    // device validations of fallbacks, each with its human approvals.
    proposals: path.join(root, 'proposals.json'),
    review: path.join(root, 'review.json'),
    validations: path.join(root, 'validations.json'),
  };
}
