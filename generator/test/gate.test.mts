import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideScenarios, decideStep } from '../gate.mts';
import type { FeatureDoc, Proposal, RegistryFinding, TestData } from '../types.mts';

const finding = (over: Partial<RegistryFinding>): RegistryFinding => ({
  screen: 'S',
  element: 'TouchableOpacity',
  attribute: 'testID',
  category: 'stable',
  value: 'x',
  locatorStrength: 'strong',
  conditions: [],
  file: 'src/S.tsx',
  line: 1,
  ...over,
});

const registry: RegistryFinding[] = [
  finding({ value: 'submit-button', line: 1 }),
  finding({ value: 'amount-input', element: 'TextInput', line: 2 }),
  finding({ value: 'panel', element: 'View', conditions: ['isEntitled'], line: 3 }),
  finding({ value: '{`row-${item.id}`}', category: 'templated-dynamic', line: 4 }),
  finding({ value: '{`badge-${item.id}`}', element: 'Text', category: 'templated-dynamic', conditions: ['item.active'], line: 5 }),
  finding({ value: '{rowId}', category: 'expression-dynamic', line: 6 }),
  finding({ value: 'balance', element: 'Text', attribute: 'accessibilityLabel', locatorStrength: 'weak', line: 7 }),
  finding({ value: null, category: 'missing', attribute: null, locatorStrength: null, line: 8 }),
];

const testData: TestData = {
  personas: { entitled: { username: 'e', props: { isEntitled: true } }, restricted: { username: 'r', props: { isEntitled: false } } },
  records: { rows: { a: { id: 'a', active: true }, b: { id: 'b', active: false } } },
};

const propose = (over: Partial<Proposal>): Proposal => ({
  step: 'step',
  action: 'tap',
  locator: 'submit-button',
  record: null,
  text: null,
  gap: null,
  rationale: '',
  source: 'agent',
  ...over,
});

const rules = (d: { errors: { rule: string }[] }) => d.errors.map((e) => e.rule);

test('accepts a stable locator copied from the registry', () => {
  const d = decideStep(propose({}), registry, testData);
  assert.equal(d.verdict, 'accepted');
  assert.equal(d.locator?.id, 'submit-button');
  assert.equal(d.locator?.evidence, 'src/S.tsx:1');
});

test('G1 rejects a locator that is not in the registry', () => {
  const d = decideStep(propose({ locator: 'submit-btn' }), registry, testData);
  assert.equal(d.verdict, 'rejected');
  assert.deepEqual(rules(d), ['G1']);
});

test('G2 requires a locator for tap and forbids one for back', () => {
  assert.deepEqual(rules(decideStep(propose({ locator: null }), registry, testData)), ['G2']);
  assert.deepEqual(rules(decideStep(propose({ action: 'back' }), registry, testData)), ['G2']);
  assert.equal(decideStep(propose({ action: 'back', locator: null }), registry, testData).verdict, 'accepted');
});

test('G3 rejects type on a button and tap on a container', () => {
  assert.deepEqual(rules(decideStep(propose({ action: 'type', text: 'x' }), registry, testData)), ['G3']);
  assert.deepEqual(rules(decideStep(propose({ locator: 'panel' }), registry, testData)), ['G3']);
});

test('G4 resolves a templated locator from a named record', () => {
  const d = decideStep(propose({ locator: '{`row-${item.id}`}', record: 'rows.a' }), registry, testData);
  assert.equal(d.verdict, 'accepted');
  assert.equal(d.locator?.id, 'row-a');
});

test('G4 rejects templated locators without a real record, and expression IDs', () => {
  const templated = '{`row-${item.id}`}';
  assert.deepEqual(rules(decideStep(propose({ locator: templated }), registry, testData)), ['G4']);
  assert.deepEqual(rules(decideStep(propose({ locator: templated, record: 'rows.zzz' }), registry, testData)), ['G4']);
  assert.deepEqual(rules(decideStep(propose({ locator: '{rowId}' }), registry, testData)), ['G4']);
  assert.deepEqual(rules(decideStep(propose({ record: 'rows.a' }), registry, testData)), ['G4']);
});

test('G6 accepts an accessibilityLabel locator with a warning', () => {
  const d = decideStep(propose({ action: 'assertVisible', locator: 'balance' }), registry, testData);
  assert.equal(d.verdict, 'accepted');
  assert.deepEqual(d.warnings.map((w) => w.rule), ['G6']);
});

test('G7 keeps a step ungrounded, and flags a gap citation the registry does not have', () => {
  const real = decideStep(propose({ action: 'unmapped', locator: null, gap: 'src/S.tsx:8' }), registry, testData);
  assert.equal(real.verdict, 'ungrounded');
  assert.equal(real.warnings.length, 0);
  const bogus = decideStep(propose({ action: 'unmapped', locator: null, gap: 'src/S.tsx:1' }), registry, testData);
  assert.equal(bogus.verdict, 'ungrounded');
  assert.deepEqual(bogus.warnings.map((w) => w.rule), ['G7']);
});

test('G8 requires text for type and forbids it elsewhere', () => {
  assert.deepEqual(rules(decideStep(propose({ action: 'type', locator: 'amount-input' }), registry, testData)), ['G8']);
  assert.deepEqual(rules(decideStep(propose({ text: 'hi' }), registry, testData)), ['G8']);
});

function scenarioCheck(tags: string[], proposals: Proposal[]) {
  const feature: FeatureDoc = {
    platform: 'ios',
    file: 'f.feature',
    name: 'F',
    scenarios: [{ name: 'S', tags, line: 1, steps: proposals.map((p) => ({ text: p.step, kind: 'outcome', line: 2 })) }],
  };
  const steps = proposals.map((p) => decideStep(p, registry, testData));
  return decideScenarios(feature, steps, testData)[0].errors.map((e) => e.rule);
}

test('G5 checks persona-gated locators against the scenario persona', () => {
  const shown = propose({ step: 'panel shown', action: 'assertVisible', locator: 'panel' });
  const hidden = propose({ step: 'panel hidden', action: 'assertNotVisible', locator: 'panel' });
  assert.deepEqual(scenarioCheck(['@persona:entitled'], [shown]), []);
  assert.deepEqual(scenarioCheck(['@persona:restricted'], [shown]), ['G5']);
  assert.deepEqual(scenarioCheck(['@persona:restricted'], [hidden]), []);
  assert.deepEqual(scenarioCheck([], [shown]), ['G5']);
  assert.deepEqual(scenarioCheck(['@persona:nobody'], [shown]), ['G5']);
});

test('G5 evaluates record-gated locators against the bound record', () => {
  const badge = (record: string) =>
    propose({ step: `badge ${record}`, action: 'assertVisible', locator: '{`badge-${item.id}`}', record });
  assert.deepEqual(scenarioCheck(['@persona:entitled'], [badge('rows.a')]), []);
  assert.deepEqual(scenarioCheck(['@persona:entitled'], [badge('rows.b')]), ['G5']);
});

test('G10 allows choose only on a vendor component with an adapter, in its value format', () => {
  const vendorRegistry: RegistryFinding[] = [
    ...registry,
    finding({ value: 'date-picker', element: 'DateTimePicker', module: '@react-native-community/datetimepicker', line: 20 }),
    finding({ value: 'other-picker', element: 'FancyPicker', module: 'some-unknown-lib', line: 21 }),
  ];
  const choose = (locator: string, text: string) =>
    decideStep(propose({ action: 'choose', locator, text }), vendorRegistry, testData);
  assert.equal(choose('date-picker', '2026-10-01').verdict, 'accepted');
  assert.deepEqual(rules(choose('date-picker', 'next Friday')), ['G10']);
  assert.deepEqual(rules(choose('other-picker', '2026-10-01')), ['G10']);
  assert.deepEqual(rules(choose('submit-button', '2026-10-01')), ['G10']);
});
