// Fallback locators for testability gaps, for use until engineering adds the
// proposed testID. Candidates are derived from source evidence only (visible
// text or placeholder), never guessed, and a fallback is used in a generated
// step only after a device run confirmed it matches exactly one element on
// that platform. Validation results are recorded, with the selector that was
// tested, in fallbacks/validations.json as audit evidence.
import fs from 'node:fs';
import path from 'node:path';
import { evidence } from './registry.mts';
import { TAPPABLE, type Platform, type RegistryFinding } from './types.mts';

export type Selectors = Record<Platform, string>;

export interface ValidationRecord {
  selector: string;
  matches: number;
  device: string;
  validatedAt: string;
}

// gap location (file:line) -> platform -> latest validation
export type Validations = Record<string, Partial<Record<Platform, ValidationRecord>>>;

export const VALIDATIONS_FILE = 'fallbacks/validations.json';

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Observed on device: RN exposes an accessible touchable's text as its
// content-desc on Android and its label on iOS, and a TextInput's placeholder
// as the hint on Android and placeholderValue on iOS.
export function fallbackSelectors(gap: RegistryFinding): Selectors | null {
  const text = gap.description;
  if (!text) return null;
  if (gap.element === 'TextInput') {
    return {
      android: `//android.widget.EditText[@hint="${q(text)}"]`,
      ios: `-ios predicate string:type == "XCUIElementTypeTextField" AND placeholderValue == "${q(text)}"`,
    };
  }
  if (TAPPABLE.has(gap.element)) {
    return {
      android: `android=new UiSelector().description("${q(text)}")`,
      ios: `-ios predicate string:label == "${q(text)}"`,
    };
  }
  return null;
}

export function loadValidations(repoRoot: string): Validations {
  const file = path.join(repoRoot, VALIDATIONS_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
}

export type FallbackStatus =
  | { state: 'none' } // no candidate from source evidence (e.g. no visible text)
  | { state: 'unvalidated'; selectors: Selectors }
  | { state: 'validated'; selectors: Selectors; record: ValidationRecord }
  | { state: 'failed'; selectors: Selectors; record: ValidationRecord };

// A record only counts for the selector it tested: if the visible text (and
// so the candidate) changed since, the fallback must be validated again.
export function fallbackStatus(gap: RegistryFinding, platform: Platform, validations: Validations): FallbackStatus {
  const selectors = fallbackSelectors(gap);
  if (!selectors) return { state: 'none' };
  const record = validations[evidence(gap)]?.[platform];
  if (!record || record.selector !== selectors[platform]) return { state: 'unvalidated', selectors };
  return record.matches === 1 ? { state: 'validated', selectors, record } : { state: 'failed', selectors, record };
}
