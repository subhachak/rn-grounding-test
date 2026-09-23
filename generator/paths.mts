// Where everything lives, from generator/config.mts (grounding.config.json,
// or this repo's demo app by default). Everything a run produces for a story
// goes under <output>/<story>/, which is git-ignored and removed by
// `npm run clean`. GROUNDING_OUTPUT points the output root elsewhere (the
// tests use it so they never touch a real story's output). Every value is
// read on each call, so a test can switch config before running anything.
import path from 'node:path';
import { HARNESS_ROOT, loadConfig } from './config.mts';

// The harness itself: generator, scripts, node_modules.
export const ROOT = HARNESS_ROOT;

// The app under test, and the directory of its UI source that is scanned.
export const appRoot = () => loadConfig().app.root;
export const sourceDir = () => loadConfig().app.sourceDir;
export const featuresDir = () => loadConfig().features.dir;
export const defaultTestData = () => loadConfig().testData;

export const outputRoot = () => (process.env.GROUNDING_OUTPUT ? path.resolve(process.env.GROUNDING_OUTPUT) : loadConfig().output);

// Paths shown to people: relative to the harness when inside it, else absolute.
export const shown = (p: string) => {
  const rel = path.relative(ROOT, p);
  return rel.startsWith('..') || path.isAbsolute(rel) ? p : rel || '.';
};

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
