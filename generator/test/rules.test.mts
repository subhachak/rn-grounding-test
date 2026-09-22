import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchStep } from '../mapper/rules.mts';
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
