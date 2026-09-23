import fs from 'node:fs';
import path from 'node:path';
import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from '@cucumber/gherkin';
import { IdGenerator, PickleStepType } from '@cucumber/messages';
import { loadConfig } from './config.mts';
import { PLATFORMS, type FeatureDoc, type Platform, type StepKind } from './types.mts';

const KIND: Record<string, StepKind> = {
  [PickleStepType.CONTEXT]: 'context',
  [PickleStepType.ACTION]: 'action',
  [PickleStepType.OUTCOME]: 'outcome',
};

// Pickles, not the raw AST: outlines arrive expanded and Background steps
// arrive inlined, so each scenario lists exactly the steps that will run.
export function parseFeature(file: string, platform: Platform): FeatureDoc {
  const source = fs.readFileSync(file, 'utf-8');
  const newId = IdGenerator.incrementing();
  const doc = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(source);
  if (!doc.feature) throw new Error(`${file}: no Feature`);

  const lineOf = new Map<string, number>();
  const collect = (children: typeof doc.feature.children) => {
    for (const child of children) {
      const block = child.scenario ?? child.background;
      if (block) {
        lineOf.set(block.id, block.location.line);
        for (const step of block.steps) lineOf.set(step.id, step.location.line);
      }
      if (child.rule) collect(child.rule.children as typeof doc.feature.children);
    }
  };
  collect(doc.feature.children);

  const pickles = compile(doc, file, newId);
  return {
    platform,
    file,
    name: doc.feature.name,
    scenarios: pickles.map((p) => ({
      name: p.name,
      tags: p.tags.map((t) => t.name),
      line: lineOf.get(p.astNodeIds[0]) ?? 0,
      steps: p.steps.map((s) => ({
        text: s.text,
        kind: KIND[s.type ?? PickleStepType.UNKNOWN] ?? 'action',
        line: lineOf.get(s.astNodeIds[0]) ?? 0,
      })),
    })),
  };
}

// A story folder holds one feature per platform, by default
// <story>/android.feature and <story>/ios.feature (features.android /
// features.ios in the config to name them otherwise).
export function loadStory(storyDir: string): Record<Platform, FeatureDoc> {
  const { files } = loadConfig().features;
  const result = {} as Record<Platform, FeatureDoc>;
  for (const platform of PLATFORMS) {
    const file = path.join(storyDir, files[platform]);
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    result[platform] = parseFeature(file, platform);
  }
  return result;
}

export function uniqueSteps(feature: FeatureDoc): string[] {
  return [...new Set(feature.scenarios.flatMap((s) => s.steps.map((st) => st.text)))];
}
