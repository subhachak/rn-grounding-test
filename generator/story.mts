// Run a whole story from the terminal, with commentary, pausing for human
// approvals, and an HTML report at the end.
//
//   npm run story -- STORY-1 [--platform ios|android] [--no-devices] [--rebuild]
//
// Approvals are asked here, item by item with the evidence; without a
// terminal (e.g. CI) nothing is approved and those steps stay pending.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { ROOT } from './pipeline.mts';
import { runStory, type RunIO } from './run/orchestrator.mts';
import type { Platform } from './types.mts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    platform: { type: 'string' },
    'no-devices': { type: 'boolean', default: false },
    rebuild: { type: 'boolean', default: false },
  },
});
if (positionals.length !== 1) {
  console.error('usage: npm run story -- <story> [--platform ios|android] [--no-devices] [--rebuild]');
  process.exit(1);
}

const time = () => new Date().toTimeString().slice(0, 8);

const io: RunIO = {
  say: (message) => console.log(`${time()}  ${message}`),
  async approve(items) {
    if (!process.stdin.isTTY) {
      console.log(`${time()}  No terminal to ask; leaving ${items.length} item(s) pending.`);
      return null;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      let gitName = '';
      try {
        gitName = execFileSync('git', ['config', 'user.name'], { encoding: 'utf-8' }).trim();
      } catch {
        // no git identity; ask
      }
      const by = (await rl.question(`\nWho is approving?${gitName ? ` [${gitName}]` : ''} `)).trim() || gitName;
      if (!by) return null;
      const approved = [];
      for (const [i, item] of items.entries()) {
        console.log(`\n(${i + 1}/${items.length}) [${item.platform}] ${item.kind}\n  ${item.lines.join('\n  ')}`);
        const answer = (await rl.question('Approve? [y]es / [n]o / [a]ll remaining / [s]kip the rest: ')).trim().toLowerCase();
        if (answer === 'a') {
          approved.push(...items.slice(i));
          break;
        }
        if (answer === 's') break;
        if (answer === 'y' || answer === 'yes') approved.push(item);
      }
      return { by, approved };
    } finally {
      rl.close();
    }
  },
};

const file = await runStory(path.basename(positionals[0]), io, {
  platforms: values.platform ? [values.platform as Platform] : undefined,
  devices: !values['no-devices'],
  rebuild: values.rebuild,
});
console.log(`\nOpen the report: ${path.relative(ROOT, file)}`);
