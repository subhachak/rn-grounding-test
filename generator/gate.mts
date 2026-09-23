// The deterministic gate: the only place a proposal is accepted or rejected,
// whether it came from the rule matcher or the Copilot agent. A proposal is
// only ever checked against the registry (source) and test data.
//
// Rules, cited by id in the report and the tests:
//   G1  a locator must be a registry value copied verbatim, and not a gap
//   G2  tap/type/assert need a locator; back and unmapped must not have one
//   G3  type targets a TextInput; tap targets an interactive element
//   G4  templated IDs resolve from a named test-data record; expression IDs
//       cannot be resolved statically; a record on a static ID is an error
//   G5  (per scenario) a conditionally rendered locator needs a @persona tag,
//       and the condition must hold for that persona and record, except for
//       assertNotVisible, where it must not hold. Conditions on runtime UI
//       state (names no persona or record defines, e.g. `error`) cannot be
//       decided from test data, so they are warned about, not failed
//   G6  accessibilityLabel/Identifier locators pass with a warning
//   G7  an unmapped step may cite a gap only if the registry has it as missing
//   G8  type needs text; nothing else may carry text
//   G9  an unmapped step's intent must fit the gap it cites (type on a
//       TextInput, tap on a touchable) for a fallback to act on it
//   G10 choose targets a vendor component with a registered adapter, with a
//       value in that adapter's format
import { Unverifiable, conditionRoots, evaluateCondition, recordScope, resolveTemplate } from './conditions.mts';
import { evidence } from './registry.mts';
import { adapterFor } from './vendors.mts';
import {
  TAPPABLE,
  type FeatureDoc,
  type Finding,
  type Proposal,
  type RegistryFinding,
  type ScenarioDecision,
  type StepDecision,
  type TestData,
} from './types.mts';

const NEEDS_LOCATOR = new Set(['tap', 'type', 'choose', 'assertVisible', 'assertNotVisible']);

function lookupRecord(testData: TestData, ref: string): Record<string, unknown> | undefined {
  const [collection, key] = ref.split('.');
  return testData.records[collection]?.[key];
}

export function decideStep(p: Proposal, registry: RegistryFinding[], testData: TestData): StepDecision {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const decision = (verdict: StepDecision['verdict'], locator: StepDecision['locator'] = null): StepDecision => ({
    step: p.step,
    proposal: p,
    verdict,
    locator,
    gap: null,
    errors,
    warnings,
  });

  if (p.action === 'unmapped') {
    const d = decision('ungrounded');
    if (!p.gap) return d;
    const gap = registry.find((f) => f.category === 'missing' && evidence(f) === p.gap);
    if (!gap) {
      warnings.push({ rule: 'G7', message: `cited gap ${p.gap} is not a missing entry in the registry` });
      return d;
    }
    if (!p.intent) return d;
    const fits =
      p.intent === 'type' ? gap.element === 'TextInput' : p.intent === 'tap' ? TAPPABLE.has(gap.element) : true;
    const textOk = p.intent === 'type' ? Boolean(p.text) : p.text === null;
    if (!fits || !textOk) {
      warnings.push({
        rule: 'G9',
        message: !fits ? `${p.intent} does not fit the gap's ${gap.element}` : `${p.intent} ${p.intent === 'type' ? 'has no text' : 'carries text'}`,
      });
      return d;
    }
    return { ...d, gap };
  }

  const needsText = p.action === 'type' || p.action === 'choose';
  if (needsText ? !p.text : p.text !== null) {
    errors.push({ rule: 'G8', message: needsText ? `${p.action} has no text` : `${p.action} carries text` });
  }

  if (!NEEDS_LOCATOR.has(p.action)) {
    if (p.locator !== null) errors.push({ rule: 'G2', message: `${p.action} takes no locator` });
    return decision(errors.length ? 'rejected' : 'accepted');
  }
  if (p.locator === null) {
    errors.push({ rule: 'G2', message: `${p.action} needs a locator` });
    return decision('rejected');
  }

  // G1: several findings can share a value (e.g. a testID on two branches);
  // any of them is valid evidence, and element checks use the first.
  const matches = registry.filter((f) => f.category !== 'missing' && f.value === p.locator);
  if (!matches.length) {
    errors.push({ rule: 'G1', message: `\`${p.locator}\` is not a locator in the registry` });
    return decision('rejected');
  }
  const found = matches[0];

  if (p.action === 'type' && found.element !== 'TextInput') {
    errors.push({ rule: 'G3', message: `type on a ${found.element}, not a TextInput` });
  }
  if (p.action === 'tap' && !TAPPABLE.has(found.element)) {
    errors.push({ rule: 'G3', message: `tap on a ${found.element}, which is not interactive` });
  }
  if (p.action === 'choose') {
    const adapter = adapterFor(found.module);
    if (!adapter) {
      errors.push({ rule: 'G10', message: `no vendor adapter for ${found.element}${found.module ? ` from ${found.module}` : ''}` });
    } else if (p.text && !adapter.value.test(p.text)) {
      errors.push({ rule: 'G10', message: `"${p.text}" is not ${adapter.valueHint}` });
    }
  }

  let id = found.value as string;
  if (found.category === 'templated-dynamic') {
    const record = p.record ? lookupRecord(testData, p.record) : undefined;
    if (!p.record) {
      errors.push({ rule: 'G4', message: 'templated locator without a test-data record' });
    } else if (!record) {
      errors.push({ rule: 'G4', message: `test-data record ${p.record} does not exist` });
    } else {
      try {
        id = resolveTemplate(found.value as string, recordScope([found.value as string], record));
      } catch (e) {
        if (!(e instanceof Unverifiable)) throw e;
        errors.push({ rule: 'G4', message: `cannot resolve template: ${e.message}` });
      }
    }
  } else if (found.category === 'expression-dynamic') {
    errors.push({ rule: 'G4', message: 'expression-dynamic locator cannot be resolved statically' });
  } else if (p.record) {
    errors.push({ rule: 'G4', message: `record ${p.record} given for a static locator` });
  }

  if (found.locatorStrength !== 'strong') {
    warnings.push({ rule: 'G6', message: `${found.attribute} only; ask for a testID` });
  }

  if (errors.length) return decision('rejected');
  return decision('accepted', {
    attribute: found.attribute!,
    id,
    evidence: matches.map(evidence).join(', '),
    conditions: found.conditions,
  });
}

// G5 runs per scenario because the same step text can be valid for one
// persona and impossible for another.
export function decideScenarios(
  feature: FeatureDoc,
  steps: StepDecision[],
  testData: TestData,
): ScenarioDecision[] {
  const byStep = new Map(steps.map((s) => [s.step, s]));
  // Names any persona defines are persona data: missing for one persona is an
  // error. Names no persona defines are the app's own runtime state.
  const personaNames = new Set(Object.values(testData.personas).flatMap((p) => Object.keys(p.props)));
  return feature.scenarios.map((scenario) => {
    const personaTags = scenario.tags.filter((t) => t.startsWith('@persona:'));
    const personaName = personaTags.length === 1 ? personaTags[0].slice('@persona:'.length) : null;
    const persona = personaName ? testData.personas[personaName] : undefined;
    const errors: ScenarioDecision['errors'] = [];
    const warnings: ScenarioDecision['warnings'] = [];

    for (const { text } of scenario.steps) {
      const d = byStep.get(text);
      if (!d?.locator?.conditions.length) continue;
      const fail = (message: string) => errors.push({ rule: 'G5', message, step: text });

      if (personaTags.length !== 1) {
        fail(`conditional locator \`${d.locator.id}\` needs exactly one @persona tag, found ${personaTags.length}`);
        continue;
      }
      if (!persona) {
        fail(`persona \`${personaName}\` is not in test data`);
        continue;
      }
      const record = d.proposal.record ? lookupRecord(testData, d.proposal.record) : undefined;
      // Platform.OS is the platform this feature runs on, so a
      // platform-specific branch (e.g. an iOS-only picker) can be verified.
      const reserved = [...Object.keys(persona.props), 'Platform'];
      const scope = {
        ...persona.props,
        Platform: { OS: feature.platform },
        ...(record && recordScope(d.locator.conditions, record, reserved)),
      };
      const known = (name: string) => personaNames.has(name) || name === 'Platform' || name in scope;
      const state = d.locator.conditions.filter((c) => conditionRoots(c).some((n) => !known(n)));
      const decidable = d.locator.conditions.filter((c) => !state.includes(c));
      const expected = d.proposal.action !== 'assertNotVisible';
      try {
        const renders = decidable.every((c) => evaluateCondition(c, scope));
        if (!renders && expected) {
          fail(`\`${d.locator.id}\` does not render for persona ${personaName} (${decidable.join(' && ')}), but the step expects it shown`);
        } else if (renders && !expected && !state.length) {
          fail(`\`${d.locator.id}\` renders for persona ${personaName} (${decidable.join(' && ')}), but the step expects it hidden`);
        } else if (state.length && renders) {
          warnings.push({
            rule: 'G5',
            step: text,
            message: `\`${d.locator.id}\` also depends on runtime state (${state.join(' && ')}); not checked statically`,
          });
        }
      } catch (e) {
        if (!(e instanceof Unverifiable)) throw e;
        fail(`cannot verify \`${decidable.join(' && ')}\` for persona ${personaName}: ${e.message}`);
      }
    }
    return { scenario: scenario.name, line: scenario.line, persona: personaName, errors, warnings };
  });
}
