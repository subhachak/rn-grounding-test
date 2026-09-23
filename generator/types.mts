// Shared shapes for the feature -> Appium generator.
//
// Flow: features (parsed) -> proposals -> gate decides -> codegen.
// Proposals come from the deterministic matcher (mapper/rules.mts) and, only
// for steps it cannot match, from the Copilot agent via proposals.json. Every
// verdict is plain code in gate.mts.

export type Platform = 'android' | 'ios';
export const PLATFORMS: Platform[] = ['android', 'ios'];

export type StepKind = 'context' | 'action' | 'outcome';

export interface FeatureStep {
  text: string;
  kind: StepKind;
  line: number;
}

export interface FeatureScenario {
  name: string;
  tags: string[];
  line: number;
  steps: FeatureStep[];
}

export interface FeatureDoc {
  platform: Platform;
  file: string;
  name: string;
  scenarios: FeatureScenario[];
}

// One entry from the extractor's registry (scripts/extract-selectors.js).
export interface RegistryFinding {
  screen: string;
  element: string;
  attribute: 'testID' | 'accessibilityLabel' | 'accessibilityIdentifier' | null;
  category: 'stable' | 'templated-dynamic' | 'expression-dynamic' | 'missing';
  value: string | null;
  locatorStrength: 'strong' | 'medium' | 'weak' | null;
  conditions: string[];
  description?: string | null;
  hasSpreadProps?: boolean;
  module?: string; // package the element is imported from, when not react-native
  component?: string; // local wrapper used (e.g. PrimaryButton); element is what it renders
  resolvedFrom?: string; // source expression a constant testID was resolved from
  navigatesTo?: string; // screen component a tap certainly navigates to
  file: string;
  line: number;
}

export interface Persona {
  username: string;
  props: Record<string, unknown>;
}

export interface TestData {
  personas: Record<string, Persona>;
  // collection -> key -> record, referenced by proposals as "collection.key"
  records: Record<string, Record<string, Record<string, unknown>>>;
}

// choose: set a vendor component's value through its adapter (vendors.mts).
export const ACTIONS = ['tap', 'type', 'choose', 'assertVisible', 'assertNotVisible', 'back', 'unmapped'] as const;
export type Action = (typeof ACTIONS)[number];

export const TAPPABLE = new Set([
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Pressable',
  'Button',
  'Switch',
]);

// rules: the deterministic matcher; agent: the Copilot agent, via
// proposals.json; human: a QA engineer's entry in proposals.json
// ("author": "human"), for when the agent is unavailable or wrong; none:
// nothing has proposed a mapping for the step yet.
export type ProposalSource = 'rules' | 'agent' | 'human' | 'none';

// A proposal for one step text. `locator` must be a registry value copied
// verbatim; the gate rejects anything else.
export interface Proposal {
  step: string;
  action: Action;
  locator: string | null;
  record: string | null;
  text: string | null;
  gap: string | null;
  rationale: string;
  source: ProposalSource;
  // For an unmapped step that names a testability gap: what the step meant to
  // do there, so a device-validated fallback locator can carry it out.
  intent?: Exclude<Action, 'back' | 'unmapped' | 'choose'> | null;
  // Human approval of a non-rule mapping (agent or QA), or of a rule match
  // the match critic flagged; unflagged rule matches need none.
  approval?: 'approved' | 'awaiting' | 'stale' | 'self-approved';
  flag?: string; // the match critic's concern about this rule match
}

export interface MappingInput {
  platform: Platform;
  steps: string[];
  // Each scenario's step texts in order, for screen context. Optional:
  // without it steps are matched on their words alone.
  scenarios?: string[][];
  registry: RegistryFinding[];
  testData: TestData;
}

export type RuleId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'G10';

export interface Finding {
  rule: RuleId;
  message: string;
}

export type Verdict = 'accepted' | 'rejected' | 'ungrounded';

export interface FallbackInfo {
  // validated = device-validated and approved by a person; awaiting-approval
  // = device-validated, not yet approved.
  state: 'unvalidated' | 'awaiting-approval' | 'validated' | 'failed';
  key: string; // gap location, file:line
  proposedTestID: string;
  matches?: number;
  device?: string;
  validatedAt?: string;
  approvedBy?: string;
}

export interface ResolvedLocator {
  attribute: NonNullable<RegistryFinding['attribute']>;
  id: string;
  evidence: string;
  conditions: string[];
}

// Static decision for a step text, independent of which scenario uses it.
export interface StepDecision {
  step: string;
  proposal: Proposal;
  verdict: Verdict;
  locator: ResolvedLocator | null;
  // An ungrounded step's cited gap, when its intent fits that element and so
  // a fallback locator could act on it.
  gap: RegistryFinding | null;
  // Set by the pipeline for a gap step that has a fallback page member.
  fallback?: FallbackInfo;
  errors: Finding[];
  warnings: Finding[];
}

// Per-scenario check of the conditional locators a scenario relies on.
export interface ScenarioDecision {
  scenario: string;
  line: number;
  persona: string | null;
  errors: (Finding & { step: string })[];
  // Conditions on runtime UI state (an error message, an empty list) that
  // test data cannot decide; noted, not failed.
  warnings: (Finding & { step: string })[];
}

export interface PlatformResult {
  platform: Platform;
  feature: FeatureDoc;
  steps: StepDecision[];
  scenarios: ScenarioDecision[];
}
