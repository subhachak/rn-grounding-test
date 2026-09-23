# RN Selector Grounding Test Harness

Generates Appium (WebdriverIO + Cucumber) tests from Gherkin feature files,
grounded in the testIDs of a React Native app's source, not guessed by an
AI. The demo app, **Harbor Retirement**, is an Expo app with real screens,
two personas, and the locator patterns real apps have, including the ones
that make grounding hard.

## Using it on another app

Nothing in the harness is specific to this demo app. `grounding.config.json`
(see `grounding.config.example.json`) says where the app source, stories,
test data, and output are, and whether tests run on local devices or Sauce
Labs; with no config file the defaults describe this repository.
`npm run export -- <folder>` copies just the harness for another team,
`npm run doctor` checks a setup, and [docs/HANDOFF.md](docs/HANDOFF.md) walks
through setup, the config, and Sauce Labs provisioning.

## Structure

```
App.tsx                        entry point: safe area, session, navigation
src/theme.ts                   colors, spacing, type, money/date formatting
src/data/mock.ts               members, plans, transactions, documents
src/session.tsx                sign-in, persona (isEntitled), contribution draft
src/testIds.ts                 testIDs kept as constants (Home uses them)
src/components/                Button, Card, Chip, Field, ListRow, Badge, ... (wrappers that forward testID)
src/navigation/RootNavigator.tsx   stack + tabs: Login, Enroll, Home / Plans / Activity / Profile,
                                   Plan details, Contribute -> Schedule -> Confirmation, Documents, Upgrade
src/screens/                   one file per screen, each opening with the grounding case it shows
grounding.config.example.json  every config field, documented (copy to grounding.config.json)
docs/HANDOFF.md                running the harness on another app, and on Sauce Labs
generator/config.mts           reads the config; generator/doctor.mts and export.mts
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

Demo accounts (any password): `member.entitled` (Alex Morgan, Premier) and
`member.restricted` (Jordan Lee, Basic). Basic members see locked panels
and an upsell instead of contributions.

### Grounding cases in the app

| Case | Where |
|---|---|
| Literal testIDs | Login, Enroll, Plan details, Contribute, Confirmation |
| testIDs from constants (`testID={HOME.contributeAction}`) | Home |
| Wrapper components forwarding testID (`Button`, `Chip`, `Field`, `ListRow`, `SectionHeader`, same-file `QuickAction`, `TransactionRow`) | throughout |
| Templated IDs in lists, any loop variable (`plan-card-${plan.id}`, `activity-row-${t.id}`, `login-demo-${m.username}`) | Plans, Activity, Home, Contribute, Login |
| Persona-gated rendering (`isEntitled`, `plan.entitled`) | Plan details, Contribute, Profile, Plans badges |
| Platform-gated rendering (`Platform.OS === 'ios'`) | Schedule: inline picker on iOS, native dialog on Android |
| Runtime-state rendering (`error`, empty list) | Login and Contribute errors, Activity empty state |
| Weak locator (accessibilityLabel only) | Documents |
| Gaps: no testID, with text (Cancel), with only a placeholder (date of birth), with neither (frequency options) | Contribute, Enroll |
| Vendor component (`@react-native-community/datetimepicker`) | Schedule |

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

**In Copilot Chat:** `/run-story STORY-1` (agent **Story Runner**). It
narrates each phase: overview, mapping any unmapped steps, critiquing rule
matches, approvals, device runs, report. When something needs a person,
VS Code shows you an approval form with the evidence; the agent never sees
or answers that form. A form waits up to 15 minutes for you
(`GROUNDING_FORM_TIMEOUT_MS` to change it); with no answer, those items
stay pending and the run continues. Before each device run it asks about
anything still awaiting approval for that platform. Restart the `selector-grounding` MCP server after
pulling changes.

**In a terminal:** the same phases, prompting you in the terminal:

```bash
npm run story -- STORY-1                     # both platforms
npm run story -- STORY-1 --platform ios      # one platform
npm run story -- STORY-1 --no-devices        # generate, approve, report only
```

It boots the simulator/emulator itself (one at a time, for memory), builds
the app when its binary is missing or no longer matches the app source
(`--rebuild` to force), validates new
fallback locators first and asks you to approve them, runs the suite with a
line per step, and writes `output/<story>/reports/latest.html`: device results per
scenario and step, how every step was mapped and decided, gaps with the
proposed testID patch, fallbacks with their device evidence, critic flags,
every human approval (who, when, fingerprint), and the run log. Without a
terminal (e.g. CI) it approves nothing; those steps stay pending.

### Stale builds

Tests are generated from the current `src/`, so they must run on a build of
that same source. Each build records a fingerprint of what it was made from
(`src/`, `App.tsx`, and config for the bundle; `app.json`, `package.json`,
and the lockfile for the native project) in
`android/app/build/source-fingerprint.json` or
`ios/build/source-fingerprint.json`. Before a device run the fingerprint is
compared with the current source: a source change rebuilds, a config or
dependency change runs `expo prebuild` again first, and an unchanged source
reuses the build. The report shows which fingerprint each tested build came
from.

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
output/STORY-1/
  pageobjects/            WebdriverIO page objects (whole app), base.page.ts
  steps/common/<page>.steps.ts   step definitions by page, shared by both platforms
  steps/<platform>/<page>.steps.ts   only where a platform differs
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
npm run clean -- STORY-1     # reset one story
npm run clean -- --all         # reset every story
```

In Copilot Chat: `/clean-story STORY-1` (or `/clean-story all`, agent
**Story Cleaner**). It shows what the deletion includes and asks you to
confirm in a VS Code form first; the agent cannot confirm for you.

Because decisions and approvals live in `output/`, cleaning a story also
clears its approvals and validations; the next run asks for them again.
Keep the HTML report if you need the audit trail.

```bash
npm run generate -- features/STORY-1
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
3. **Copilot agent, for the leftovers only.** `/generate-appium STORY-1`
   in Copilot Chat (agent **Appium Test Generator**) sees just the unmatched
   steps via `get_mapping_context`, and submits proposals via
   `submit_proposals`, which saves them to `output/<story>/proposals.json`.
   An agent proposal can never override a rule match. If the rules match
   everything, the agent makes no model call at all. Until the agent has
   run, the leftovers are generated as `pending` steps marked "awaiting the
   Copilot agent".
4. **Gate** (`generator/gate.mts`, rules G1 to G10) checks every mapping,
   from rules or agent, against a fresh scan of `src/` and
   `test-data/testdata.json`: the locator must exist verbatim, templated IDs
   must resolve from a named record, persona-gated locators must actually
   render for the scenario's `@persona:` tag, and so on.
5. **Generate** WebdriverIO page objects and step definitions.
   `output/<story>/pageobjects/` has one `<screen>.page.ts` per screen,
   built from the whole app's registry: getters for
   static testIDs (`LoginPage.submitButton`), methods for templated ones
   (`PlansPage.planCard('p1')`), render conditions and testability gaps
   noted in comments. `base.page.ts` is the only place that knows how
   locators surface per platform, how to assert container views on iOS,
   and how to type reliably (`typeText` focuses, waits for the keyboard,
   and reads the field back). Step definitions only call page objects (a
   test enforces that no step builds a selector); each cites its source
   line and whether rules or the agent mapped it. Rejected and ungrounded
   steps are generated as `pending` with the reason, so a gap shows up in
   the run rather than as a guessed locator. Configs and the grounding
   report are written per story.

   Step definitions are laid out for reuse, as a corpus of pages and their
   steps: one file per page object (`steps/common/login.steps.ts` beside
   `pageobjects/login.page.ts`), holding only steps that act on that page.
   Steps that differ only in a quoted value share one parameterized
   definition (`I enter username "member.entitled"` and `"member.restricted"`
   become `/^I enter username "([^"]*)"$/`), when the value goes straight
   into the code and every step of that phrasing does the same thing, so no
   step can ever match two definitions. A definition identical on both
   platforms is in `steps/common/`; one that differs (a fallback validated
   on one platform, a platform-only step) is in `steps/<platform>/`. Steps
   with no mapping yet are kept apart in `pending.steps.ts`, and device-level
   steps (back) in `app.steps.ts`. Each platform's config loads
   `steps/common` plus its own folder.

### Testability gaps: fix at source, fall back only when validated

An interactive element with no locator (e.g. Contribute's Cancel button) is handled
in two deterministic ways, neither of which guesses:

1. **Proposed testID patch.** `output/<story>/remediation/testids.patch` adds a
   testID at each gap in the screen's existing naming convention
   (`contribute-cancel-button`), with a summary in
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
   VALIDATE_FALLBACKS=1 npx wdio run output/STORY-1/wdio.ios.local.conf.ts
   npm run generate -- features/STORY-1     # validated fallbacks become normal steps
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
npm run approve -- STORY-1 --list                                   # what is waiting, with the evidence
npm run approve -- STORY-1 --step "I tap the frequency option"        # approve a mapping (both platforms)
npm run approve -- STORY-1 --fallback src/screens/ContributeScreen.tsx:114 --platform android
npm run generate -- features/STORY-1
```

An approval records who (`--by`, default `git config user.name`) and when,
bound to a fingerprint of exactly what was approved: if the mapping or the
fallback selector changes later, it needs approving again. Whoever wrote a
mapping (`authoredBy`) cannot approve it. Until approved, the step is
generated as `pending` with the reason and the gate's verdict.

### Match critic: a second look at rule matches

Rule matches are exact and single, so they need no approval, but rules
cannot judge meaning. The **Match Critic** Copilot agent (`/review-matches
STORY-1`) reviews them through two tools, `get_rule_matches` (each match
with its element, visible text, screen, and render condition) and
`submit_review`, and can only flag. A flag, stored in
`output/<story>/review.json` and bound to the fingerprint of the match it
questions, holds that match as `pending` until a person approves it with
`npm run approve`; a flag on a match that has since changed no longer
applies. The critic cannot approve, change, or remove anything.

### Vendor components: adapters for what static extraction cannot see

The Schedule screen's date picker is a real vendor component
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
instead of the 1st, which its read-back caught). On Android the app opens the
system date dialog instead, and the Android adapter is not implemented yet.

Steps the rules cannot map can also be mapped by a QA engineer in
`output/<story>/proposals.json` with `"author": "human"` and `authoredBy` (reported as
`QA`), the manual path when the Copilot agent is unavailable. The agent
never overwrites a human mapping, and both go through the same gate.

The CLI exits 2 when the gate rejected a mapping or a scenario failed G5.

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
npx wdio run output/STORY-1/wdio.android.local.conf.ts
```

Toolchain (one time, Apple silicon Mac): `brew install --cask
android-commandlinetools`, `brew install openjdk@17`, then with
`sdkmanager --sdk_root=$ANDROID_HOME` install `platform-tools`, `emulator`,
`platforms;android-36`, `build-tools;36.0.0`, `cmdline-tools;latest`, and
`system-images;android-36;google_apis;arm64-v8a`; create the AVD with
`avdmanager create avd -n grounding_pixel -k
"system-images;android-36;google_apis;arm64-v8a" -d pixel_7`; and
`npx appium driver install uiautomator2`.

Local iOS, once Xcode and an iOS Simulator runtime are installed
(`brew install cocoapods`, `npx appium driver install xcuitest`):

```bash
xcrun simctl boot "iPhone 17"
npx expo prebuild --platform ios                                # generate ios/ (gitignored), runs pod install
xcodebuild -workspace ios/rngroundingtest.xcworkspace -scheme rngroundingtest \
  -configuration Release -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO
npx wdio run output/STORY-1/wdio.ios.local.conf.ts
```

iOS 27 kills apps that have not adopted the UIScene lifecycle at launch;
`app.json` opts in through `expo-build-properties` (`enableSceneSupport`,
Expo 57.0.23+).

Lessons from live runs, built into the generator: XCUITest reports RN
container views as not visible even on screen, so iOS assertions on a
container `View` check presence instead (`generator/codegen.mts`); and iOS
autocorrect can mangle usernames, hence `autoCorrect={false}` on the
username field.
