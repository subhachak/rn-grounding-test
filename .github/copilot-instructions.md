# Copilot instructions for this repo

This repo is a test harness for **static, source-based selector grounding**
for a React Native test-authoring pipeline. It exists to validate one
question: can AST parsing of RN source reliably extract UI element
locators (`testID`, `accessibilityLabel`, `accessibilityIdentifier`)
without needing a live device session.

## The tool

`scripts/extract-selectors.js` walks `src/` and extracts every locator
attribute it finds via Babel AST parsing (not regex, not an LLM). Run it
with:

```
npm run ground
```

or the VS Code task **"Ground Selectors (AST extraction)"**.

It classifies each finding as:
- `stable` — a literal string, e.g. `testID="login-enroll-button"`
- `templated-dynamic` — a template-literal expression, e.g.
  `testID={\`plan-item-${item.id}\`}`, the pattern is captured even though
  the resolved value depends on runtime data
- `expression-dynamic` — any other non-literal expression

A screen with interactive elements and **no** locator attributes at all
produces **no entries** for that screen. Treat that as a signal, not a
bug: it means the element needs a `testID` added, or a different
grounding strategy (live-validated fallback locator).

## What Copilot should and shouldn't do here

- When asked to extend this script, keep it deterministic. Do not replace
  the AST walk with an LLM-based guess at what a selector "should" be.
- When asked to add a new test case (a new screen under `src/screens/`),
  match the existing pattern: a short comment at the top of the file
  explaining which grounding case it represents.
- Do not invent `testID` values that aren't in the source when discussing
  or summarizing this repo's output, that's the exact failure mode this
  tool is designed to catch.
