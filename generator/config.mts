// Where the app, stories, and test data live, and where tests run. Read from
// grounding.config.json at the harness root, or the file GROUNDING_CONFIG
// names. With no config file, the defaults describe this repo's demo app, so
// the harness runs here unchanged; pointed at another app, only the config
// changes, never the code. Paths in the file are relative to the file, and
// it may contain comments (grounding.config.example.json documents each field).
//
// Secrets never go in the file: Sauce Labs credentials come only from
// SAUCE_USERNAME and SAUCE_ACCESS_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, type Platform } from './types.mts';

export const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export type RunTarget = 'local' | 'sauce';

export interface SauceDevice {
  // A storage reference (storage:filename=MyApp.apk, storage:<file id>) or a
  // public URL. SAUCE_APP_ANDROID / SAUCE_APP_IOS override it at run time.
  app?: string;
  deviceName: string; // exact name or regex, e.g. "Google Pixel.*", "iPhone 1[5-7].*"
  platformVersion?: string;
  automationName: string;
}

export interface GroundingConfig {
  file: string | null; // the config file read, null for the built-in defaults
  app: {
    root: string;
    sourceDir: string; // absolute; the directory scanned for UI source
    // Import prefixes mapped to directories (absolute), e.g. "@/" -> <root>/src/.
    // tsconfig.json `paths` are read automatically; these add to or override them.
    aliases: Record<string, string>;
    exclude: string[]; // absolute; directories or files inside sourceDir not to scan
    ids: Partial<Record<Platform, string>>; // Android package, iOS bundle id
  };
  features: { dir: string; files: Record<Platform, string> };
  testData: string;
  output: string;
  run: {
    target: RunTarget;
    sauce: {
      region: string;
      build?: string;
      tunnelName?: string;
      devices: Record<Platform, SauceDevice>;
    };
  };
}

interface RawConfig {
  app?: { root?: string; sourceDir?: string; exclude?: string[]; aliases?: Record<string, string>; androidPackage?: string; iosBundleId?: string };
  features?: { dir?: string; android?: string; ios?: string };
  testData?: string;
  output?: string;
  run?: {
    target?: RunTarget;
    sauce?: {
      region?: string;
      build?: string;
      tunnelName?: string;
      android?: Partial<SauceDevice>;
      ios?: Partial<SauceDevice>;
    };
  };
}

const SAUCE_DEFAULTS: Record<Platform, SauceDevice> = {
  android: { deviceName: 'Google Pixel.*', automationName: 'UiAutomator2' },
  ios: { deviceName: 'iPhone.*', automationName: 'XCUITest' },
};

export function configFile(): string | null {
  if (process.env.GROUNDING_CONFIG) return path.resolve(process.env.GROUNDING_CONFIG);
  const file = path.join(HARNESS_ROOT, 'grounding.config.json');
  return fs.existsSync(file) ? file : null;
}

// Read on every call: small, and tests switch configs between cases.
export function loadConfig(): GroundingConfig {
  const file = configFile();
  let raw: RawConfig = {};
  if (file) {
    if (!fs.existsSync(file)) throw new Error(`GROUNDING_CONFIG points to ${file}, which does not exist`);
    try {
      raw = parseJsonc(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
    }
  }
  const base = file ? path.dirname(file) : HARNESS_ROOT;
  const at = (p: string, from = base) => path.resolve(from, p);
  const root = at(raw.app?.root ?? '.');
  const target = (process.env.GROUNDING_TARGET as RunTarget | undefined) ?? raw.run?.target ?? 'local';
  if (target !== 'local' && target !== 'sauce') throw new Error(`run.target must be "local" or "sauce", not "${target}"`);
  const sauce = raw.run?.sauce ?? {};

  return {
    file,
    app: {
      root,
      sourceDir: at(raw.app?.sourceDir ?? 'src', root),
      exclude: (raw.app?.exclude ?? []).map((p) => at(p, root)),
      aliases: {
        ...tsconfigAliases(root),
        ...Object.fromEntries(Object.entries(raw.app?.aliases ?? {}).map(([prefix, dir]) => [prefix, withSlash(at(dir, root))])),
      },
      ids: {
        ...expoIds(root),
        ...(raw.app?.androidPackage && { android: raw.app.androidPackage }),
        ...(raw.app?.iosBundleId && { ios: raw.app.iosBundleId }),
      },
    },
    features: {
      dir: at(raw.features?.dir ?? 'features'),
      files: { android: raw.features?.android ?? 'android.feature', ios: raw.features?.ios ?? 'ios.feature' },
    },
    testData: at(raw.testData ?? 'test-data/testdata.json'),
    output: at(raw.output ?? 'output'),
    run: {
      target,
      sauce: {
        region: process.env.SAUCE_REGION ?? sauce.region ?? 'us',
        // An empty string in the file means unset, as in the example config.
        build: process.env.SAUCE_BUILD || sauce.build || undefined,
        tunnelName: process.env.SAUCE_TUNNEL_NAME || sauce.tunnelName || undefined,
        devices: Object.fromEntries(PLATFORMS.map((p) => [p, { ...SAUCE_DEFAULTS[p], ...sauce[p] }])) as Record<Platform, SauceDevice>,
      },
    },
  };
}

const withSlash = (dir: string) => (dir.endsWith(path.sep) ? dir : dir + path.sep);

// An Expo app states its ids in app.json; a bare React Native app does not,
// and needs app.androidPackage / app.iosBundleId in the config.
function expoIds(root: string): Partial<Record<Platform, string>> {
  const file = path.join(root, 'app.json');
  if (!fs.existsSync(file)) return {};
  try {
    const { expo } = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
      ...(expo?.android?.package && { android: expo.android.package }),
      ...(expo?.ios?.bundleIdentifier && { ios: expo.ios.bundleIdentifier }),
    };
  } catch {
    return {};
  }
}

// `compilerOptions.paths` from the app's tsconfig.json, as prefix -> dir:
// "@/*": ["src/*"] becomes "@/" -> <root>/src/, "@components": ["src/components"]
// becomes "@components" -> <root>/src/components. Only the first target of
// each is used; `extends` is not followed (add aliases in the config instead).
function tsconfigAliases(root: string): Record<string, string> {
  const file = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(file)) return {};
  let options: { baseUrl?: string; paths?: Record<string, string[]> } | undefined;
  try {
    options = parseJsonc(fs.readFileSync(file, 'utf-8')).compilerOptions;
  } catch {
    return {};
  }
  if (!options?.paths) return {};
  const baseUrl = path.resolve(root, options.baseUrl ?? '.');
  const out: Record<string, string> = {};
  for (const [pattern, targets] of Object.entries(options.paths)) {
    const target = targets[0];
    if (!target) continue;
    if (pattern.endsWith('*') && target.endsWith('*')) {
      out[pattern.slice(0, -1)] = withSlash(path.resolve(baseUrl, target.slice(0, -1)));
    } else if (!pattern.includes('*')) {
      out[pattern] = path.resolve(baseUrl, target);
    }
  }
  return out;
}

// tsconfig.json and the grounding config allow comments and trailing commas.
function parseJsonc(text: string) {
  const stripped = text
    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
}
