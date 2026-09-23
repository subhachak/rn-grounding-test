// AST-based selector extraction. Classifies each locator it finds as
// stable, templated-dynamic, or expression-dynamic, and flags interactive
// elements that have no locator at all as `missing`.
//
// Each finding also carries:
//   conditions      - source text of every condition that gates whether the
//                     element mounts (ternary branch, `&&`, `if` block),
//                     outermost first. Non-empty means the locator only
//                     exists for some personas/data and needs live
//                     validation under each variant.
//   locatorStrength - how reliable the attribute is as a cross-platform
//                     locator: testID (strong) > accessibilityIdentifier
//                     (medium) > accessibilityLabel (weak, it's user-facing
//                     copy that gets localized and reworded).
//
// Usage: node scripts/extract-selectors.js ./src > output/registry.json

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

let results = [];

const LOCATOR_STRENGTH = {
  testID: 'strong',
  accessibilityIdentifier: 'medium',
  accessibilityLabel: 'weak',
};

// Elements a test would interact with, so a missing locator is a real gap.
// Any element with one of the handler props below counts too, which covers
// custom touchables.
const INTERACTIVE_ELEMENTS = new Set([
  'TextInput',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Pressable',
  'Button',
  'Switch',
]);
const INTERACTION_PROPS = new Set([
  'onPress',
  'onLongPress',
  'onChangeText',
  'onValueChange',
  'onSubmitEditing',
]);

// Skipped so a scan from the repo root only sees app source: dependencies,
// native/generated build output, hidden dirs (.git, .expo), and tests, whose
// JSX would otherwise be reported as if it were real UI.
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', 'build', 'dist', 'coverage', 'web-build', '__tests__', 'fixtures']);
const TEST_FILE = /\.(test|spec)\.(jsx?|tsx?)$/;

// Files in a fixed order, so the registry (and everything generated from it)
// is identical on every machine; readdir order differs between filesystems.
function collectFiles(dir, out = []) {
  for (const file of fs.readdirSync(dir).sort()) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(file) && !file.startsWith('.')) collectFiles(fullPath, out);
    } else if (/\.(jsx?|tsx?)$/.test(file) && !TEST_FILE.test(file)) {
      out.push(fullPath);
    }
  }
  return out;
}

function jsxName(nameNode) {
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  if (nameNode.type === 'JSXMemberExpression') {
    return `${jsxName(nameNode.object)}.${nameNode.property.name}`;
  }
  return 'unknown';
}

// Walk up from a JSX element and record every condition that decides
// whether it renders. Stops at function boundaries other than inline
// callbacks, since a component's own props are the outermost gate we can see.
function collectConditions(elementPath, code) {
  const src = (node) => code.slice(node.start, node.end);
  const conditions = [];
  let child = elementPath;
  let parent = elementPath.parentPath;

  while (parent && !parent.isProgram()) {
    const node = parent.node;
    if (parent.isConditionalExpression()) {
      if (child.key === 'consequent') conditions.push(src(node.test));
      if (child.key === 'alternate') conditions.push(`!(${src(node.test)})`);
    } else if (parent.isLogicalExpression() && child.key === 'right') {
      if (node.operator === '&&') conditions.push(src(node.left));
      if (node.operator === '||') conditions.push(`!(${src(node.left)})`);
    } else if (parent.isIfStatement()) {
      if (child.key === 'consequent') conditions.push(src(node.test));
      if (child.key === 'alternate') conditions.push(`!(${src(node.test)})`);
    }
    child = parent;
    parent = parent.parentPath;
  }

  return conditions.reverse();
}

// Human-readable hint for an element with no locator, so a gap report can
// say "the Cancel button" rather than just a line number.
function describeElement(elementNode) {
  for (const attr of elementNode.openingElement.attributes) {
    if (
      attr.type === 'JSXAttribute' &&
      ['placeholder', 'title'].includes(attr.name.name) &&
      attr.value &&
      attr.value.type === 'StringLiteral'
    ) {
      return attr.value.value;
    }
  }
  const stack = [...elementNode.children];
  while (stack.length) {
    const node = stack.shift();
    if (node.type === 'JSXText' && node.value.trim()) return node.value.trim();
    if (node.type === 'JSXElement') stack.unshift(...node.children);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pass 1: parse every file and learn what pass 2 needs to see through:
// constants (testID={IDS.submit}), components that forward a testID to a
// native element (<PrimaryButton testID="x"> is a TouchableOpacity), and
// which package or local file each JSX name is imported from.

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

function parseModule(file) {
  const code = fs.readFileSync(file, 'utf-8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch (e) {
    console.error(`Skipping ${file}: parse error (${e.message})`);
    return null;
  }
  const mod = { file, code, ast, imports: {}, consts: {}, exports: {}, components: {} };
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        const imported =
          spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name;
        mod.imports[spec.local.name] = { source: node.source.value, imported };
      }
    }
    const decl = node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' ? node.declaration : node;
    if (!decl) {
      if (node.type === 'ExportNamedDeclaration') {
        for (const spec of node.specifiers) mod.exports[spec.exported.name] = spec.local.name;
      }
      continue;
    }
    if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (d.id.type !== 'Identifier' || !d.init) continue;
        if (decl.kind === 'const') {
          const value = literalValue(d.init);
          if (value !== undefined) mod.consts[d.id.name] = value;
        }
        if (/^[A-Z]/.test(d.id.name) && /Function/.test(unwrap(d.init).type)) mod.components[d.id.name] = unwrap(d.init);
        if (node.type === 'ExportNamedDeclaration') mod.exports[d.id.name] = d.id.name;
      }
    } else if (decl.type === 'FunctionDeclaration') {
      const name = decl.id ? decl.id.name : path.basename(file).replace(/\.(jsx?|tsx?)$/, '');
      mod.components[name] = decl;
      if (node.type === 'ExportNamedDeclaration') mod.exports[name] = name;
      if (node.type === 'ExportDefaultDeclaration') mod.exports.default = name;
    } else if (node.type === 'ExportDefaultDeclaration' && decl.type === 'Identifier') {
      mod.exports.default = decl.name;
    }
  }
  return mod;
}

function unwrap(node) {
  while (node && (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'TSNonNullExpression')) {
    node = node.expression;
  }
  return node;
}

// A string, or an object of strings (nested), written as literals.
function literalValue(node) {
  node = unwrap(node);
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  if (node.type === 'ObjectExpression') {
    const out = {};
    for (const prop of node.properties) {
      if (prop.type !== 'ObjectProperty' || prop.computed) return undefined;
      const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
      const value = literalValue(prop.value);
      if (value === undefined) return undefined;
      out[key] = value;
    }
    return out;
  }
  return undefined;
}

function resolveImport(mod, localName, modules) {
  const imp = mod.imports[localName];
  if (!imp || !imp.source.startsWith('.')) return null;
  const base = path.resolve(path.dirname(mod.file), imp.source);
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => path.join(base, 'index' + e))];
  const target = candidates.map((c) => modules.get(c)).find(Boolean);
  if (!target) return null;
  return { target, name: imp.imported === 'default' ? target.exports.default : target.exports[imp.imported] ?? imp.imported };
}

// The literal value of a constant reference (SUBMIT_ID, IDS.login.submit),
// following local imports; undefined if any part is not a literal.
function resolveConstant(expr, mod, modules, depth = 0) {
  expr = unwrap(expr);
  if (!expr || depth > 5) return undefined;
  if (expr.type === 'StringLiteral') return expr.value;
  if (expr.type === 'Identifier') {
    if (expr.name in mod.consts) return mod.consts[expr.name];
    const r = resolveImport(mod, expr.name, modules);
    return r && r.name in r.target.consts ? r.target.consts[r.name] : undefined;
  }
  if (expr.type === 'MemberExpression') {
    const obj = resolveConstant(expr.object, mod, modules, depth + 1);
    const key = expr.computed ? (expr.property.type === 'StringLiteral' ? expr.property.value : undefined) : expr.property.name;
    return obj && typeof obj === 'object' && key !== undefined ? obj[key] : undefined;
  }
  return undefined;
}

// The component a JSX name refers to, in this file or a local import.
function componentFor(name, mod, modules) {
  if (name.includes('.')) return null;
  if (mod.components[name]) return { mod, name };
  const r = resolveImport(mod, name, modules);
  return r && r.target.components[r.name] ? { mod: r.target, name: r.name } : null;
}

// Props of a component that carry locator attributes: `testID` (destructured)
// or `props.testID`. Returns local name -> attribute.
function locatorParams(fn) {
  const param = fn.params && fn.params[0];
  const out = { destructured: {}, propsName: null };
  if (!param) return out;
  if (param.type === 'ObjectPattern') {
    for (const prop of param.properties) {
      if (prop.type !== 'ObjectProperty') continue;
      const key = prop.key.name;
      const local = prop.value.type === 'Identifier' ? prop.value.name : prop.value.left && prop.value.left.name;
      if (key in LOCATOR_STRENGTH && local) out.destructured[local] = key;
    }
  } else if (param.type === 'Identifier') {
    out.propsName = param.name;
  }
  return out;
}

// The forwarded attribute when `value` just passes the component's own
// locator prop through, e.g. testID={testID} or testID={props.testID}.
function forwardedProp(value, params) {
  const e = unwrap(value);
  if (!e) return null;
  if (e.type === 'Identifier' && params.destructured[e.name]) return params.destructured[e.name];
  if (e.type === 'MemberExpression' && !e.computed && e.object.type === 'Identifier' && e.object.name === params.propsName) {
    return e.property.name in LOCATOR_STRENGTH ? e.property.name : null;
  }
  return null;
}

// Wrapper catalog: "file#Component" -> the native element its forwarded
// testID lands on, resolved through nested wrappers.
function buildWrappers(modules) {
  const direct = new Map();
  for (const mod of modules.values()) {
    for (const [name, fn] of Object.entries(mod.components)) {
      const params = locatorParams(fn);
      traverse(fn, {
        noScope: true,
        JSXOpeningElement(p) {
          for (const attr of p.node.attributes) {
            if (attr.type !== 'JSXAttribute' || !(attr.name.name in LOCATOR_STRENGTH)) continue;
            if (attr.value && attr.value.type === 'JSXExpressionContainer' && forwardedProp(attr.value.expression, params)) {
              direct.set(`${mod.file}#${name}`, { element: jsxName(p.node.name), mod });
            }
          }
        },
      });
    }
  }
  const resolved = new Map();
  for (const key of direct.keys()) {
    let seen = new Set();
    let cur = direct.get(key);
    while (cur && !seen.has(cur.element)) {
      seen.add(cur.element);
      const inner = componentFor(cur.element, cur.mod, modules);
      const next = inner && direct.get(`${inner.mod.file}#${inner.name}`);
      if (!next) break;
      cur = next;
    }
    resolved.set(key, cur.element);
  }
  return resolved;
}

// The top-level component a JSX element sits in, which is the "screen" its
// locators belong to (several components can share a file).
function enclosingComponent(elementPath, mod) {
  let fnPath = null;
  for (let p = elementPath.parentPath; p; p = p.parentPath) if (p.isFunction()) fnPath = p;
  if (!fnPath) return path.basename(mod.file).replace(/\.(jsx?|tsx?)$/, '');
  const node = fnPath.node;
  for (const [name, fn] of Object.entries(mod.components)) if (fn === node) return name;
  if (node.id) return node.id.name;
  const parent = fnPath.parentPath && fnPath.parentPath.node;
  if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  return path.basename(mod.file).replace(/\.(jsx?|tsx?)$/, '');
}

// ---------------------------------------------------------------------------
// Pass 2: locators and gaps.

function extractFromModule(mod, modules, wrappers) {
  const { code, ast } = mod;

  traverse(ast, {
    JSXElement(elementPath) {
      const opening = elementPath.node.openingElement;
      const written = jsxName(opening.name);
      const importSource = mod.imports[written.split('.')[0]] && mod.imports[written.split('.')[0]].source;
      const vendor = importSource && importSource !== 'react-native' && !importSource.startsWith('.') ? { module: importSource } : {};
      // A local wrapper is recorded as the native element it renders, so
      // interaction checks (tap, type) apply to what is really on screen.
      const wrapper = componentFor(written, mod, modules);
      const native = wrapper && wrappers.get(`${wrapper.mod.file}#${wrapper.name}`);
      const elementName = native || written;
      const via = native ? { component: written } : {};
      const screenName = enclosingComponent(elementPath, mod);
      const ownFn = elementPath.getFunctionParent();
      const params = ownFn ? locatorParams(ownFn.node) : { destructured: {}, propsName: null };
      const conditions = collectConditions(elementPath, code);
      let hasLocator = false;
      let hasSpreadProps = false;
      let hasInteractionProp = false;

      for (const attr of opening.attributes) {
        if (attr.type === 'JSXSpreadAttribute') {
          hasSpreadProps = true;
          continue;
        }
        const name = attr.name.name;
        if (INTERACTION_PROPS.has(name)) hasInteractionProp = true;
        if (!(name in LOCATOR_STRENGTH)) continue;

        let value = null;
        let category = null;
        let resolvedFrom = null;
        if (attr.value && attr.value.type === 'StringLiteral') {
          value = attr.value.value;
          category = 'stable';
        } else if (attr.value && attr.value.type === 'JSXExpressionContainer') {
          const expr = attr.value.expression;
          // Inside a wrapper, testID={testID} is the pass-through itself: the
          // real locator is wherever the wrapper is used, not here.
          if (forwardedProp(expr, params)) {
            hasLocator = true;
            continue;
          }
          const constant = resolveConstant(expr, mod, modules);
          if (typeof constant === 'string') {
            value = constant;
            category = 'stable';
            resolvedFrom = code.slice(expr.start, expr.end);
          } else if (unwrap(expr).type === 'TemplateLiteral') {
            // Inline the constant parts; runtime parts stay placeholders.
            const tpl = unwrap(expr);
            let text = '';
            let dynamic = false;
            tpl.quasis.forEach((q, i) => {
              text += q.value.raw;
              if (i < tpl.expressions.length) {
                const part = resolveConstant(tpl.expressions[i], mod, modules);
                if (typeof part === 'string') text += part;
                else {
                  dynamic = true;
                  text += '${' + code.slice(tpl.expressions[i].start, tpl.expressions[i].end) + '}';
                }
              }
            });
            if (dynamic) {
              value = '{`' + text + '`}';
              category = 'templated-dynamic';
              if (text !== code.slice(tpl.start + 1, tpl.end - 1)) resolvedFrom = code.slice(expr.start, expr.end);
            } else {
              value = text;
              category = 'stable';
              resolvedFrom = code.slice(expr.start, expr.end);
            }
          } else {
            value = code.slice(attr.value.start, attr.value.end);
            category = 'expression-dynamic';
          }
        }
        if (!category) continue;

        hasLocator = true;
        results.push({
          screen: screenName,
          element: elementName,
          attribute: name,
          category,
          value,
          locatorStrength: LOCATOR_STRENGTH[name],
          conditions,
          // containers would report their first child's text, which says
          // nothing about the container itself
          description: /View$/.test(elementName) ? null : describeElement(elementPath.node),
          ...vendor,
          ...via,
          ...(resolvedFrom && { resolvedFrom }),
          file: mod.file,
          line: attr.loc.start.line,
        });
      }

      const isInteractive = INTERACTIVE_ELEMENTS.has(elementName) || hasInteractionProp;
      if (isInteractive && !hasLocator) {
        results.push({
          screen: screenName,
          element: elementName,
          attribute: null,
          category: 'missing',
          value: null,
          locatorStrength: null,
          conditions,
          description: describeElement(elementPath.node),
          ...via,
          // a spread (`{...props}`) could be passing a testID we can't see
          ...(hasSpreadProps && { hasSpreadProps: true }),
          file: mod.file,
          line: opening.loc.start.line,
        });
      }
    },
  });
}

function summarize(findings) {
  const summary = {
    stable: 0,
    'templated-dynamic': 0,
    'expression-dynamic': 0,
    missing: 0,
    conditional: 0,
    locatorStrength: { strong: 0, medium: 0, weak: 0 },
  };
  for (const r of findings) {
    summary[r.category] = (summary[r.category] || 0) + 1;
    if (r.conditions.length) summary.conditional += 1;
    if (r.locatorStrength) summary.locatorStrength[r.locatorStrength] += 1;
  }
  return summary;
}

function extract(srcDir) {
  results = [];
  const modules = new Map();
  for (const file of collectFiles(srcDir)) {
    const mod = parseModule(file);
    if (mod) modules.set(file, mod);
  }
  const wrappers = buildWrappers(modules);
  for (const mod of modules.values()) extractFromModule(mod, modules, wrappers);
  return { findings: results, summary: summarize(results) };
}

module.exports = { extract, summarize };

if (require.main === module) {
  console.log(JSON.stringify(extract(process.argv[2] || './src'), null, 2));
}
