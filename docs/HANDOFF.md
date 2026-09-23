# Running the grounding harness on your own app

This harness turns Gherkin stories (one feature file per platform) into
Appium tests (WebdriverIO + Cucumber page objects and step definitions),
grounded in the `testID`s of your React Native source rather than guessed. It
runs them on Sauce Labs (or local simulators/emulators) and writes an HTML
report. GitHub Copilot, in VS Code, maps only the steps the deterministic
rules cannot, and a person approves anything Copilot proposes.

The harness was built against a demo app. Nothing in it is specific to that
app: where your app, stories, and test data live, and where tests run, all
come from one file, `grounding.config.json`.

## 1. What to hand over

From the repository the harness was built in:

```bash
npm run export -- ../grounding-harness            # Sauce Labs only
npm run export -- ../grounding-harness --with-local   # also local simulators/emulators
```

This copies the harness (`generator/`, `scripts/`, `.github/`, `.vscode/`,
`docs/`, `grounding.config.example.json`) with a `package.json` holding only
the harness's own dependencies. It leaves out the demo app (`src/`,
`App.tsx`, `app.json`, `ios/`, `android/`), its stories (`features/`), and
its test data (`test-data/`). The generator's tests and their small fixture
apps are included, since they test the harness itself.

Copying by hand works too: take the folders above and `package.json`, and
drop the demo app's dependencies (`expo`, `react-native`, and the rest of
`dependencies`).

## 2. Where it goes

Keep the harness in its own folder next to the app repository, not inside
it:

```
workspace/
  mobile-app/          your React Native app (unchanged)
  grounding-harness/   this harness
    grounding.config.json    points at ../mobile-app
    features/                your stories (or anywhere the config says)
    test-data/testdata.json
    output/                  generated, git-ignored
```

The harness only reads the app's source; it never changes it. The testIDs it
proposes for gaps come as a patch that engineering applies to the app (see
section 7).

## 3. Set up

Needs Node.js 22.18 or later (24 LTS recommended; the harness runs its
TypeScript directly) and access to the npm registry or your company's mirror.

```bash
cd grounding-harness
npm install
cp grounding.config.example.json grounding.config.json
# edit grounding.config.json (section 4)
npm run doctor
```

`npm run doctor` checks the whole setup and says what to fix: the config,
how much of the app source the scan can see through, the stories and test
data, and the run target. Run it after every config change.

For Copilot: open the harness folder in VS Code with GitHub Copilot (agent
mode) enabled. `.vscode/mcp.json` registers the harness's tool server; trust
and start it when VS Code asks. The agents appear in the Copilot Chat agent
picker, and `/run-story`, `/generate-appium`, `/review-matches`, `/ground`,
and `/clean-story` in the chat.

## 4. The config

`grounding.config.json` (comments allowed; paths are relative to the file).
`grounding.config.example.json` shows every field.

| Field | Default | What it is |
|---|---|---|
| `app.root` | `.` | The app repository |
| `app.sourceDir` | `src` | The UI source to scan, relative to `app.root` |
| `app.exclude` | none | Folders or files in `sourceDir` not to scan |
| `app.aliases` | from `tsconfig.json` | Import prefixes for the app's own code, e.g. `{ "@/": "src/" }` |
| `app.androidPackage`, `app.iosBundleId` | from Expo `app.json` | The installed app ids (required for a bare React Native app) |
| `features.dir` | `features` | One folder per story |
| `features.android`, `features.ios` | `android.feature`, `ios.feature` | The feature file names in each story folder |
| `testData` | `test-data/testdata.json` | Personas and records |
| `output` | `output` | Everything a run produces, per story |
| `run.target` | `local` | `sauce` or `local` |
| `run.sauce.region` | `us` | `us` (us-west-1), `us-east-4`, `eu` (eu-central-1) |
| `run.sauce.tunnelName` | none | Sauce Connect tunnel, if the app needs internal services |
| `run.sauce.build` | the story id | Groups runs on the Sauce Labs dashboard |
| `run.sauce.android` / `.ios` | | `app`, `deviceName`, `platformVersion` (and `automationName`, rarely needed) |

Environment variables override the file for one run: `GROUNDING_CONFIG`
(another config file), `GROUNDING_TARGET`, `SAUCE_REGION`,
`SAUCE_TUNNEL_NAME`, `SAUCE_BUILD`, `SAUCE_APP_ANDROID`, `SAUCE_APP_IOS`.
Credentials are never in the file (section 5).

### Import aliases matter

Apps rarely import everything relatively. The scan follows relative imports,
barrel files (`export * from './Button'`), and aliases, so it can see that
`<PrimaryButton testID="pay">` renders a touchable, or that
`testID={IDS.home.pay}` is `"home-pay"`. `tsconfig.json` `paths` are read
automatically. Aliases defined elsewhere (`babel-plugin-module-resolver` in
`babel.config.js`, or a tsconfig that `extends` a shared one) must be added
to `app.aliases`. `npm run doctor` lists imports it cannot place, e.g.
`@app/ (42)`. An unplaced alias does not fail anything: it makes wrappers
look like unknown components and constant testIDs look unresolved, which
shows up as more gaps and unmapped steps.

## 5. Sauce Labs

Nothing runs locally in this setup: Sauce Labs provides the devices and
Appium. The harness runs WebdriverIO on your machine, which drives the
Sauce Labs device over HTTPS.

### Credentials

In Sauce Labs, **Account > User settings** shows your username and access
key. Put them in the environment, never in the config or the repository:

```bash
export SAUCE_USERNAME=your.name
export SAUCE_ACCESS_KEY=...          # from a secrets store or user environment variable
```

On Windows, set them as user environment variables (System Properties >
Environment Variables) and restart VS Code so the Copilot tools see them.

### The app build

Sauce Labs installs a build you upload. It must be:

- **A release-style build with the JavaScript bundled in**, not a debug build
  that needs Metro. React Native keeps `testID`s in release builds.
- **Built from the same commit the harness scans.** Tests are generated from
  `app.sourceDir`; a build of older or newer source fails on locators that
  moved. The harness cannot check an uploaded build against the source (it
  does for local builds), so name uploads by commit (below).
- Android: an `.apk` (or `.aab`). iOS on a real device: a signed `.ipa`
  (Sauce Labs re-signs it for its devices). iOS on a simulator: the
  simulator `.app` folder, zipped.

### Uploading it

In the Sauce Labs UI, **App Management > Upload**, or from a terminal or CI
job (the host matches your region, e.g. `api.eu-central-1.saucelabs.com`):

```bash
curl -u "$SAUCE_USERNAME:$SAUCE_ACCESS_KEY" -X POST \
  https://api.us-west-1.saucelabs.com/v1/storage/upload \
  -F payload=@android/app/build/outputs/apk/release/app-release.apk \
  -F name=mobile-app-$(git rev-parse --short HEAD).apk
```

Reference it in the config (or `SAUCE_APP_ANDROID` / `SAUCE_APP_IOS` for one
run) as `storage:filename=<name>` (the latest upload with that name) or
`storage:<file id>` from the upload response. Naming uploads by commit and
passing `SAUCE_APP_ANDROID=storage:filename=mobile-app-<commit>.apk` per run
keeps the tested build and the scanned source together.

### Devices

`deviceName` is an exact name or a regular expression Sauce Labs matches
against its devices:

| Want | `deviceName` | Notes |
|---|---|---|
| Any Pixel phone | `Google Pixel.*` | real device |
| A Samsung S23 or S24 | `Samsung Galaxy S2[34].*` | real device |
| Android emulator | `Android GoogleAPI Emulator` | needs `platformVersion` |
| Any iPhone | `iPhone.*` | real device, `.ipa` |
| iPhone simulator | `iPhone Simulator` or `iPhone 15 Simulator` | zipped `.app`, needs `platformVersion` |

Pin `platformVersion` (e.g. `"14"`, `"17"`) for repeatable results. Your Sauce
Labs plan decides which real devices and how many at once you can use.

### Internal services: Sauce Connect

If the app talks to services not reachable from the internet (a test
backend inside your network), the device reaches them through a Sauce
Connect tunnel. Start the tunnel on a machine inside the network (see the
Sauce Connect documentation for your version), give it a name, and set
`run.sauce.tunnelName` to that name. The tunnel must be running while
tests run. Public backends need no tunnel.

### Corporate proxy

If your machine reaches the internet through a proxy, set `HTTPS_PROXY` (and
`NO_PROXY` for internal hosts). Node.js's own HTTP client, used by
`npm run doctor -- --online`, also needs `NODE_USE_ENV_PROXY=1`.
WebdriverIO's connection to Sauce Labs goes through the same proxy; if the
doctor's online check passes but a run cannot connect, confirm with your
network team that `*.saucelabs.com` is allowed.

### Check, then run

```bash
npm run doctor -- --online      # credentials valid, each app present in Sauce storage
npm run story -- STORY-1        # both platforms, on Sauce Labs when run.target is "sauce"
npm run story -- STORY-1 --platform android
npm run story -- STORY-1 --target sauce   # regardless of run.target
```

In Copilot Chat: `/run-story STORY-1`. Runs appear on the Sauce Labs
dashboard under the build name, with video and Appium logs. A real device
can take a few minutes to be allocated; the harness waits up to five
minutes per attempt.

## 6. Writing stories

Each story is a folder in `features.dir` with one feature file per platform.
Steps name the element they act on as a person would, and the rules map a
step only when that phrase identifies exactly one element in the source:

- its visible text or placeholder: `When I tap Log In`, `And I enter username "member.entitled"`
- the words of its testID: `Then the plan details screen is displayed` (`plan-details-screen`)
- a test-data record for a templated testID: `When I open plan "p1"` (`plan-card-${plan.id}` with record `p1`)

Anything the rules cannot map goes to Copilot (`/generate-appium`), and a
person approves its proposals. A scenario that relies on a persona tags it
`@persona:<name>`; the gate checks that every persona-gated element the
scenario uses actually renders for that persona, using `testData`:

```json
{
  "personas": {
    "entitled": { "username": "member.entitled", "props": { "isEntitled": true } }
  },
  "records": {
    "plans": { "p1": { "id": "p1", "entitled": true } }
  }
}
```

`props` are the names your components test (`isEntitled` in
`{isEntitled ? ... : ...}`); records supply the values of templated testIDs
and of per-item conditions. `docs/REFERENCE.md` covers each phase in detail.

## 7. What comes back

Per story, in `output/<story>/`:

- `reports/latest.html`: device results, how each step was mapped and by
  whom, approvals, gaps, and the run log.
- `pageobjects/`, `<platform>/steps.ts`, `wdio.<platform>.conf.ts` (Sauce
  Labs) and `wdio.<platform>.local.conf.ts`: the generated tests, runnable on
  their own with `npx wdio run output/<story>/wdio.android.conf.ts`.
- `remediation/testids.patch`: testIDs for elements that have none, in each
  screen's naming convention. Engineering applies it in the app repository:
  `git apply ../grounding-harness/output/<story>/remediation/testids.patch`.

`npm run clean -- STORY-1` resets a story's output (and its approvals).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| doctor: "imports that are not relative, an alias, or a dependency" | An alias the scan does not know; add it to `app.aliases` |
| doctor: few findings, or many "expression-based" testIDs | Wrong `sourceDir`, or an unplaced alias |
| "no app id for android" | Bare React Native app: set `app.androidPackage` / `app.iosBundleId` |
| "Sauce Labs run needs SAUCE_USERNAME..." | Credentials not in the environment VS Code or the terminal was started from |
| "not in Sauce storage" | Wrong region, a different account, or the file name differs from the upload |
| A run waits, then fails to get a session | No matching device free; loosen `deviceName` or check plan concurrency |
| Locators fail that the report says are grounded | The uploaded build is not from the scanned commit |
| Steps pending "awaiting the Copilot agent" | Run `/generate-appium` or `/run-story` in Copilot Chat |
