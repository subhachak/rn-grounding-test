# RN Selector Grounding Test Harness

Small test repo built to answer one question directly: does static AST
extraction of React Native `testID`/`accessibilityLabel` values hold up
across the failure cases raised in a mobile SDLC selector-grounding
debate (stable IDs, templated/parameterized dynamic IDs, persona-gated
conditional rendering, missing IDs, accessibilityLabel-only, and
third-party component internals)?

## Structure

```
src/screens/
  LoginScreen.tsx              case 1: stable, hand-authored testIDs
  PlanListScreen.tsx           case 2: templated dynamic testIDs (list items)
  PlanDetailsScreen.tsx        case 3: persona-gated conditional rendering
  ContributionFormScreen.tsx   case 4: no locators at all (testability gap)
  AccountSummaryScreen.tsx     case 5: accessibilityLabel only, no testID
  ThirdPartyWidgetScreen.tsx   case 6: wraps a vendor component we can't see inside

scripts/extract-selectors.js   the AST extraction script itself
.vscode/tasks.json             one-click "Ground Selectors" task
.github/copilot-instructions.md  repo-level instructions for Copilot Chat/agent
```

## Running it

```bash
npm install
npm run ground          # prints categorized JSON to the terminal
npm run ground:save     # writes registry.json in the repo root
```

Or in VS Code: **Terminal > Run Task > Ground Selectors (AST extraction)**.

## What to look for

- `stable` findings should exactly match the literal strings in source
- `PlanListScreen` should produce `templated-dynamic` entries showing the
  raw template expression, not a blank and not a crash
- `PlanDetailsScreen` should produce entries for **both** conditional
  branches (`plan-details-entitled-panel` and `plan-details-restricted-panel`),
  since both exist in source even though only one renders at a time
- `ContributionFormScreen` should produce **zero** entries, confirming the
  script fails honestly (an explicit gap) rather than guessing
- `ThirdPartyWidgetScreen` should only show the wrapper's own `testID`,
  confirming static extraction can't see into a dependency's internals

## What this does and doesn't prove

Proves: extraction is deterministic, repeatable, and degrades honestly
(no hallucinated selectors, ever).

Doesn't prove: reachability or correctness at runtime. Templated IDs
(case 2) and persona-gated variants (case 3) still need a one-time live
validation pass to confirm they resolve and render as expected, that's
the complementary half of the grounding model this repo is testing one
side of.
