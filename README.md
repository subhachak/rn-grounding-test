# RN Selector Grounding Test Harness

A runnable Expo/React Native app built to stress-test static AST
extraction of `testID`/`accessibilityLabel` values against realistic RN
patterns, the failure cases raised in a mobile SDLC selector-grounding
debate.

Not a copy of a real client app (no access to that source, and not
the point), it's structurally representative: real navigation, nested
lists, persona-gated rendering, mixed-gap forms, and a vendor-component
blind spot.

## Structure

```
App.tsx                        real entry point, wires up navigation
src/navigation/RootNavigator.tsx   Login -> Dashboard -> PlanList -> PlanDetails -> Contribution flow
src/screens/
  LoginScreen.tsx                 case 1: stable, hand-authored testIDs
  DashboardScreen.tsx             stable IDs, just fills out real navigation
  PlanListScreen.tsx              case 2 + 7: templated dynamic IDs, WITH a
                                   persona-gated badge nested inside each
                                   list item (combines the list pattern and
                                   the conditional-rendering pattern)
  PlanDetailsScreen.tsx           case 3: persona-gated conditional rendering
                                   at the screen level
  ContributionFormScreen.tsx      case 4: MIXED gap, two fields have testIDs,
                                   two (frequency input, cancel button) don't,
                                   the realistic version of "missing IDs"
  AccountSummaryScreen.tsx        case 5: accessibilityLabel only, no testID
  ThirdPartyWidgetScreen.tsx      case 6: wraps a vendor date-picker component
                                   we can't see inside

scripts/extract-selectors.js   the AST extraction script
scripts/mcp-server.js          exposes the script as an MCP tool (ground_selectors)
.vscode/mcp.json               registers that MCP server with VS Code
.github/agents/selector-grounding.agent.md  Copilot custom agent using that tool
.vscode/tasks.json             one-click "Ground Selectors" task
.github/copilot-instructions.md  repo-level instructions for Copilot Chat/agent
```

## Running the grounding script

```bash
npm install
npm run ground          # prints categorized JSON to the terminal
npm run ground:save     # writes registry.json in the repo root
```

Or in VS Code: **Terminal > Run Task > Ground Selectors (AST extraction)**.

This part works anywhere, no simulator or device needed, it's pure
source analysis.

### From Copilot Chat

Pick **Selector Grounding** in the Copilot Chat agent picker and ask,
e.g. "which elements are missing testIDs?". The agent can only call the
`ground_selectors` tool, which returns a compact slice of the registry
(`summary`, `gaps`, `variants`, `dynamic`, `weak`, or `all`) instead of the
full JSON, and runs on the cheapest available model, to keep AI credit use
low. The first time, VS Code asks you to trust/start the MCP server from
`.vscode/mcp.json`.

## Running the actual app (needs your machine, not this sandbox)

This was built in a cloud container with no display and no iOS/Android
toolchain, so it's never been launched. To actually run it:

```bash
npm install
npx expo start
```

Then either:
- Scan the QR code with **Expo Go** on your phone (fastest, no native
  build needed), or
- Press `i` for iOS simulator (Mac + Xcode required), or
- Press `a` for Android emulator (Android Studio required)

## The live-validation half, not built here

Once it's running somewhere real, the second half of the grounding model
(one-time live validation of the templated and persona-gated cases) needs
Appium pointed at that running instance:

- **Appium + Appium Inspector**, to capture the live accessibility tree
- Point it at the Expo Go session, simulator, or emulator
- Confirm `plan-item-p1`, `plan-item-entitled-badge-p1`, etc. actually
  resolve the way `registry.json` predicts, and that both
  `plan-details-entitled-panel` and `plan-details-restricted-panel`
  render correctly for the right persona

That's the piece this repo doesn't (and can't, from a headless container)
prove on its own, it's the complementary half of the model, not a
redundant check.

## What running this so far proves

- Static extraction is deterministic and repeatable across all six-plus
  cases, exact same output, every run
- Templated dynamic IDs, including ones nested inside a persona-gated
  branch inside a mapped list, are captured as patterns, not blanks, not
  crashes, not hallucinated literal values
- Partial gaps (some fields in a form missing IDs, not the whole screen)
  are reported explicitly as `missing` findings with file, line, and a
  description (e.g. the Cancel button), not left as silent absences
- Persona-gated locators carry the gating condition (`isEntitled`,
  `!(item.entitled)`), so the variants that need live validation are
  identified by the scan itself
- Each locator is tagged with `locatorStrength` (testID >
  accessibilityIdentifier > accessibilityLabel)
- Vendor component internals are correctly invisible to static scan,
  confirming that blind spot is real and needs either a testID added on
  our side or a live-validated fallback locator
