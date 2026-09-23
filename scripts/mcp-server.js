// MCP server for the Copilot agents in .github/agents/:
//   ground_selectors                       - "Selector Grounding" agent
//   get_mapping_context, submit_proposals  - "Appium Test Generator" agent
//   get_rule_matches, submit_review        - "Match Critic" agent
//   story_overview, request_approvals,
//   run_on_device, build_report            - "Story Runner" agent (with all of the above)
//   clean_story                            - "Story Cleaner" agent
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

// Where the app is comes from grounding.config.json (generator/config.mts),
// read on each call so a changed config needs no server restart.
const { loadConfig } = require('../generator/config.mts');

const ROOT = path.resolve(__dirname, '..');

// scope src: the configured source directory; repo: the whole app root.
function scan(scope) {
  const { app } = loadConfig();
  return extract(scope === 'repo' ? app.root : app.sourceDir, { aliases: app.aliases, exclude: app.exclude });
}
const appFile = (file) => path.relative(loadConfig().app.root, file);

const VIEWS = {
  summary: null,
  gaps: (f) => f.category === 'missing',
  variants: (f) => f.conditions.length > 0,
  dynamic: (f) => f.category === 'templated-dynamic' || f.category === 'expression-dynamic',
  weak: (f) => f.locatorStrength === 'weak' || f.locatorStrength === 'medium',
  all: () => true,
};

function row(f) {
  const where = `${appFile(f.file)}:${f.line}`;
  const what =
    f.category === 'missing'
      ? `<${f.element}${f.description ? ` "${f.description}"` : ''}>${f.hasSpreadProps ? ' (spread props)' : ''}`
      : `${f.attribute}=${f.value}`;
  return [where, f.category, f.locatorStrength || '-', what, f.conditions.join(' && ') || '-'].join('\t');
}

// Writes the full registry to disk and returns only a short confirmation,
// so the (large) JSON never passes through the model.
function save(scope, output) {
  const { findings, summary } = scan(scope);
  const registry = {
    findings: findings.map((f) => ({ ...f, file: appFile(f.file) })),
    summary,
  };
  const outputRoot = loadConfig().output;
  const outPath = output ? path.resolve(ROOT, output) : path.join(outputRoot, 'registry.json');
  const inside = (dir) => !path.relative(dir, outPath).startsWith('..');
  if (!inside(ROOT) && !inside(outputRoot)) {
    throw new Error(`output must be inside the harness or the output folder: ${output}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n');
  const files = new Set(registry.findings.map((f) => f.file)).size;
  return `Wrote ${path.relative(ROOT, outPath)}: ${findings.length} findings across ${files} files.\n${JSON.stringify(summary)}`;
}

function render(scope, view, screen) {
  const { findings } = scan(scope);
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
      'scope: src (default, the configured source directory) or repo (the whole app). ' +
      'save: write the full JSON registry to `output` and return only a summary.',
    inputSchema: {
      view: z.enum(Object.keys(VIEWS)).default('summary'),
      screen: z.string().optional().describe('Case-insensitive screen name filter, e.g. "Plans"'),
      scope: z.enum(['src', 'repo']).default('src'),
      save: z.boolean().default(false),
      output: z.string().optional().describe('Path relative to the harness root, used when save is true; default <output>/registry.json'),
    },
  },
  async ({ view, screen, scope, save: shouldSave, output }) => ({
    content: [{ type: 'text', text: shouldSave ? save(scope, output) : render(scope, view, screen) }],
  }),
);

// Forms a person answers (approvals, clean confirmation). The MCP default
// request timeout is 60 seconds, which expired while a person was still
// reading an approval form and failed the device run around it; a person gets
// GROUNDING_FORM_TIMEOUT_MS (default 15 minutes). No answer in time comes
// back as action "timeout", never as an error, so callers treat it as "not
// decided" and carry on.
const FORM_TIMEOUT_MS = Number(process.env.GROUNDING_FORM_TIMEOUT_MS) || 15 * 60 * 1000;

async function askPerson(params) {
  try {
    return await server.server.elicitInput(params, { timeout: FORM_TIMEOUT_MS });
  } catch (e) {
    return { action: 'timeout', error: e.message };
  }
}

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
        story: z.string().describe('Story folder name, e.g. "STORY-1"'),
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
            author: 'agent',
            authoredBy: 'copilot-agent',
            // Kept as is: if the mapping changed, its fingerprint no longer
            // matches and the generator treats it as needing re-approval.
            ...(saved[platform][p.step]?.approval && { approval: saved[platform][p.step].approval }),
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
        section(
          'AWAITING HUMAN APPROVAL (used only after a person runs npm run approve):',
          mine.filter((d) => d.proposal.approval && d.proposal.approval !== 'approved').map((d) => `"${d.step}" (${d.proposal.approval})`),
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

// The match critic ("Match Critic" agent): reviews the deterministic rule
// matches for meaning and can only flag them. A flag holds a rule match for
// human approval; the critic cannot approve, change, or remove anything.
async function registerCriticTools() {
  const pipeline = await import('../generator/pipeline.mts');
  const { mappingFingerprint } = await import('../generator/approvals.mts');
  const { PLATFORMS } = await import('../generator/types.mts');

  const text = (t) => ({ content: [{ type: 'text', text: t }] });
  const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

  const ruleMatches = (story, platform) => {
    const { registry, results } = pipeline.decideStory(pipeline.storyDir(story));
    const r = results.find((x) => x.platform === platform);
    return { registry, matches: r.steps.filter((d) => d.proposal.source === 'rules') };
  };

  server.registerTool(
    'get_rule_matches',
    {
      description:
        'The steps of one platform feature that deterministic rules mapped, each with the element it mapped to ' +
        '(type, visible text, screen, render condition). Review them for meaning, then call submit_review.',
      inputSchema: { story: z.string(), platform: z.enum(PLATFORMS) },
    },
    async ({ story, platform }) => {
      try {
        const { registry, matches } = ruleMatches(story, platform);
        const rows = matches.map((d, i) => {
          const p = d.proposal;
          const f = p.locator ? registry.find((x) => x.value === p.locator) : p.gap ? registry.find((x) => `${x.file}:${x.line}${x.option ? ` [${x.option}]` : ''}` === p.gap) : null;
          const target = f
            ? `${f.element}${f.description ? ` "${f.description}"` : ''} on ${f.screen}${f.conditions.length ? ` (shown only when ${f.conditions.join(' && ')})` : ''}`
            : 'platform back navigation';
          const detail = [p.record && `record ${p.record}`, p.text && `value "${p.text}"`, p.gap && 'element has no testID'].filter(Boolean).join(', ');
          return `${i + 1}. "${d.step}" -> ${p.action}${p.intent ? ` (${p.intent})` : ''} ${target}${detail ? `; ${detail}` : ''}`;
        });
        return text(
          `${matches.length} rule matches on ${platform}. Flag a match only when the element does not do what the step means ` +
            `(wrong element, wrong screen, or the step means something the action does not). Do not flag wording or style.\n\n` +
            rows.join('\n'),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'submit_review',
    {
      description:
        'Record your review of one platform\'s rule matches: the steps you flag, each with a one-sentence concern. ' +
        'Submit an empty list if none are doubtful. Flagged matches are held for a person to approve.',
      inputSchema: {
        story: z.string(),
        platform: z.enum(PLATFORMS),
        flags: z.array(z.object({ step: z.string(), concern: z.string() })),
      },
    },
    async ({ story, platform, flags }) => {
      try {
        const dir = pipeline.storyDir(story);
        const { matches } = ruleMatches(story, platform);
        const byStep = new Map(matches.map((d) => [d.step, d]));
        const reviews = pipeline.readReviews(dir);
        const previous = reviews[platform]?.flags ?? {};
        const kept = {};
        const ignored = [];
        for (const f of flags) {
          const d = byStep.get(f.step);
          if (!d) {
            ignored.push(`"${f.step}" (not a rule match on ${platform})`);
            continue;
          }
          const fingerprint = mappingFingerprint(d.proposal);
          // Keep a person's approval of the same flag on the same match.
          const approval = previous[f.step]?.fingerprint === fingerprint ? previous[f.step].approval : undefined;
          kept[f.step] = { concern: f.concern, fingerprint, ...(approval && { approval }) };
        }
        reviews[platform] = { reviewedAt: new Date().toISOString(), reviewedBy: 'copilot-match-critic', ruleMatches: matches.length, flags: kept };
        fs.writeFileSync(pipeline.reviewFile(dir), JSON.stringify(reviews, null, 2) + '\n');
        pipeline.generateStory(dir);
        const lines = [`${platform}: reviewed ${matches.length} rule matches, flagged ${Object.keys(kept).length} for human approval.`];
        if (ignored.length) lines.push('IGNORED:', ...ignored.map((i) => `- ${i}`));
        lines.push(`A person reviews flags with: npm run approve -- ${story} --list`);
        return text(lines.join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );
}

// Whole-story runs for the "Story Runner" agent: the same deterministic
// phases as `npm run story`. Human approvals are asked here, directly of the
// person through a VS Code form (MCP elicitation); the agent never sees or
// answers that form, so it cannot approve anything itself.
async function registerRunTools() {
  const orchestrator = await import('../generator/run/orchestrator.mts');
  const { PLATFORMS } = await import('../generator/types.mts');
  const { execFileSync } = require('child_process');

  const text = (t) => ({ content: [{ type: 'text', text: t }] });
  const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

  // Commentary: streamed as progress while a tool runs, and returned in full.
  const makeIO = (extra) => {
    const said = [];
    let n = 0;
    const token = extra?._meta?.progressToken;
    return {
      said,
      io: {
        say(message) {
          said.push(message);
          if (token !== undefined) {
            extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: ++n, message } }).catch(() => {});
          }
        },
        async approve(items) {
          if (!server.server.getClientCapabilities()?.elicitation) {
            said.push('This client cannot show an approval form; approve in a terminal with: npm run approve -- <story> --list');
            return null;
          }
          let gitName = '';
          try {
            gitName = execFileSync('git', ['config', 'user.name'], { encoding: 'utf-8' }).trim();
          } catch {
            // no git identity
          }
          const properties = { approver: { type: 'string', title: 'Your name (recorded as the approver)', default: gitName } };
          items.forEach((item, i) => {
            properties[`item${i + 1}`] = {
              type: 'boolean',
              title: `[${item.platform}] ${item.kind}: ${item.title}`.slice(0, 200),
              description: item.lines.join(' | ').slice(0, 1000),
              default: false,
            };
          });
          const result = await askPerson({
            message:
              `${items.length} item(s) need your approval before tests use them. Tick what you approve; ` +
              `anything left unticked stays pending. Evidence:\n\n` +
              items.map((it, i) => `${i + 1}. [${it.platform}] ${it.kind}\n   ${it.lines.join('\n   ')}`).join('\n\n'),
            requestedSchema: { type: 'object', properties, required: ['approver'] },
          });
          if (result.action === 'timeout') {
            said.push(`No answer to the approval form within ${Math.round(FORM_TIMEOUT_MS / 60000)} minute(s); these stay pending until approved.`);
            return null;
          }
          if (result.action !== 'accept' || !result.content?.approver) return null;
          return { by: String(result.content.approver), approved: items.filter((_, i) => result.content[`item${i + 1}`] === true) };
        },
      },
    };
  };

  server.registerTool(
    'story_overview',
    {
      description:
        'Start a run for a story: scan the app source, generate tests, and report per platform how steps were mapped, ' +
        'what awaits approval, and what has no mapping yet.',
      inputSchema: { story: z.string().describe('Story folder name, e.g. "STORY-1"') },
    },
    async ({ story }, extra) => {
      try {
        const { said, io } = makeIO(extra);
        orchestrator.startRun(story);
        orchestrator.phaseScan(story, io);
        return text(said.join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'request_approvals',
    {
      description:
        'Ask the person, through a form in VS Code, to approve what awaits human approval (agent/QA mappings, ' +
        'critic-flagged rule matches, validated fallbacks). You do not answer this form; the person does.',
      inputSchema: { story: z.string(), platform: z.enum(PLATFORMS).optional() },
    },
    async ({ story, platform }, extra) => {
      try {
        const { said, io } = makeIO(extra);
        await orchestrator.phaseApprovals(story, io, platform ? [platform] : undefined);
        return text(said.join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'run_on_device',
    {
      description:
        'Run the story for one platform where grounding.config.json says (run.target): locally (boots the ' +
        'simulator/emulator, builds the app if needed) or on Sauce Labs. Validates new fallback locators first ' +
        '(asking the person to approve them), then runs the suite. Takes minutes. Leave target unset unless the person names one.',
      inputSchema: {
        story: z.string(),
        platform: z.enum(PLATFORMS),
        target: z.enum(['local', 'sauce']).optional(),
        rebuild: z.boolean().optional(),
      },
    },
    async ({ story, platform, target, rebuild }, extra) => {
      try {
        const { said, io } = makeIO(extra);
        await orchestrator.phaseDevice(story, platform, io, { rebuild, target });
        return text(said.join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'build_report',
    {
      description: 'Write the HTML report for the current run of a story and return its path.',
      inputSchema: { story: z.string() },
    },
    async ({ story }, extra) => {
      try {
        const { said, io } = makeIO(extra);
        orchestrator.phaseReport(story, io);
        return text(said.join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );
}

// Resetting a story's output for the "Story Cleaner" agent. Deleting also
// removes the story's approvals and validations, so the tool asks the person
// to confirm through a VS Code form; the agent cannot confirm for them.
async function registerCleanTools() {
  const { cleanTarget, describeOutput, removeOutput } = await import('../generator/run/clean-store.mts');

  server.registerTool(
    'clean_story',
    {
      description:
        'Delete everything generated for a story (output/<story>/), or all stories with all=true, after the person ' +
        'confirms in a VS Code form. Includes that story\'s approvals and validations.',
      inputSchema: { story: z.string().optional().describe('Story folder name, e.g. "STORY-1"'), all: z.boolean().optional() },
    },
    async ({ story, all }) => {
      const reply = (t, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError && { isError: true }) });
      try {
        if (!all === !story) return reply('Give a story id, or all=true (not both).', true);
        const target = cleanTarget(all ? null : story);
        const contents = describeOutput(target);
        if (!contents.length) return reply(removeOutput(target));
        if (!server.server.getClientCapabilities()?.elicitation) {
          return reply(`Not cleaned: this client cannot ask you to confirm. Run in a terminal: npm run clean -- ${all ? '--all' : story}`);
        }
        const what = all ? 'every story (all of output/)' : `story ${story} (${path.relative(ROOT, target)}/)`;
        const answer = await askPerson({
          message: `Delete everything generated for ${what}? This includes:\n- ${all ? 'every story\'s mappings, reviews, validations, approvals, and reports' : contents.join('\n- ')}\n\nApprovals and validations are gone for good; the next run asks for them again.`,
          requestedSchema: {
            type: 'object',
            properties: { confirm: { type: 'boolean', title: `Yes, delete ${all ? 'all output' : story}`, default: false } },
            required: ['confirm'],
          },
        });
        if (answer.action === 'timeout') return reply('Not cleaned: no answer to the confirmation form in time.');
        if (answer.action !== 'accept' || answer.content?.confirm !== true) return reply('Not cleaned: you did not confirm.');
        return reply(removeOutput(target));
      } catch (e) {
        return reply(`Error: ${e.message}`, true);
      }
    },
  );
}

registerGenerationTools()
  .then(registerCriticTools)
  .then(registerRunTools)
  .then(registerCleanTools)
  .then(() => server.connect(new StdioServerTransport()));
