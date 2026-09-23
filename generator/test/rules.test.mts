import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchStep, matchSteps, type Match } from '../mapper/rules.mts';
import type { MappingInput, RegistryFinding } from '../types.mts';

const f = (over: Partial<RegistryFinding>): RegistryFinding => ({
  screen: 'Home',
  element: 'TouchableOpacity',
  attribute: 'testID',
  category: 'stable',
  value: 'x',
  locatorStrength: 'strong',
  conditions: [],
  description: null,
  file: 'src/Home.tsx',
  line: 1,
  ...over,
});

const input = (registry: RegistryFinding[], steps: string[] = []): MappingInput => ({
  platform: 'ios',
  steps,
  registry,
  testData: { personas: {}, records: { orders: { o1: { id: 'o1' } } } },
});

const registry = [
  f({ value: 'home-screen', element: 'View', line: 1 }),
  f({ value: 'home-title', element: 'Text', description: 'Welcome home', line: 2 }),
  f({ value: 'save-button', description: 'Save', line: 3 }),
  f({ value: 'save-draft-button', description: 'Save draft', line: 4 }),
  f({ value: 'email-input', element: 'TextInput', description: 'Email address', line: 5 }),
  f({ value: '{`order-row-${item.id}`}', category: 'templated-dynamic', line: 6 }),
  f({ value: null, category: 'missing', attribute: null, locatorStrength: null, description: 'Delete', line: 7 }),
  f({ value: 'ok-a', description: 'OK', line: 8 }),
  f({ value: 'ok-b', description: 'OK', line: 9 }),
];

const proposal = (step: string) => {
  const m = matchStep(step, input(registry));
  assert.ok('proposal' in m, `expected a match for "${step}": ${'unresolved' in m ? m.unresolved : ''}`);
  return m.proposal;
};
const unresolved = (step: string) => assert.ok('unresolved' in matchStep(step, input(registry)), `"${step}" should be left for the agent`);

test('taps the one element whose visible text is the phrase', () => {
  assert.deepEqual([proposal('I tap Save').action, proposal('I tap Save').locator], ['tap', 'save-button']);
  assert.equal(proposal('I tap Save draft').locator, 'save-draft-button');
});

test('types into the one TextInput named by its placeholder', () => {
  const p = proposal('I enter email address "a@b.c"');
  assert.deepEqual([p.action, p.locator, p.text], ['type', 'email-input', 'a@b.c']);
});

test('an assertion on a screen name resolves to the screen root, not its children', () => {
  assert.equal(proposal('the home is displayed').locator, 'home-screen');
  assert.equal(proposal('the home screen is displayed').locator, 'home-screen');
  assert.equal(proposal('the home title is not displayed').action, 'assertNotVisible');
});

test('record steps bind a templated locator to a test-data record', () => {
  const p = proposal('I open order "o1"');
  assert.deepEqual([p.action, p.locator, p.record], ['tap', '{`order-row-${item.id}`}', 'orders.o1']);
  unresolved('I open order "o9"');
});

test('a step naming an element with no locator becomes a cited gap', () => {
  const p = proposal('I tap Delete');
  assert.deepEqual([p.action, p.locator, p.gap], ['unmapped', null, 'src/Home.tsx:7']);
});

test('platform back steps need no locator', () => {
  assert.equal(proposal('I press the device back button').action, 'back');
  assert.equal(proposal('I tap the back button in the navigation bar').action, 'back');
});

test('anything short of exactly one candidate is left for the agent', () => {
  unresolved('I tap OK'); // two elements say "OK"
  unresolved('I tap Publish'); // nothing says "Publish"
  unresolved('I swipe to the next page'); // no rule for the phrasing
  unresolved('I enter title "x"'); // no TextInput named title
});

test('choose steps map only to vendor components that have an adapter', () => {
  const withPicker = [
    ...registry,
    f({ value: 'home-date-picker', element: 'DateTimePicker', module: '@react-native-community/datetimepicker', line: 20 }),
    f({ value: 'home-date-label', element: 'Text', description: 'Pick a date', line: 21 }),
  ];
  const m = matchStep('I choose "2026-10-01" in the date picker', input(withPicker));
  assert.ok('proposal' in m);
  assert.deepEqual([m.proposal.action, m.proposal.locator, m.proposal.text], ['choose', 'home-date-picker', '2026-10-01']);
  // Without a vendor component, "the date picker" is left for the agent.
  assert.ok('unresolved' in matchStep('I choose "2026-10-01" in the date picker', input(registry)));
});

// Screen context: two screens, each with a "Done" button and a list of
// orders, as in real apps where the same words appear on several screens.
const screens = [
  f({ screen: 'Cart', value: 'cart-screen', element: 'View', line: 20 }),
  f({ screen: 'Cart', value: 'cart-done-button', description: 'Done', line: 21 }),
  f({ screen: 'Cart', value: '{`cart-order-${o.id}`}', category: 'templated-dynamic', line: 22 }),
  f({ screen: 'Receipt', value: 'receipt-screen', element: 'View', line: 30 }),
  f({ screen: 'Receipt', value: 'receipt-done-button', description: 'Done', line: 31 }),
  f({ screen: 'Receipt', value: '{`receipt-order-${o.id}`}', category: 'templated-dynamic', line: 32 }),
  f({ screen: 'Receipt', value: 'receipt-note-input', element: 'TextInput', description: 'Note', line: 33 }),
];
const inScenarios = (...scenarios: string[][]) => {
  const steps = [...new Set(scenarios.flat())];
  return matchSteps({ ...input(screens, steps), scenarios });
};
const target = (m: Match | undefined): string => (m && 'proposal' in m ? String(m.proposal.locator) : `unresolved: ${m && 'unresolved' in m ? m.unresolved : '?'}`);

test('words alone leave a tie that the screen established by earlier steps breaks', () => {
  assert.ok('unresolved' in matchStep('I tap Done', input(screens)), 'without context, "Done" is on two screens');
  const m = inScenarios(['the cart screen is displayed', 'I tap Done']);
  assert.equal(target(m.get('I tap Done')), 'cart-done-button');
  assert.match((m.get('I tap Done') as { proposal: { rationale: string } }).proposal.rationale, /the one on Cart/);
  // a record step: two lists hold orders
  const r = inScenarios(['the receipt screen is displayed', 'I open order "o1"']);
  assert.equal(target(r.get('I open order "o1"')), '{`receipt-order-${o.id}`}');
});

test('typing keeps the screen; a tap may navigate, so after it the screen is unknown', () => {
  const kept = inScenarios(['the receipt screen is displayed', 'I enter note "thanks"', 'I tap Done']);
  assert.equal(target(kept.get('I tap Done')), 'receipt-done-button');
  const lost = inScenarios(['the receipt screen is displayed', 'I tap Done', 'I open order "o1"']);
  assert.match(target(lost.get('I open order "o1"')), /^unresolved/);
});

test('a step meaning different elements in different scenarios is left for the agent', () => {
  const m = inScenarios(['the cart screen is displayed', 'I tap Done'], ['the receipt screen is displayed', 'I tap Done']);
  assert.match(target(m.get('I tap Done')), /different elements in different scenarios.*cart-done-button on Cart.*receipt-done-button on Receipt/);
  // the same meaning everywhere is fine
  const same = inScenarios(['the cart screen is displayed', 'I tap Done'], ['the cart screen is displayed', 'I tap Done']);
  assert.equal(target(same.get('I tap Done')), 'cart-done-button');
});

test('context never changes a match the words already decide', () => {
  const m = inScenarios(['the receipt screen is displayed', 'the cart screen is displayed']);
  assert.equal(target(m.get('the cart screen is displayed')), 'cart-screen');
  const words = inScenarios(['the cart screen is displayed', 'I tap receipt done']);
  assert.equal(target(words.get('I tap receipt done')), 'receipt-done-button', 'explicit words beat the current screen');
});
