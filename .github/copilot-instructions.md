# Copilot instructions for this repo

This repo is a test harness for **static, source-based selector grounding**
for a React Native test-authoring pipeline. It exists to validate one
question: can AST parsing of RN source reliably extract UI element
locators (`testID`, `accessibilityLabel`, `accessibilityIdentifier`)
without needing a live device session.

## The tool

`scripts/extract-selectors.js` walks the app's UI source (`app.sourceDir` in
`grounding.config.json`, `src/` by default) and extracts every locator
attribute it finds via Babel AST parsing (not regex, not an LLM). Run it
with:

```
npm run ground
```

or the VS Code task **"Ground Selectors (AST extraction)"**.

It classifies each finding as:
- `stable` — a literal string, e.g. `testID="login-enroll-button"`
- `templated-dynamic` — a template-literal expression, e.g.
  `testID={\`plan-card-${plan.id}\`}`, the pattern is captured even though
  the resolved value depends on runtime data
- `expression-dynamic` — any other non-literal expression

- `missing` — an interactive element (touchable, input, `Pressable`,
  `Switch`, or anything with an `onPress`/`onChangeText`-style handler)
  with **no** locator attribute. It carries a `description` (placeholder or
  child text) so the gap is identifiable. Treat it as a testability gap to
  push back to engineering, or a case for a live-validated fallback
  locator. `hasSpreadProps: true` means a `{...props}` spread might be
  supplying the locator, so confirm before filing it.

Every finding also has:
- `conditions` — source text of each condition gating whether the element
  mounts (ternary branch, `&&`, `if` block), outermost first. Non-empty
  means a structural variant: ground it once under each persona/data state
  that renders it.
- `locatorStrength` — `strong` (testID) > `medium`
  (accessibilityIdentifier) > `weak` (accessibilityLabel, user-facing copy
  that gets localized and reworded).

## What Copilot should and shouldn't do here

- When asked to extend this script, keep it deterministic. Do not replace
  the AST walk with an LLM-based guess at what a selector "should" be.
- When asked to add a new test case (a new screen under `src/screens/`),
  match the existing pattern: a short comment at the top of the file
  explaining which grounding case it represents.
- Do not invent `testID` values that aren't in the source when discussing
  or summarizing this repo's output, that's the exact failure mode this
  tool is designed to catch.
