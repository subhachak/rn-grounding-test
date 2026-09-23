// Where everything lives. Base files (app, features, test data, generator)
// are in git; everything a run produces for a story goes under
// output/<story>/, which is git-ignored and removed by `npm run clean`.
// GROUNDING_OUTPUT points the output root elsewhere (the tests use it so they
// never touch a real story's output); it is read on every call so a test can
// set it before running anything.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FEATURES_DIR = path.join(ROOT, 'features');

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
