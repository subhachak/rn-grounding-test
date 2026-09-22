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
features/<story>/              android.feature + ios.feature per story, plus the agent's proposals.json once it has run
test-data/testdata.json        personas and records the gate resolves conditions and templates against
generator/                     feature -> grounded WebdriverIO + Cucumber generator (see below)
generated/<story>/             generated step definitions, Sauce Labs configs, grounding report
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

## Generating Appium tests from feature files

Each story has one feature file per platform under `features/<story>/`
(`android.feature`, `ios.feature`). The output is WebdriverIO + Cucumber
step definitions and a Sauce Labs config per platform, in
`generated/<story>/`.

```bash
npm run generate -- features/STORY-101
npm run test:generator
npm run typecheck:generator
```

`npm run generate` is fully deterministic and needs no AI. GitHub Copilot is
the only AI involved, and only for steps the rules cannot match.

### How a step is decided

1. **Parse** both feature files with the Gherkin parser (outlines expanded,
   Background inlined).
2. **Match by rules** (`generator/mapper/rules.mts`). A step is mapped only
   when its phrasing names exactly one element in source evidence: visible
   text or placeholder (`I tap Log In`), the words of a testID
   (`the login screen is displayed`), or a test-data record
   (`I open plan "p1"`). Naming an element that has no testID
   (`I tap Cancel`) becomes a cited testability gap. Anything ambiguous or
   unmatched is left for the agent rather than guessed.
3. **Copilot agent, for the leftovers only.** `/generate-appium STORY-101`
   in Copilot Chat (agent **Appium Test Generator**) sees just the unmatched
   steps via `get_mapping_context`, and submits proposals via
   `submit_proposals`, which saves them to `features/<story>/proposals.json`.
   An agent proposal can never override a rule match. If the rules match
   everything, the agent makes no model call at all. Until the agent has
   run, the leftovers are generated as `pending` steps marked "awaiting the
   Copilot agent".
4. **Gate** (`generator/gate.mts`, rules G1 to G8) checks every mapping,
   from rules or agent, against a fresh scan of `src/` and
   `test-data/testdata.json`: the locator must exist verbatim, templated IDs
   must resolve from a named record, persona-gated locators must actually
   render for the scenario's `@persona:` tag, and so on.
5. **Generate** `generated/<story>/<platform>/steps.ts`,
   `wdio.<platform>.conf.ts`, and `grounding-report.md`. Accepted steps get
   the concrete selector, the source line, and whether rules or the agent
   proposed it. Rejected and ungrounded steps are generated as `pending`
   with the reason, so a gap shows up in the run rather than as a guessed
   locator.

The CLI exits 2 when the gate rejected a mapping or a scenario failed G5.
For STORY-101 the rules map 21 of 24 Android steps and 22 of 26 iOS steps;
2 and 4 steps are left for the agent.

To run on Sauce Labs: set `SAUCE_USERNAME`, `SAUCE_ACCESS_KEY`, and
`SAUCE_APP_ANDROID` / `SAUCE_APP_IOS`, then
`npx wdio run generated/STORY-101/wdio.ios.conf.ts`.

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
