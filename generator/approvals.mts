// Human approval gates. A mapping that did not come from the deterministic
// rules (Copilot agent or QA entry) and a device-validated fallback are both
// used only after a named person approves them. An approval is bound to a
// fingerprint of exactly what was approved, so any later change to the
// mapping or the fallback selector needs approving again.
import { createHash } from 'node:crypto';
import type { Action } from './types.mts';

export interface Approval {
  by: string;
  at: string; // ISO timestamp
  fingerprint: string;
}

export interface MappingEntry {
  action: Action;
  locator: string | null;
  record: string | null;
  text: string | null;
  gap: string | null;
  intent?: string | null;
  rationale: string;
  author?: 'agent' | 'human';
  authoredBy?: string; // who wrote it, for the four-eyes check
  approval?: Approval;
}

// Only what the step will do counts; the rationale can be reworded freely.
export function mappingFingerprint(e: MappingEntry): string {
  const what = [e.action, e.locator, e.record, e.text, e.gap, e.intent ?? null];
  return createHash('sha256').update(JSON.stringify(what)).digest('hex').slice(0, 16);
}

export function fallbackFingerprint(key: string, selector: string): string {
  return createHash('sha256').update(JSON.stringify([key, selector])).digest('hex').slice(0, 16);
}

export type ApprovalState = 'approved' | 'awaiting' | 'stale' | 'self-approved';

export function mappingApproval(e: MappingEntry): ApprovalState {
  if (!e.approval) return 'awaiting';
  if (e.approval.fingerprint !== mappingFingerprint(e)) return 'stale';
  // Four-eyes: whoever wrote a mapping cannot be the one who approves it.
  if (e.authoredBy && e.authoredBy.trim().toLowerCase() === e.approval.by.trim().toLowerCase()) return 'self-approved';
  return 'approved';
}

export const APPROVAL_REASON: Record<Exclude<ApprovalState, 'approved'>, string> = {
  awaiting: 'awaiting human approval (npm run approve)',
  stale: 'changed since it was approved; needs approving again',
  'self-approved': 'approved by its own author; needs a second person',
};
