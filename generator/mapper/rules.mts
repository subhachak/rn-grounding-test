// Deterministic step matcher. Proposes a mapping only when a step's phrasing
// names its target unambiguously in source evidence: an element's visible
// text or placeholder, the words of its testID, or a test-data record key.
// Anything short of exactly one candidate is left for the Copilot agent, so
// this never needs to be right by luck: a wrong match here would be a wrong
// test, while an unmatched step only costs one agent proposal.
//
// Screen context breaks ties, as a person reading the scenario would: after
// `the plans screen is displayed`, `I open plan "p1"` means the plan on the
// Plans screen, not the one on Home. Context comes only from what earlier
// steps established (an element asserted visible is on the current screen;
// a tap may navigate, so after it the screen is unknown), and it is used only
// when words alone leave more than one candidate. A step text shares one
// definition wherever it appears, so it is mapped only if every occurrence
// resolves to the same element.
import { evidence } from '../registry.mts';
import { TAPPABLE, type Action, type MappingInput, type Proposal, type RegistryFinding } from '../types.mts';
import { adapterFor } from '../vendors.mts';

export type Match = { proposal: Proposal } | { unresolved: string };

const STOPWORDS = new Set(['the', 'a', 'an', 'my', 'is', 'are', 'in', 'on', 'of', 'to']);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// Template placeholders (${item.id}) are not words of the ID.
const valueTokens = (f: RegistryFinding) => tokens((f.value ?? '').replace(/\$\{[^}]*\}/g, ' '));
const descTokens = (f: RegistryFinding) => tokens(f.description ?? '');
const sameWords = (a: string[], b: string[]) => a.length > 0 && a.join(' ') === b.join(' ');
const isScreenRoot = (f: RegistryFinding) => /View$/.test(f.element) && /-screen$/.test(f.value ?? '');

type Target = { finding: RegistryFinding; byScreen?: string } | { unresolved: string };

// A tie left by the words, broken by the current screen when exactly one
// candidate is on it.
function onScreen(hits: RegistryFinding[], screen: string | null | undefined): Target | null {
  if (!screen) return null;
  const here = hits.filter((f) => f.screen === screen);
  return here.length === 1 ? { finding: here[0], byScreen: screen } : null;
}

// 1. exactly one candidate whose visible text/placeholder is the phrase;
// 2. else exactly one whose testID words plus visible text contain every word
//    of the phrase; for assertions, a tie broken by exactly one screen root
//    ("the dashboard is displayed" means the screen, not its welcome text).
function resolve(phrase: string, candidates: RegistryFinding[], assertion: boolean, screen?: string | null): Target {
  const words = tokens(phrase);
  if (!words.length) return { unresolved: 'no target words' };

  const exact = candidates.filter((f) => sameWords(descTokens(f), words));
  if (exact.length === 1) return { finding: exact[0] };
  if (exact.length > 1) {
    return onScreen(exact, screen) ?? { unresolved: `"${phrase}" is the visible text of ${exact.length} elements${where(screen)}` };
  }

  let hits = candidates.filter((f) => {
    const have = new Set([...valueTokens(f), ...descTokens(f)]);
    return words.every((w) => have.has(w));
  });
  if (hits.length > 1 && assertion && hits.filter(isScreenRoot).length === 1) hits = hits.filter(isScreenRoot);
  if (hits.length === 1) return { finding: hits[0] };
  if (hits.length > 1) {
    return onScreen(hits, screen) ?? { unresolved: `"${phrase}" matches ${hits.map((f) => f.value ?? evidence(f)).join(', ')}${where(screen)}` };
  }
  return { unresolved: `nothing in the registry matches "${phrase}"` };
}

const where = (screen: string | null | undefined) => (screen ? ` (none of them alone on ${screen})` : '');

function propose(step: string, action: Action, target: { finding: RegistryFinding; byScreen?: string }, extra: Partial<Proposal>, why: string): Match {
  const f = target.finding;
  const rationale = target.byScreen ? `${why}; the one on ${target.byScreen}, the screen earlier steps established` : why;
  const base = { step, action, record: null, text: null, rationale, source: 'rules' as const, ...extra };
  if (f.category === 'missing') {
    // Matched an element that has no locator: a confirmed testability gap.
    // Keep what the step meant to do so a validated fallback can do it.
    const intent = action === 'back' || action === 'unmapped' || action === 'choose' ? null : action;
    return { proposal: { ...base, action: 'unmapped', locator: null, gap: evidence(f), intent } };
  }
  return { proposal: { ...base, locator: f.value, gap: null } };
}

function recordRef(entity: string, key: string, input: MappingInput): string | null {
  for (const [collection, rows] of Object.entries(input.testData.records)) {
    if (collection !== entity && collection !== `${entity}s`) continue;
    for (const [k, row] of Object.entries(rows)) {
      if (k === key || row.id === key) return `${collection}.${k}`;
    }
  }
  return null;
}

const BACK = /^I (?:press|tap|use) (?:the )?(?:device |hardware |system )?back button(?: in the navigation bar)?$|^I (?:go|navigate) back$/;
const RECORD_ASSERT = /^(?:the )?(\w+) "([^"]+)" (?:shows|displays|has) (?:the |an? )?(.+)$/;
const RECORD_TAP = /^I (?:tap|open|select) (?:the )?(\w+) "([^"]+)"$/;
const TYPE = /^I (?:enter|type|fill in) (?:the )?(.+?) "([^"]*)"$/;
const CHOOSE = /^I (?:choose|select|pick|set) "([^"]+)" (?:in|on|with|as) (?:the )?(.+)$/;
const TAP = /^I (?:tap|press|click|select|open) (?:on )?(?:the )?(.+?)(?: button)?$/;
const SHOWN = /^(?:the )?(.+?) (?:is|are) (not )?(?:displayed|shown|visible)$/;

export function matchStep(step: string, input: MappingInput, screen: string | null = null): Match {
  const located = input.registry.filter((f) => f.category === 'stable' || f.category === 'templated-dynamic');
  const withGaps = input.registry.filter((f) => f.category !== 'expression-dynamic');
  let m: RegExpMatchArray | null;

  if (BACK.test(step)) {
    return { proposal: { step, action: 'back', locator: null, record: null, text: null, gap: null, rationale: 'platform back navigation', source: 'rules' } };
  }

  if ((m = step.match(RECORD_ASSERT)) || (m = step.match(RECORD_TAP))) {
    const isTap = RECORD_TAP.test(step);
    const [, entity, key, what] = m;
    const record = recordRef(entity.toLowerCase(), key, input);
    if (!record) return { unresolved: `no test-data record for ${entity} "${key}"` };
    const candidates = located.filter((f) => f.category === 'templated-dynamic' && (!isTap || TAPPABLE.has(f.element)));
    const target = resolve(isTap ? entity : `${entity} ${what}`, candidates, !isTap, screen);
    if ('unresolved' in target) return target;
    return propose(step, isTap ? 'tap' : 'assertVisible', target, { record }, `${record} fills ${target.finding.value}`);
  }

  // Only vendor components with an adapter can take a chosen value, so they
  // are the only candidates ("the date picker" is not its label or screen).
  if ((m = step.match(CHOOSE))) {
    const [, value, what] = m;
    const target = resolve(what, located.filter((f) => adapterFor(f.module)), false, screen);
    if ('unresolved' in target) return target;
    return propose(step, 'choose', target, { text: value }, `${target.finding.element} from ${target.finding.module}`);
  }

  if ((m = step.match(TYPE))) {
    const [, field, text] = m;
    const target = resolve(field, withGaps.filter((f) => f.element === 'TextInput'), false, screen);
    if ('unresolved' in target) return target;
    return propose(step, 'type', target, { text }, `TextInput "${target.finding.description ?? target.finding.value}"`);
  }

  if ((m = step.match(SHOWN))) {
    const [, what, not] = m;
    const target = resolve(what, located, true, screen);
    if ('unresolved' in target) return target;
    return propose(step, not ? 'assertNotVisible' : 'assertVisible', target, {}, `${target.finding.screen} ${target.finding.element}`);
  }

  if ((m = step.match(TAP))) {
    const target = resolve(m[1], withGaps.filter((f) => TAPPABLE.has(f.element)), false, screen);
    if ('unresolved' in target) return target;
    return propose(step, 'tap', target, {}, `${target.finding.element} "${target.finding.description ?? target.finding.value}"`);
  }

  return { unresolved: 'phrasing matches no rule' };
}

// The screen a step leaves the app on, as far as the scenario shows it: an
// element asserted visible is on the current screen; typing, choosing, and
// asserting something hidden stay on it; a tap (or back, or a step not
// understood) may navigate, so the screen is unknown after it.
function screenAfter(m: Match, before: string | null, registry: RegistryFinding[]): string | null {
  if (!('proposal' in m)) return null;
  const p = m.proposal;
  if (p.action === 'type' || p.action === 'choose' || p.action === 'assertNotVisible') return before;
  if (p.action === 'assertVisible') return registry.find((f) => f.value === p.locator)?.screen ?? null;
  return null;
}

const sameMapping = (a: Proposal, b: Proposal) =>
  a.action === b.action && a.locator === b.locator && a.record === b.record && a.text === b.text && a.gap === b.gap;

// Every unique step of a feature, matched in the context of each scenario
// that uses it. Without scenarios (callers that only have step texts), steps
// are matched without context.
export function matchSteps(input: MappingInput): Map<string, Match> {
  const occurrences = new Map<string, { match: Match; screen: string | null }[]>();
  for (const steps of input.scenarios ?? []) {
    let screen: string | null = null;
    for (const step of steps) {
      const match = matchStep(step, input, screen);
      occurrences.set(step, [...(occurrences.get(step) ?? []), { match, screen }]);
      screen = screenAfter(match, screen, input.registry);
    }
  }
  const out = new Map<string, Match>();
  for (const step of input.steps) {
    const seen = occurrences.get(step);
    if (!seen?.length) {
      out.set(step, matchStep(step, input));
      continue;
    }
    const first = seen[0].match;
    const unresolved = seen.find((o) => 'unresolved' in o.match);
    if (unresolved) {
      out.set(step, unresolved.match);
    } else if (seen.every((o) => sameMapping((o.match as { proposal: Proposal }).proposal, (first as { proposal: Proposal }).proposal))) {
      out.set(step, first);
    } else {
      const targets = [...new Set(seen.map((o) => `${(o.match as { proposal: Proposal }).proposal.locator} on ${o.screen ?? 'an unknown screen'}`))];
      out.set(step, { unresolved: `the step means different elements in different scenarios (${targets.join('; ')}); one definition cannot serve both` });
    }
  }
  return out;
}
