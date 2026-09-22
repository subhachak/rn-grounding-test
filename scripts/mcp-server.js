// MCP server for the Copilot agents in .github/agents/:
//   ground_selectors                       - "Selector Grounding" agent
//   get_mapping_context, submit_proposals  - "Appium Test Generator" agent
//
// Output is deliberately compact, tab-separated rows filtered by `view`,
// instead of the full JSON registry: every token returned here is billed as
// model input, so the agent asks for only the slice it needs. With
// `save: true` the full registry goes to a file instead of back to the model.
//
// Registered in .vscode/mcp.json; run standalone with:
//   node scripts/mcp-server.js

const fs = require('fs');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { extract } = require('./extract-selectors');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = { src: path.join(ROOT, 'src'), repo: ROOT };

const VIEWS = {
  summary: null,
  gaps: (f) => f.category === 'missing',
  variants: (f) => f.conditions.length > 0,
  dynamic: (f) => f.category === 'templated-dynamic' || f.category === 'expression-dynamic',
  weak: (f) => f.locatorStrength === 'weak' || f.locatorStrength === 'medium',
  all: () => true,
};

function row(f) {
  const where = `${path.relative(ROOT, f.file)}:${f.line}`;
  const what =
    f.category === 'missing'
      ? `<${f.element}${f.description ? ` "${f.description}"` : ''}>${f.hasSpreadProps ? ' (spread props)' : ''}`
      : `${f.attribute}=${f.value}`;
  return [where, f.category, f.locatorStrength || '-', what, f.conditions.join(' && ') || '-'].join('\t');
}

// Writes the full registry to disk and returns only a short confirmation,
// so the (large) JSON never passes through the model.
function save(scope, output) {
  const { findings, summary } = extract(SCAN_DIRS[scope]);
  const registry = {
    findings: findings.map((f) => ({ ...f, file: path.relative(ROOT, f.file) })),
    summary,
  };
  const outPath = path.resolve(ROOT, output);
  if (path.relative(ROOT, outPath).startsWith('..')) {
    throw new Error(`output must be inside the repo: ${output}`);
  }
  fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n');
  const files = new Set(registry.findings.map((f) => f.file)).size;
  return `Wrote ${path.relative(ROOT, outPath)}: ${findings.length} findings across ${files} files.\n${JSON.stringify(summary)}`;
}

function render(scope, view, screen) {
  const { findings } = extract(SCAN_DIRS[scope]);
  const scoped = screen
    ? findings.filter((f) => f.screen.toLowerCase().includes(screen.toLowerCase()))
    : findings;

  if (view === 'summary') {
    const byScreen = {};
    for (const f of scoped) {
      const s = (byScreen[f.screen] ||= { locators: 0, missing: 0, conditional: 0, weak: 0 });
      if (f.category === 'missing') s.missing += 1;
      else s.locators += 1;
      if (f.conditions.length) s.conditional += 1;
      if (f.locatorStrength === 'weak') s.weak += 1;
    }
    const lines = ['screen\tlocators\tmissing\tconditional\tweak'];
    for (const [name, s] of Object.entries(byScreen)) {
      lines.push([name, s.locators, s.missing, s.conditional, s.weak].join('\t'));
    }
    return lines.join('\n');
  }

  const rows = scoped.filter(VIEWS[view]);
  if (!rows.length) return `No ${view} findings${screen ? ` for "${screen}"` : ''}.`;
  return ['location\tcategory\tstrength\tlocator\tconditions', ...rows.map(row)].join('\n');
}

const server = new McpServer({ name: 'selector-grounding', version: '1.0.0' });

server.registerTool(
  'ground_selectors',
  {
    description:
      'Deterministic AST scan of the RN source for testID/accessibilityLabel locators. ' +
      'view: summary (per-screen counts), gaps (interactive elements with no locator), ' +
      'variants (locators gated by a condition), dynamic (templated/expression IDs), ' +
      'weak (accessibilityLabel/Identifier only), all (every finding). ' +
      'scope: src (default) or repo (whole codebase). ' +
      'save: write the full JSON registry to `output` and return only a summary.',
    inputSchema: {
      view: z.enum(Object.keys(VIEWS)).default('summary'),
      screen: z.string().optional().describe('Case-insensitive screen name filter, e.g. "PlanList"'),
      scope: z.enum(['src', 'repo']).default('src'),
      save: z.boolean().default(false),
      output: z.string().default('registry.json').describe('Path relative to the repo root, used when save is true'),
    },
  },
  async ({ view, screen, scope, save: shouldSave, output }) => ({
    content: [{ type: 'text', text: shouldSave ? save(scope, output) : render(scope, view, screen) }],
  }),
);

// Appium test generation for the Copilot "Appium Test Generator" agent.
// Steps are mapped by deterministic rules first; the agent is only ever shown
// the steps the rules could not map, and only proposes for those.
// submit_proposals runs the same gate and codegen as `npm run generate`, and
// its verdict is the only one that counts.
async function registerGenerationTools() {
  const pipeline = await import('../generator/pipeline.mts');
  const { MAPPING_RULES, renderContext } = await import('../generator/mapper/context.mts');
  const { ACTIONS, PLATFORMS } = await import('../generator/types.mts');
  const { summarize } = await import('../generator/report.mts');

  const text = (t) => ({ content: [{ type: 'text', text: t }] });
  const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

  server.registerTool(
    'get_mapping_context',
    {
      description:
        'For a story under features/<story>/, the steps of one platform feature that deterministic rules could not ' +
        'map, plus the mapping rules and the registry evidence to map them. Returns "nothing to map" when rules ' +
        'covered every step.',
      inputSchema: {
        story: z.string().describe('Story folder name, e.g. "STORY-101"'),
        platform: z.enum(PLATFORMS),
      },
    },
    async ({ story, platform }) => {
      try {
        const input = pipeline.mappingInput(pipeline.storyDir(story), platform);
        const pending = pipeline.agentSteps(input);
        const steps = Object.keys(pending);
        if (!steps.length) return text(`Nothing to map: rules mapped all ${input.steps.length} ${platform} steps.`);
        return text(
          `${steps.length} of ${input.steps.length} ${platform} steps need a proposal.\n\n${MAPPING_RULES}\n\n` +
            renderContext({ ...input, steps }, pending),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  // Optional fields rather than required-nullable: weaker models omit null
  // fields more often than they send them, and omission means null here.
  const opt = () => z.string().nullable().optional();
  server.registerTool(
    'submit_proposals',
    {
      description:
        'Submit proposals for the steps get_mapping_context listed. Saves them to features/<story>/proposals.json, ' +
        'runs the grounding gate and code generation, and returns the verdicts. Resubmit only rejected steps.',
      inputSchema: {
        story: z.string(),
        platform: z.enum(PLATFORMS),
        proposals: z.array(
          z.object({
            step: z.string().describe('Step text exactly as listed in STEPS'),
            action: z.enum(ACTIONS),
            locator: opt(),
            record: opt(),
            text: opt(),
            gap: opt(),
            intent: z.enum(['tap', 'type', 'assertVisible', 'assertNotVisible']).nullable().optional(),
            rationale: z.string().optional(),
          }),
        ),
      },
    },
    async ({ story, platform, proposals }) => {
      try {
        const dir = pipeline.storyDir(story);
        const input = pipeline.mappingInput(dir, platform);
        const pending = new Set(Object.keys(pipeline.agentSteps(input)));
        const all = new Set(input.steps);
        const ignored = proposals
          .filter((p) => !pending.has(p.step))
          .map((p) => `"${p.step}" (${all.has(p.step) ? 'already mapped by rules' : 'not in the feature'})`);

        // Merge by step so a resubmission of only the rejected steps keeps the
        // accepted ones. Proposals for rule-mapped steps are never stored.
        const file = pipeline.proposalsFile(dir);
        const saved = pipeline.readAgentProposals(dir);
        saved[platform] ??= {};
        // A QA engineer's manual mapping ("author": "human") is never
        // overwritten by the agent.
        const human = proposals.filter((p) => pending.has(p.step) && saved[platform][p.step]?.author === 'human');
        ignored.push(...human.map((p) => `"${p.step}" (kept the QA engineer's mapping)`));
        for (const p of proposals.filter((p) => pending.has(p.step) && saved[platform][p.step]?.author !== 'human')) {
          saved[platform][p.step] = {
            action: p.action,
            locator: p.locator ?? null,
            record: p.record ?? null,
            text: p.text ?? null,
            gap: p.gap ?? null,
            intent: p.intent ?? null,
            rationale: p.rationale ?? '',
          };
        }
        fs.writeFileSync(file, JSON.stringify(saved, null, 2) + '\n');

        const run = pipeline.generateStory(dir);
        const r = run.results.find((x) => x.platform === platform);
        const s = summarize(r);
        const mine = r.steps.filter((d) => d.proposal.source !== 'rules');
        const lines = [
          `${platform}: ${s.accepted}/${s.steps} grounded (${s.byRules} by rules, ${s.byAgent} by you), ` +
            `${s.ungrounded} gaps, ${s.awaitingAgent} still unproposed, ${s.rejected} rejected, ${s.scenarioErrors} scenario errors`,
        ];
        const section = (title, items) => items.length && lines.push(title, ...items.map((i) => `- ${i}`));
        section(
          'REJECTED (fix and resubmit only these):',
          mine.filter((d) => d.verdict === 'rejected').map((d) => `"${d.step}": ${d.errors.map((e) => `${e.rule} ${e.message}`).join('; ')}`),
        );
        section(
          'SCENARIO ERRORS (G5, fix the proposal or report a spec/test-data problem):',
          r.scenarios.flatMap((sc) => sc.errors.map((e) => `${sc.scenario} / "${e.step}": ${e.message}`)),
        );
        section('IGNORED:', ignored);
        section('STILL UNPROPOSED:', mine.filter((d) => d.proposal.source === 'none').map((d) => `"${d.step}"`));
        section(
          'GAPS (all sources):',
          r.steps.filter((d) => d.verdict === 'ungrounded' && d.proposal.source !== 'none').map(
            (d) => `"${d.step}": ${d.proposal.gap ? `testability gap at ${d.proposal.gap}` : 'no source evidence'}`,
          ),
        );
        section('WARNINGS:', r.steps.flatMap((d) => d.warnings.map((w) => `"${d.step}": ${w.rule} ${w.message}`)));
        lines.push(`Wrote ${path.relative(ROOT, run.outDir)}/ (report: grounding-report.md)`);
        return text(lines.join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );
}

registerGenerationTools().then(() => server.connect(new StdioServerTransport()));
