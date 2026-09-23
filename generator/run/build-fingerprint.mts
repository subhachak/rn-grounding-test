// Whether a local app build still matches the app source. Tests are
// generated from the current src/, so running them on a build of older
// source would report stale-build failures as locator failures. Each build
// records the fingerprint of what it was built from; a run compares it with
// the current source and rebuilds when they differ.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// What goes into the JS bundle, and what shapes the native project (which
// needs `expo prebuild` again when it changes).
const BUNDLE_INPUTS = ['src', 'App.tsx', 'index.js', 'index.ts', 'babel.config.js', 'metro.config.js'];
const NATIVE_INPUTS = ['app.json', 'app.config.js', 'app.config.ts', 'package.json', 'package-lock.json'];

function files(root: string, entry: string): string[] {
  const full = path.join(root, entry);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [entry];
  return fs
    .readdirSync(full)
    .sort()
    .filter((f) => !f.startsWith('.') && f !== 'node_modules')
    .flatMap((f) => files(root, path.join(entry, f)));
}

function hash(root: string, entries: string[]): string {
  const h = createHash('sha256');
  // Sorted paths and their contents: the same source always hashes the same,
  // wherever the repo is checked out.
  for (const file of entries.flatMap((e) => files(root, e)).sort()) {
    h.update(file.split(path.sep).join('/')).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

export interface BuildFingerprint {
  bundle: string; // app JS/TS source
  native: string; // app config and dependencies
}

export function sourceFingerprint(root: string): BuildFingerprint {
  return { bundle: hash(root, BUNDLE_INPUTS), native: hash(root, NATIVE_INPUTS) };
}

export interface BuildStamp extends BuildFingerprint {
  builtAt: string;
}

export function readStamp(file: string): BuildStamp | null {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null;
}

export function writeStamp(file: string, fp: BuildFingerprint): BuildStamp {
  const stamp = { ...fp, builtAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stamp, null, 2) + '\n');
  return stamp;
}

// Why a build must be redone, or null when it is current.
export function staleReason(stamp: BuildStamp | null, current: BuildFingerprint): string | null {
  if (!stamp) return 'no record of what the existing build was made from';
  if (stamp.native !== current.native) return 'app config or dependencies changed since the last build';
  if (stamp.bundle !== current.bundle) return 'app source changed since the last build';
  return null;
}
