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
output/<story>/                everything a run produces for a story (git-ignored; npm run clean resets it):
                               page objects, step definitions, local + Sauce Labs configs, grounding report,
                               testID patch, agent/QA mappings, critic review, fallback validations,
                               approvals, and HTML run reports
scripts/mcp-server.js          exposes the script as an MCP tool (ground_selectors)
.vscode/mcp.json               registers that MCP server with VS Code
.github/agents/selector-grounding.agent.md  Copilot custom agent using that tool
.vscode/tasks.json             one-click "Ground Selectors" task
.github/copilot-instructions.md  repo-level instructions for Copilot Chat/agent
```

## What the extractor sees through

- **Constants**: `testID={IDS.login.submit}` or `testID={SUBMIT_ID}`,
  including constants imported from local files, resolve to their literal
  value (`resolvedFrom` records the expression); constant parts of a
  template are inlined and runtime parts stay placeholders.
- **Wrapper components**: `<PrimaryButton testID="save">` is recorded as the
  native element the wrapper forwards its testID to (`element:
  TouchableOpacity`, `component: PrimaryButton`), through nested wrappers;
  the wrapper's own `testID={testID}` pass-through is not reported.
- **Screens are components**: several components in one file are separate
  screens.
- **Deterministic output**: files are read in sorted order, and a test
  proves generation is byte-identical run to run.

Covered by fixtures in `generator/test/fixtures/blindspots/` (excluded from
real scans). Still not seen: conditions decided outside the component
(props or context from elsewhere), and testIDs passed through spread props.

## Running the grounding script

```bash
npm install
npm run ground          # prints categorized JSON to the terminal
npm run ground:save     # writes output/registry.json
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

## Run a whole story with one command

**In Copilot Chat:** `/run-story STORY-101` (agent **Story Runner**). It
narrates each phase: overview, mapping any unmapped steps, critiquing rule
matches, approvals, device runs, report. When something needs a person,
VS Code shows you an approval form with the evidence; the agent never sees
or answers that form. Restart the `selector-grounding` MCP server after
pulling changes.

**In a terminal:** the same phases, prompting you in the terminal:

```bash
npm run story -- STORY-101                     # both platforms
npm run story -- STORY-101 --platform ios      # one platform
npm run story -- STORY-101 --no-devices        # generate, approve, report only
```

It boots the simulator/emulator itself (one at a time, for memory), builds
the app if its binary is missing (`--rebuild` to force), validates new
fallback locators first and asks you to approve them, runs the suite with a
line per step, and writes `output/<story>/reports/latest.html`: device results per
scenario and step, how every step was mapped and decided, gaps with the
proposed testID patch, fallbacks with their device evidence, critic flags,
every human approval (who, when, fingerprint), and the run log. Without a
terminal (e.g. CI) it approves nothing; those steps stay pending.

## Generating Appium tests from feature files

Each story has one feature file per platform under `features/<story>/`
(`android.feature`, `ios.feature`). The output is WebdriverIO + Cucumber
step definitions and a Sauce Labs config per platform, in
`output/<story>/`.

### Where things live, and resetting a story

The repository holds only base files: the app (`src/`), feature files
(`features/<story>/`), test data, the generator, scripts, agents, and docs.
Everything a run produces goes under `output/<story>/`, which is
git-ignored:

```
output/STORY-101/
  pageobjects/            WebdriverIO page objects (whole app), base.page.ts
  android/steps.ts, ios/steps.ts
  wdio.<platform>.conf.ts, wdio.<platform>.local.conf.ts
  grounding-report.md|json
  registry.json           the locator registry these tests were generated from
  remediation/            testids.patch + README (proposed testIDs for gaps)
  proposals.json          agent / QA mappings, with their approvals
  review.json             match-critic flags, with their approvals
  validations.json        fallback device validations, with their approvals
  reports/                run.json, latest.html, report-<time>.html
```

```bash
npm run clean -- STORY-101     # reset one story
npm run clean -- --all         # reset every story
```

In Copilot Chat: `/clean-story STORY-101` (or `/clean-story all`, agent
**Story Cleaner**). It shows what the deletion includes and asks you to
confirm in a VS Code form first; the agent cannot confirm for you.

Because decisions and approvals live in `output/`, cleaning a story also
clears its approvals and validations; the next run asks for them again.
Keep the HTML report if you need the audit trail.

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
   `submit_proposals`, which saves them to `output/<story>/proposals.json`.
   An agent proposal can never override a rule match. If the rules match
   everything, the agent makes no model call at all. Until the agent has
   run, the leftovers are generated as `pending` steps marked "awaiting the
   Copilot agent".
4. **Gate** (`generator/gate.mts`, rules G1 to G8) checks every mapping,
   from rules or agent, against a fresh scan of `src/` and
   `test-data/testdata.json`: the locator must exist verbatim, templated IDs
   must resolve from a named record, persona-gated locators must actually
   render for the scenario's `@persona:` tag, and so on.
5. **Generate** WebdriverIO page objects and step definitions.
   `output/<story>/pageobjects/` has one `<screen>.page.ts` per screen,
   built from the whole app's registry: getters for
   static testIDs (`LoginPage.submitButton`), methods for templated ones
   (`PlanListPage.planItem('p1')`), render conditions and testability gaps
   noted in comments. `base.page.ts` is the only place that knows how
   locators surface per platform, how to assert container views on iOS,
   and how to type reliably (`typeText` focuses, waits for the keyboard,
   and reads the field back). `output/<story>/<platform>/steps.ts` only
   calls page objects (a test enforces that no step builds a selector);
   each step cites its source line and whether rules or the agent mapped
   it. Rejected and ungrounded steps are generated as `pending` with the
   reason, so a gap shows up in the run rather than as a guessed locator.
   Configs and the grounding report are written per story.

### Testability gaps: fix at source, fall back only when validated

An interactive element with no locator (e.g. the Cancel button) is handled
in two deterministic ways, neither of which guesses:

1. **Proposed testID patch.** `output/<story>/remediation/testids.patch` adds a
   testID at each gap in the screen's existing naming convention
   (`contribution-cancel-button`), with a summary in
   `output/<story>/remediation/README.md`. Engineering applies it with
   `git apply output/<story>/remediation/testids.patch`; a test proves the patch
   applies and closes every gap.
2. **Device-validated fallback**, until the patch lands. Each gap with
   visible text or a placeholder gets per-platform fallback selectors
   (`generator/fallbacks.mts`) as a page-object member that already has the
   name its future testID will produce, so steps do not change when the
   testID arrives. A fallback is used only after a device run confirmed it
   matches exactly one element on that platform:

   ```bash
   VALIDATE_FALLBACKS=1 npx wdio run output/STORY-101/wdio.ios.local.conf.ts
   npm run generate -- features/STORY-101     # validated fallbacks become normal steps
   ```

   Results, with the exact selector tested and the device, are recorded in
   `output/<story>/validations.json` (audit evidence); a changed selector needs
   validating again. Unvalidated or failed fallbacks stay `pending`.

Gaps with no visible text or placeholder get no fallback and stay
`pending` with the reason.

### Human approval gates

The gate checks that a mapping is possible (the element exists, fits the
action, renders for the persona); it cannot check that it is right. So two
things are used only after a named person approves them:

- **Mappings not made by the rules**, from the Copilot agent or a QA entry
  in `proposals.json`. Rule matches (exact, single matches on source
  evidence) need no approval.
- **Device-validated fallbacks**, since they are weaker than a testID.

```bash
npm run approve -- STORY-101 --list                                   # what is waiting, with the evidence
npm run approve -- STORY-101 --step "I open the contribution form"     # approve a mapping (both platforms)
npm run approve -- STORY-101 --fallback src/screens/ContributionFormScreen.tsx:17 --platform android
npm run generate -- features/STORY-101
```

An approval records who (`--by`, default `git config user.name`) and when,
bound to a fingerprint of exactly what was approved: if the mapping or the
fallback selector changes later, it needs approving again. Whoever wrote a
mapping (`authoredBy`) cannot approve it. Until approved, the step is
generated as `pending` with the reason and the gate's verdict.

### Match critic: a second look at rule matches

Rule matches are exact and single, so they need no approval, but rules
cannot judge meaning. The **Match Critic** Copilot agent (`/review-matches
STORY-101`) reviews them through two tools, `get_rule_matches` (each match
with its element, visible text, screen, and render condition) and
`submit_review`, and can only flag. A flag, stored in
`output/<story>/review.json` and bound to the fingerprint of the match it
questions, holds that match as `pending` until a person approves it with
`npm run approve`; a flag on a match that has since changed no longer
applies. The critic cannot approve, change, or remove anything.

### Vendor components: adapters for what static extraction cannot see

The contribution date picker is a real vendor component
(`@react-native-community/datetimepicker`). The testID we pass it is
extracted like any other, and the extractor records the package each
element is imported from, but the native wheels inside it are invisible to
a source scan. `generator/vendors.mts` is a small, reviewed catalog mapping a
vendor package to an adapter helper in `base.page.ts` (`chooseDate`), which
operates the internals and reads them back. The rules map
`I choose "2026-10-01" in the date picker` to a `choose` action; the gate
(G10) allows `choose` only on an element from a package with an adapter,
with a value in that adapter's format. The iOS adapter sets year, month,
then day and re-sets any wheel that drifted (a first run landed on the 3rd
instead of the 1st, which its read-back caught). The Android adapter is not
implemented yet; no Android scenario uses the picker.

Steps the rules cannot map can also be mapped by a QA engineer in
`output/<story>/proposals.json` with `"author": "human"` and `authoredBy` (reported as
`QA`), the manual path when the Copilot agent is unavailable. The agent
never overwrites a human mapping, and both go through the same gate.

The CLI exits 2 when the gate rejected a mapping or a scenario failed G5.
For STORY-101 the rules map 21 of 24 Android steps and 24 of 26 iOS steps.
The remaining steps (2 per platform) need the Copilot agent or a QA
mapping, approved by a person. With them mapped and the fallbacks
approved, every scenario has run on device with nothing pending: Android
49/49, iOS 49/49.

### Running the generated tests

Each story gets two WebdriverIO configs per platform. Both restart the app
before every scenario, so each scenario starts at the login screen.

- `wdio.<platform>.local.conf.ts`: starts Appium itself and installs the
  local build on a running emulator/simulator.
- `wdio.<platform>.conf.ts`: Sauce Labs. Needs `SAUCE_USERNAME`,
  `SAUCE_ACCESS_KEY`, and `SAUCE_APP_ANDROID` / `SAUCE_APP_IOS`.

Local Android, once the toolchain below is installed:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=$HOME/Library/Android/sdk
$ANDROID_HOME/emulator/emulator -avd grounding_pixel &          # boot the emulator
npx expo prebuild --platform android                            # generate android/ (gitignored)
(cd android && ./gradlew assembleRelease)                       # build the APK, JS bundled in
npx wdio run output/STORY-101/wdio.android.local.conf.ts
```

Toolchain (one time, Apple silicon Mac): `brew install --cask
android-commandlinetools`, `brew install openjdk@17`, then with
`sdkmanager --sdk_root=$ANDROID_HOME` install `platform-tools`, `emulator`,
`platforms;android-36`, `build-tools;36.0.0`, `cmdline-tools;latest`, and
`system-images;android-36;google_apis;arm64-v8a`; create the AVD with
`avdmanager create avd -n grounding_pixel -k
"system-images;android-36;google_apis;arm64-v8a" -d pixel_7`; and
`npx appium driver install uiautomator2`.

First live result (Android 36 emulator, STORY-101): 39 steps passed, 2
pending (the step still awaiting the Copilot agent), 8 skipped after them.
It confirmed on device that RN exposes `testID` as the Android
`resource-id`, that templated IDs resolve (`plan-item-p1`), that both
persona variants render as the gate predicted, and that the
accessibilityLabel-only balance is found via content-desc.

Local iOS, once Xcode and an iOS Simulator runtime are installed
(`brew install cocoapods`, `npx appium driver install xcuitest`):

```bash
xcrun simctl boot "iPhone 17"
npx expo prebuild --platform ios                                # generate ios/ (gitignored), runs pod install
xcodebuild -workspace ios/rngroundingtest.xcworkspace -scheme rngroundingtest \
  -configuration Release -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO
npx wdio run output/STORY-101/wdio.ios.local.conf.ts
```

iOS 27 kills apps that have not adopted the UIScene lifecycle at launch;
`app.json` opts in through `expo-build-properties` (`enableSceneSupport`,
Expo 57.0.23+).

First live iOS result (iPhone 17, iOS 27): 41 steps passed, 2 pending
(awaiting the Copilot agent), 6 skipped. Two things only the live run
could show: XCUITest reports RN container views as not visible even on
screen, so iOS assertions on a container `View` check presence instead
(`generator/codegen.mts`); and iOS autocorrect mangled `member.restricted`
into `memberestricted`, which the persona assertion caught, fixed with
`autoCorrect={false}` on the username field.

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
