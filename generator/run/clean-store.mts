// Removing a story's output (or all of it). Shared by `npm run clean` and the
// clean_story MCP tool so both refuse the same unsafe names.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, outputRoot, storyOutput } from '../paths.mts';

// Resolves what would be removed, or throws for a name that could reach
// outside the output root (e.g. "../src").
export function cleanTarget(story: string | null): string {
  if (story === null) return outputRoot();
  const target = storyOutput(story).root;
  if (!/^[A-Za-z0-9_-]+$/.test(story) || path.dirname(target) !== outputRoot()) throw new Error(`invalid story id \`${story}\``);
  return target;
}

// What a story's output holds, so a person confirming a clean sees what the
// deletion takes with it.
export function describeOutput(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  const has = (f: string) => fs.existsSync(path.join(target, f));
  const reports = has('reports') ? fs.readdirSync(path.join(target, 'reports')).filter((f) => f.endsWith('.html')).length : 0;
  return [
    ...(has('proposals.json') ? ['agent/QA mappings and their approvals (proposals.json)'] : []),
    ...(has('review.json') ? ['match-critic review and its approvals (review.json)'] : []),
    ...(has('validations.json') ? ['fallback device validations and their approvals (validations.json)'] : []),
    ...(reports ? [`${reports} HTML run report(s)`] : []),
    'generated tests, page objects, configs, grounding report, testID patch (regenerated on the next run)',
  ];
}

export function removeOutput(target: string): string {
  if (!fs.existsSync(target)) return `Nothing to clean: ${path.relative(ROOT, target) || target} does not exist.`;
  fs.rmSync(target, { recursive: true, force: true });
  return `Removed ${path.relative(ROOT, target)}/`;
}
