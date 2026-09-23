import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ROOT } from '../paths.mts';
import { useTempOutput } from './helpers.mts';

// A VS Code stand-in whose person never answers the form.
async function silentClient(out: string) {
  const client = new Client({ name: 'vscode-sim', version: '1' }, { capabilities: { elicitation: {} } });
  client.setRequestHandler(ElicitRequestSchema, () => new Promise(() => {}));
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(ROOT, 'scripts/mcp-server.js')],
      env: { ...process.env, GROUNDING_OUTPUT: out, GROUNDING_FORM_TIMEOUT_MS: '500' } as Record<string, string>,
    }),
  );
  return client;
}

test('an approval form nobody answers leaves items pending instead of failing', async () => {
  const out = useTempOutput();
  const file = path.join(out, 'STORY-101', 'proposals.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ios: { 'I open the contribution form': {
    action: 'tap', locator: 'dashboard-contribute-button', record: null, text: null, gap: null, rationale: 'r', author: 'agent', authoredBy: 'copilot-agent',
  } } }, null, 2));
  const before = fs.readFileSync(file, 'utf-8');

  const client = await silentClient(out);
  try {
    const res = await client.callTool({ name: 'request_approvals', arguments: { story: 'STORY-101', platform: 'ios' } });
    const text = (res.content as { text: string }[])[0].text;
    assert.equal(res.isError, undefined);
    assert.match(text, /No answer to the approval form/);
    assert.match(text, /stay pending/);
    assert.equal(fs.readFileSync(file, 'utf-8'), before);
  } finally {
    await client.close();
  }
});

test('a clean confirmation nobody answers deletes nothing', async () => {
  const out = useTempOutput();
  const story = path.join(out, 'STORY-X');
  fs.mkdirSync(story, { recursive: true });
  fs.writeFileSync(path.join(story, 'proposals.json'), '{}');
  const client = await silentClient(out);
  try {
    const res = await client.callTool({ name: 'clean_story', arguments: { story: 'STORY-X' } });
    assert.match((res.content as { text: string }[])[0].text, /no answer/);
    assert.ok(fs.existsSync(story));
  } finally {
    await client.close();
  }
});
