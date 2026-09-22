// What the Copilot agent sees for the steps the rule matcher could not map:
// registry locators, gaps, test data, and those steps with the reason each
// was left unmatched.
import type { MappingInput } from '../types.mts';

export const MAPPING_RULES = `For each step, propose:
- action: tap | type | assertVisible | assertNotVisible | back | unmapped
- locator: copy a value from LOCATORS exactly as written, including braces and backticks for templated values. Never construct, shorten, or guess a locator.
- record: for a templated locator only, the RECORDS key that fills it ("collection.key"). Otherwise null.
- text: the literal text to enter, for type only. Otherwise null.
- gap: when the step targets an element listed under GAPS, its location (file:line). Otherwise null.
- intent: with a gap only, what the step does to that element (tap | type | assertVisible | assertNotVisible), with text for type. Otherwise null.
- rationale: one short sentence naming the evidence (visible text, screen, element).

Use back for platform navigation back (hardware back button, navigation-bar back). If no locator fits, use action unmapped with a null locator, citing a gap when one matches. An unmapped step is a useful result; a guessed locator is not.`;

export function renderContext(input: MappingInput, reasons: Record<string, string> = {}): string {
  const locators = input.registry
    .filter((f) => f.category !== 'missing')
    .map((f) =>
      [f.value, f.screen, f.element, f.attribute, f.category, f.description ?? '-', f.conditions.join(' && ') || '-'].join('\t'),
    );
  const gaps = input.registry
    .filter((f) => f.category === 'missing')
    .map((f) => [`${f.file}:${f.line}`, f.screen, f.element, f.description ?? '-'].join('\t'));
  const records = Object.entries(input.testData.records).flatMap(([collection, rows]) =>
    Object.entries(rows).map(([key, row]) => `${collection}.${key}\t${JSON.stringify(row)}`),
  );
  return [
    `PLATFORM: ${input.platform}`,
    '',
    'LOCATORS (value, screen, element, attribute, category, visible text, render condition)',
    ...locators,
    '',
    'GAPS (location, screen, element, visible text)',
    ...gaps,
    '',
    'RECORDS',
    ...records,
    '',
    'STEPS (with why the rule matcher left each one)',
    ...input.steps.map((s, i) => `${i + 1}. ${s}${reasons[s] ? `\t[${reasons[s]}]` : ''}`),
  ].join('\n');
}
