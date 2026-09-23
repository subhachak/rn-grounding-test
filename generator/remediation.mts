// Testability-gap remediation, deterministic: for every interactive element
// with no locator, propose a testID in the screen's own naming convention and
// write a patch that adds it at that exact element. The patch goes to
// engineering as a proposal (`git apply`); nothing here edits app source.
import fs from 'node:fs';
import path from 'node:path';
import babelParser from '@babel/parser';
import { evidence } from './registry.mts';
import type { RegistryFinding } from './types.mts';

export interface TestIdProposal {
  gap: RegistryFinding;
  testID: string;
  // For one option of a list's gap: the templated testID the patch adds
  // once for the whole list (`contribute-frequency-${f}-button`); testID is
  // its value for this option.
  template?: string;
}

// FREQUENCIES -> frequency, QUICK_AMOUNTS -> quick amount, PLAN_TYPES -> plan type
const singular = (name: string) => {
  const w = words(name.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2'));
  const last = w.pop() ?? '';
  return [...w, last.replace(/ies$/, 'y').replace(/(ss)$/, '$1').replace(/([^s])s$/, '$1')];
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const KIND: Record<string, string> = { TextInput: 'input', Switch: 'switch' };

// The screen's convention is the words every existing static testID on it
// starts with (contribution-amount-input, contribution-submit-button ->
// "contribution"); a screen with none falls back to its own name.
function screenPrefix(screen: string, registry: RegistryFinding[]): string[] {
  const ids = registry
    .filter((f) => f.screen === screen && f.category === 'stable' && f.attribute === 'testID')
    .map((f) => words(f.value as string));
  if (!ids.length) return words(screen.replace(/Screen$/, ''));
  const prefix: string[] = [];
  for (let i = 0; ids.every((w) => w.length > i + 1 && w[i] === ids[0][i]); i++) prefix.push(ids[0][i]);
  return prefix.length ? prefix : words(screen.replace(/Screen$/, ''));
}

export function proposeTestIds(registry: RegistryFinding[]): TestIdProposal[] {
  const taken = new Set(registry.filter((f) => f.value).map((f) => f.value as string));
  return registry
    .filter((f) => f.category === 'missing')
    .map((gap) => {
      const kind = KIND[gap.element] ?? 'button';
      if (gap.option && gap.optionList && gap.optionKey) {
        // One templated testID for the list, named after it.
        const template = [...screenPrefix(gap.screen, registry), ...singular(gap.optionList), gap.optionKey, kind].join('-');
        const testID = template.replace(gap.optionKey, gap.optionValue ?? gap.option);
        taken.add(testID);
        return { gap, testID, template };
      }
      if (gap.itemKey && gap.optionList) {
        // In a list of runtime data: templated by the item's key, or every
        // item would get the same testID.
        const label = words((gap.description ?? '').split('(')[0]).slice(0, 3);
        const template = [...screenPrefix(gap.screen, registry), ...(label.length ? label : singular(gap.optionList)), gap.itemKey, kind].join('-');
        return { gap, testID: template, template };
      }
      // Visible text names the element; a parenthetical is detail, not name.
      const label = words((gap.description ?? '').split('(')[0]).slice(0, 3);
      const base = [...screenPrefix(gap.screen, registry), ...(label.length ? label : ['element']), kind].join('-');
      let testID = base;
      for (let n = 2; taken.has(testID); n++) testID = `${base}-${n}`;
      taken.add(testID);
      return { gap, testID };
    });
}

// The name as written in JSX: Button, Picker.Item.
const jsxName = (n: any): string => (n.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${n.property.name}` : n.name);

// Insert ` testID="..."` right after the element name of the JSX opening tag
// the extractor reported, located through the AST rather than by text search.
// A gap on a wrapper (<Button title="Cancel">) is recorded as the native
// element it renders, but the testID goes on the wrapper as written, which
// forwards it.
function patchLine(source: string, gap: RegistryFinding, attribute: string): { line: number; before: string; after: string } {
  const ast = babelParser.parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const tag = gap.component ?? gap.element;
  let insertAt: number | null = null;
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object' || insertAt !== null) return;
    if (node.type === 'JSXOpeningElement' && node.loc.start.line === gap.line && jsxName(node.name) === tag) {
      insertAt = node.name.end;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object' && v.type) visit(v);
    }
  };
  visit(ast.program);
  if (insertAt === null) throw new Error(`no <${tag}> opening tag at ${evidence(gap)}`);
  const patched = source.slice(0, insertAt) + attribute + source.slice(insertAt);
  const idx = gap.line - 1;
  return { line: gap.line, before: source.split('\n')[idx], after: patched.split('\n')[idx] };
}

// A unified diff with 3 lines of context per change, applicable with
// `git apply` from the repo root.
export function renderPatch(repoRoot: string, proposals: TestIdProposal[]): string {
  const byFile = new Map<string, TestIdProposal[]>();
  for (const p of proposals) byFile.set(p.gap.file, [...(byFile.get(p.gap.file) ?? []), p]);

  const out: string[] = [];
  for (const [file, items] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf-8');
    const lines = source.split('\n');
    // A list's options share one element (and line): one templated testID.
    const attribute = (p: TestIdProposal) => (p.template ? ` testID={\`${p.template}\`}` : ` testID="${p.testID}"`);
    const changes = new Map(items.map((p) => { const c = patchLine(source, p.gap, attribute(p)); return [c.line, c.after]; }));
    out.push(`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`);
    const changed = [...changes.keys()].sort((a, b) => a - b);
    // Merge changes whose context windows touch into one hunk.
    const hunks: number[][] = [];
    for (const l of changed) {
      const last = hunks[hunks.length - 1];
      if (last && l - last[last.length - 1] <= 6) last.push(l);
      else hunks.push([l]);
    }
    for (const h of hunks) {
      const from = Math.max(1, h[0] - 3);
      const to = Math.min(lines.length, h[h.length - 1] + 3);
      const len = to - from + 1;
      out.push(`@@ -${from},${len} +${from},${len} @@`);
      for (let l = from; l <= to; l++) {
        if (changes.has(l)) out.push(`-${lines[l - 1]}`, `+${changes.get(l)}`);
        else out.push(` ${lines[l - 1]}`);
      }
    }
  }
  return out.length ? out.join('\n') + '\n' : '';
}

export function renderRemediation(proposals: TestIdProposal[]): string {
  const out = [
    '# Testability gaps: proposed testIDs',
    '',
    'Interactive elements with no locator, and the testID proposed for each in',
    "the screen's existing naming convention. Apply with",
    '`git apply` on `testids.patch` in this folder (from the repo root), then regenerate: steps that',
    'used a fallback locator switch to the testID with no change to the step',
    'definitions, because page objects keep the same member name.',
    '',
    '| Element | Visible text | Location | Proposed testID |',
    '|---|---|---|---|',
  ];
  for (const p of proposals) {
    const id = p.template ? `${p.testID}\` (from \`${p.template}\`, one testID for all of ${p.gap.optionList})` : `${p.testID}\``;
    out.push(`| ${p.gap.element} | ${p.gap.description ?? '-'} | \`${evidence(p.gap)}\` | \`${id} |`);
  }
  return out.join('\n') + '\n';
}
