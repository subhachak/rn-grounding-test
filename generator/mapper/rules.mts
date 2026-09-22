// Deterministic step matcher. Proposes a mapping only when a step's phrasing
// names its target unambiguously in source evidence: an element's visible
// text or placeholder, the words of its testID, or a test-data record key.
// Anything short of exactly one candidate is left for the Copilot agent, so
// this never needs to be right by luck: a wrong match here would be a wrong
// test, while an unmatched step only costs one agent proposal.
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

type Target = { finding: RegistryFinding } | { unresolved: string };

// 1. exactly one candidate whose visible text/placeholder is the phrase;
// 2. else exactly one whose testID words plus visible text contain every word
//    of the phrase; for assertions, a tie broken by exactly one screen root
//    ("the dashboard is displayed" means the screen, not its welcome text).
function resolve(phrase: string, candidates: RegistryFinding[], assertion: boolean): Target {
  const words = tokens(phrase);
  if (!words.length) return { unresolved: 'no target words' };

  const exact = candidates.filter((f) => sameWords(descTokens(f), words));
  if (exact.length === 1) return { finding: exact[0] };
  if (exact.length > 1) return { unresolved: `"${phrase}" is the visible text of ${exact.length} elements` };

  let hits = candidates.filter((f) => {
    const have = new Set([...valueTokens(f), ...descTokens(f)]);
    return words.every((w) => have.has(w));
  });
  if (hits.length > 1 && assertion && hits.filter(isScreenRoot).length === 1) hits = hits.filter(isScreenRoot);
  if (hits.length === 1) return { finding: hits[0] };
  if (hits.length > 1) {
    return { unresolved: `"${phrase}" matches ${hits.map((f) => f.value ?? evidence(f)).join(', ')}` };
  }
  return { unresolved: `nothing in the registry matches "${phrase}"` };
}

function propose(step: string, action: Action, f: RegistryFinding, extra: Partial<Proposal>, why: string): Match {
  const base = { step, action, record: null, text: null, rationale: why, source: 'rules' as const, ...extra };
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

export function matchStep(step: string, input: MappingInput): Match {
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
    const target = resolve(isTap ? entity : `${entity} ${what}`, candidates, !isTap);
    if ('unresolved' in target) return target;
    return propose(step, isTap ? 'tap' : 'assertVisible', target.finding, { record }, `${record} fills ${target.finding.value}`);
  }

  // Only vendor components with an adapter can take a chosen value, so they
  // are the only candidates ("the date picker" is not its label or screen).
  if ((m = step.match(CHOOSE))) {
    const [, value, what] = m;
    const target = resolve(what, located.filter((f) => adapterFor(f.module)), false);
    if ('unresolved' in target) return target;
    return propose(step, 'choose', target.finding, { text: value }, `${target.finding.element} from ${target.finding.module}`);
  }

  if ((m = step.match(TYPE))) {
    const [, field, text] = m;
    const target = resolve(field, withGaps.filter((f) => f.element === 'TextInput'), false);
    if ('unresolved' in target) return target;
    return propose(step, 'type', target.finding, { text }, `TextInput "${target.finding.description ?? target.finding.value}"`);
  }

  if ((m = step.match(SHOWN))) {
    const [, what, not] = m;
    const target = resolve(what, located, true);
    if ('unresolved' in target) return target;
    return propose(step, not ? 'assertNotVisible' : 'assertVisible', target.finding, {}, `${target.finding.screen} ${target.finding.element}`);
  }

  if ((m = step.match(TAP))) {
    const target = resolve(m[1], withGaps.filter((f) => TAPPABLE.has(f.element)), false);
    if ('unresolved' in target) return target;
    return propose(step, 'tap', target.finding, {}, `${target.finding.element} "${target.finding.description ?? target.finding.value}"`);
  }

  return { unresolved: 'phrasing matches no rule' };
}
