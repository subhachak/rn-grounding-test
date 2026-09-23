// Step definitions are generated one file per page, parameterized where
// steps differ only in a quoted value, and shared across platforms unless
// they differ, so pages and their steps can be collected into a corpus.
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { generateStepFiles } from '../codegen.mts';
import { decideStory, storyDir } from '../pipeline.mts';
import { useTempOutput } from './helpers.mts';

useTempOutput();

const ROOT_DIR = '/out/steps';
const PAGES = '/out/pageobjects';
const files = (mutate?: (d: ReturnType<typeof decideStory>) => void) => {
  const d = decideStory(storyDir('STORY-101'));
  mutate?.(d);
  return generateStepFiles(d.results, d.model, d.testData, ROOT_DIR, PAGES, 'STORY-101');
};

test('one step file per page object, in common when identical on both platforms, else per platform', () => {
  const out = files();
  const names = [...out.keys()];
  assert.ok(names.includes('common/login.steps.ts'));
  assert.ok(names.includes('common/plan-list.steps.ts'));
  // identical on both platforms: only in common
  assert.ok(!names.includes('android/login.steps.ts') && !names.includes('ios/login.steps.ts'));
  // genuinely per platform: a fallback is validated on each platform separately,
  // back is Android-only, and only the iOS story opens the schedule
  assert.ok(names.includes('android/contribution-form.steps.ts'));
  assert.ok(names.includes('android/app.steps.ts'));
  assert.ok(names.includes('ios/dashboard.steps.ts'));
  const login = out.get('common/login.steps.ts')!;
  assert.match(login, /import LoginPage from '\.\.\/\.\.\/pageobjects\/login\.page';/);
  // a page's file holds only steps that act on that page
  assert.doesNotMatch(login, /PlanListPage/);
});

test('steps that differ only in a quoted value share one parameterized definition', () => {
  const login = files().get('common/login.steps.ts')!;
  const username = login.match(/I enter username/g) ?? [];
  assert.equal(username.length, 1, 'member.entitled and member.restricted share a definition');
  assert.match(login, /When\(\/\^I enter username "\(\[\^"\]\*\)"\$\/, async \(arg1: string\) => \{/);
  assert.match(login, /typeText\(LoginPage\.usernameInput, arg1\)/);
  // a record id is a parameter of the page method it selects with
  const plans = files().get('common/plan-list.steps.ts')!;
  assert.match(plans, /I open plan "\(\[\^"\]\*\)"/);
  assert.match(plans, /\.planItem\(arg1\)/);
  assert.doesNotMatch(plans, /"p1"|"p2"/);
});

test('a step whose code differs by platform goes to that platform, not common', () => {
  const out = files((d) => {
    const ios = d.results.find((r) => r.platform === 'ios')!;
    const step = ios.steps.find((s) => s.step === 'I tap Log In')!;
    step.warnings = [{ rule: 'G5', message: 'ios-only note' }];
  });
  assert.match(out.get('ios/login.steps.ts')!, /I tap Log In[\s\S]*ios-only note/);
  assert.match(out.get('android/login.steps.ts')!, /I tap Log In/);
  assert.doesNotMatch(out.get('common/login.steps.ts')!, /I tap Log In/);
  assert.match(out.get('ios/login.steps.ts')!, /on ios only/);
});

test('steps with no mapping yet are kept apart in pending.steps.ts', () => {
  const out = files((d) => {
    for (const r of d.results) {
      const step = r.steps.find((s) => s.step === 'I tap Log In')!;
      step.verdict = 'ungrounded';
      step.proposal = { ...step.proposal, rationale: 'test: unmapped' };
      step.locator = null;
    }
  });
  const pending = out.get('common/pending.steps.ts')!;
  assert.match(pending, /I tap Log In[\s\S]*return 'pending';/);
  assert.doesNotMatch(out.get('common/login.steps.ts')!, /I tap Log In/);
});

test('generated file paths stay inside the steps folder', () => {
  for (const name of files().keys()) assert.equal(path.normalize(name).startsWith('..'), false);
});
