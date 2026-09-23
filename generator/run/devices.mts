// Local devices for a run: boot the simulator or emulator, build the app when
// its binary is missing (or on request), and run a generated suite while
// streaming each step's result. Machine paths default to this Mac's setup
// (README) and can be overridden with the usual environment variables.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, storyOutput } from '../paths.mts';
import type { Platform } from '../types.mts';

export type Say = (message: string) => void;

const IOS_DEVICE = process.env.IOS_SIMULATOR ?? 'iPhone 17';
const ANDROID_AVD = process.env.ANDROID_AVD ?? 'grounding_pixel';
const ANDROID_HOME = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
const JAVA_HOME = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@17';
const ADB = path.join(ANDROID_HOME, 'platform-tools/adb');
const env = { ...process.env, ANDROID_HOME, JAVA_HOME, PATH: `/opt/homebrew/bin:${process.env.PATH}`, LANG: 'en_US.UTF-8' };

export const APP_BINARY: Record<Platform, string> = {
  android: path.join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk'),
  ios: path.join(ROOT, 'ios/build/Build/Products/Release-iphonesimulator/rngroundingtest.app'),
};

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf-8', env, stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Streams a long command, reporting only lines that match `milestone`.
function stream(cmd: string, args: string[], opts: { cwd?: string; say: Say; milestone: RegExp; extraEnv?: Record<string, string> }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd ?? ROOT, env: { ...env, ...opts.extraEnv } });
    let tail = '';
    const onData = (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) {
        tail = (tail + '\n' + line).slice(-4000);
        if (opts.milestone.test(line)) opts.say(line.trim());
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} failed (exit ${code}):\n${tail.slice(-1500)}`))));
  });
}

// One device at a time: a simulator, an emulator, a build, and Appium
// together exhausted 16 GB earlier and crashed the emulator.
async function stopOther(platform: Platform, say: Say) {
  if (platform === 'android') {
    try {
      if (/Booted/.test(sh('xcrun', ['simctl', 'list', 'devices', 'booted']))) {
        say('Shutting down the iOS simulator to free memory for the Android emulator.');
        sh('xcrun', ['simctl', 'shutdown', 'all']);
      }
    } catch {
      // no Xcode: nothing to stop
    }
  } else if (fs.existsSync(ADB) && /emulator-\d+\s+device/.test(sh(ADB, ['devices']))) {
    say('Shutting down the Android emulator to free memory for the iOS simulator.');
    sh(ADB, ['emu', 'kill']);
    await sleep(5000);
  }
}

export async function ensureDevice(platform: Platform, say: Say): Promise<string> {
  await stopOther(platform, say);
  if (platform === 'ios') {
    const booted = sh('xcrun', ['simctl', 'list', 'devices', 'booted']);
    if (!booted.includes(IOS_DEVICE)) {
      say(`Booting the ${IOS_DEVICE} simulator.`);
      sh('xcrun', ['simctl', 'boot', IOS_DEVICE]);
      sh('xcrun', ['simctl', 'bootstatus', IOS_DEVICE, '-b']);
    }
    return `${IOS_DEVICE} simulator`;
  }
  if (!/emulator-\d+\s+device/.test(sh(ADB, ['devices']))) {
    say(`Booting the ${ANDROID_AVD} emulator (about a minute).`);
    const child = spawn(path.join(ANDROID_HOME, 'emulator/emulator'), ['-avd', ANDROID_AVD, '-no-snapshot-load', '-no-snapshot-save', '-no-boot-anim', '-gpu', 'host', '-memory', '3072'], { env, detached: true, stdio: 'ignore' });
    child.unref();
    sh(ADB, ['wait-for-device']);
    for (let i = 0; i < 80 && sh(ADB, ['shell', 'getprop', 'sys.boot_completed']).trim() !== '1'; i++) await sleep(3000);
    // Services keep starting after boot_completed; a run right away timed out.
    say('Emulator booted; letting its services settle.');
    await sleep(45000);
  }
  return `${ANDROID_AVD} emulator`;
}

export async function ensureBuild(platform: Platform, say: Say, rebuild = false): Promise<void> {
  if (fs.existsSync(APP_BINARY[platform]) && !rebuild) return;
  say(`Building the ${platform} app (release, JS bundled in). The first build takes several minutes.`);
  if (!fs.existsSync(path.join(ROOT, platform))) {
    await stream('npx', ['expo', 'prebuild', '--platform', platform, ...(platform === 'android' ? ['--no-install'] : [])], {
      say,
      milestone: /Finished prebuild|Installed CocoaPods|Error/,
      extraEnv: { CI: '1' },
    });
  }
  if (platform === 'ios') {
    await stream(
      'xcodebuild',
      ['-workspace', 'ios/rngroundingtest.xcworkspace', '-scheme', 'rngroundingtest', '-configuration', 'Release', '-sdk', 'iphonesimulator',
        '-destination', `platform=iOS Simulator,name=${IOS_DEVICE}`, '-derivedDataPath', 'ios/build', 'CODE_SIGNING_ALLOWED=NO'],
      { say, milestone: /BUILD SUCCEEDED|BUILD FAILED|error:/ },
    );
  } else {
    // In-process Kotlin: the Kotlin compile daemon hung the first build.
    await stream('./gradlew', ['assembleRelease', '--console=plain', '-Pkotlin.compiler.execution.strategy=in-process'], {
      cwd: path.join(ROOT, 'android'),
      say,
      milestone: /BUILD SUCCESSFUL|BUILD FAILED|What went wrong/,
      extraEnv: { NODE_ENV: 'production' },
    });
    try {
      execFileSync('./gradlew', ['--stop'], { cwd: path.join(ROOT, 'android'), env, stdio: 'ignore' });
    } catch {
      // the daemon may already be gone
    }
  }
}

export interface StepResult {
  scenario: string;
  // Which run of a scenario with this name (1, 2, ...): a Scenario Outline
  // without placeholders in its title expands to scenarios that share a name.
  occurrence: number;
  step: string;
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  error?: string;
}

export interface SuiteResult {
  platform: Platform;
  device: string;
  mode: 'validate-fallbacks' | 'normal';
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  steps: StepResult[];
}

// Runs the story's local suite, narrating each step as its result lands.
export async function runSuite(
  story: string,
  platform: Platform,
  device: string,
  opts: { validateFallbacks: boolean; say: Say },
): Promise<SuiteResult> {
  const resultsFile = path.join(os.tmpdir(), `results-${story}-${platform}-${process.pid}-${Date.now()}.jsonl`);
  const conf = path.join(storyOutput(story).root, `wdio.${platform}.local.conf.ts`);
  const startedAt = new Date().toISOString();
  opts.say(`Running ${story} on the ${device}${opts.validateFallbacks ? ' in fallback-validation mode' : ''}.`);

  let seen = 0;
  const steps: StepResult[] = [];
  // Scenarios run one at a time in feature order, so counting starts per
  // name tells which same-named scenario each step belongs to.
  const started = new Map<string, number>();
  const poll = () => {
    if (!fs.existsSync(resultsFile)) return;
    const lines = fs.readFileSync(resultsFile, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines.slice(seen)) {
      const e = JSON.parse(line);
      if (e.event === 'scenario') {
        started.set(e.scenario, (started.get(e.scenario) ?? 0) + 1);
        opts.say(`Scenario: ${e.scenario}`);
      }
      if (e.event === 'step') {
        const status = e.passed ? 'passed' : e.error ? 'failed' : 'pending';
        steps.push({ scenario: e.scenario, occurrence: started.get(e.scenario) ?? 1, step: e.step, status, ...(e.error && { error: e.error }) });
        opts.say(`  ${status === 'passed' ? '✓' : status === 'failed' ? '✗' : '…'} ${e.step}${status === 'pending' ? ' (pending)' : ''}${e.error ? `: ${e.error}` : ''}`);
      }
    }
    seen = lines.length;
  };
  const timer = setInterval(poll, 1000);
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('npx', ['wdio', 'run', conf], {
      cwd: ROOT,
      env: { ...env, RESULTS_FILE: resultsFile, ...(opts.validateFallbacks && { VALIDATE_FALLBACKS: '1' }) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (b) => (log = (log + b).slice(-20000)));
    child.stderr.on('data', (b) => (log = (log + b).slice(-20000)));
    child.on('close', (code) => {
      if (code && !steps.length) opts.say(`The suite did not start: ${log.split('\n').filter((l) => /Error|error/.test(l)).slice(-3).join(' | ')}`);
      resolve(code ?? 1);
    });
  });
  clearInterval(timer);
  poll();
  fs.rmSync(resultsFile, { force: true });
  return { platform, device, mode: opts.validateFallbacks ? 'validate-fallbacks' : 'normal', startedAt, finishedAt: new Date().toISOString(), exitCode, steps };
}
