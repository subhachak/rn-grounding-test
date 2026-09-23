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
//   navigatesTo     - for a tappable element, the screen component a tap
//                     certainly navigates to (from its handler and the
//                     navigator's routes); absent when unknown or conditional.
//   locatorStrength - how reliable the attribute is as a cross-platform
//                     locator: testID (strong) > accessibilityIdentifier
//                     (medium) > accessibilityLabel (weak, it's user-facing
//                     copy that gets localized and reworded).
//
// Usage: node scripts/extract-selectors.js [dir] [--save]   (npm run ground / ground:save)

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

let results = [];
// Import prefix -> absolute directory ("@/" -> /app/src/), set per extract().
let aliases = {};

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
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', 'build', 'dist', 'coverage', 'web-build', '__tests__', '__mocks__', 'e2e', 'fixtures']);
// Tests, Storybook stories, and type declarations are not rendered UI.
const TEST_FILE = /(\.(test|spec|stories)\.(jsx?|tsx?)|\.d\.ts)$/;
// Absolute paths the caller excludes (the config's app.exclude), set per extract().
let excluded = [];

// Files in a fixed order, so the registry (and everything generated from it)
// is identical on every machine; readdir order differs between filesystems.
function collectFiles(dir, out = []) {
  for (const file of fs.readdirSync(dir).sort()) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(file) && !file.startsWith('.') && !excluded.includes(path.resolve(fullPath))) collectFiles(fullPath, out);
    } else if (/\.(jsx?|tsx?)$/.test(file) && !TEST_FILE.test(file) && !excluded.includes(path.resolve(fullPath))) {
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
  const mod = { file, code, ast, imports: {}, consts: {}, exports: {}, components: {}, reexports: [] };
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        const imported =
          spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name;
        mod.imports[spec.local.name] = { source: node.source.value, imported };
      }
    }
    // Barrel files: export { Button } from './Button', export * from './Card'.
    if (node.type === 'ExportAllDeclaration') {
      mod.reexports.push({ source: node.source.value, all: true });
      continue;
    }
    if (node.type === 'ExportNamedDeclaration' && node.source) {
      for (const spec of node.specifiers) {
        const local = spec.type === 'ExportNamespaceSpecifier' ? '*' : spec.local.name;
        const exported = spec.exported.type === 'StringLiteral' ? spec.exported.value : spec.exported.name;
        mod.reexports.push({ source: node.source.value, local, exported });
      }
      continue;
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

// The absolute path an import source points into, for relative imports and
// configured aliases (tsconfig paths); null for packages.
function sourceBase(fromFile, source) {
  if (source.startsWith('.')) return path.resolve(path.dirname(fromFile), source);
  const prefix = Object.keys(aliases)
    .filter((a) => source === a || source.startsWith(a.endsWith('/') || a.endsWith(path.sep) ? a : a + '/'))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix === undefined) return null;
  return path.join(aliases[prefix], source.slice(prefix.length));
}

const isLocalSource = (fromFile, source) => sourceBase(fromFile, source) !== null;

function moduleAt(fromFile, source, modules) {
  const base = sourceBase(fromFile, source);
  if (!base) return null;
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => path.join(base, 'index' + e))];
  return candidates.map((c) => modules.get(c)).find(Boolean) || null;
}

// Where an exported name is actually declared, following barrel re-exports.
function resolveExport(target, exported, modules, depth = 0) {
  if (!target || depth > 10) return null;
  if (exported in target.exports) return { target, name: target.exports[exported] };
  for (const r of target.reexports) {
    if (r.all) {
      if (exported === 'default') continue;
      const found = resolveExport(moduleAt(target.file, r.source, modules), exported, modules, depth + 1);
      if (found) return found;
    } else if (r.exported === exported && r.local !== '*') {
      return resolveExport(moduleAt(target.file, r.source, modules), r.local, modules, depth + 1);
    }
  }
  return null;
}

function resolveImport(mod, localName, modules) {
  const imp = mod.imports[localName];
  if (!imp || imp.imported === '*') return null;
  const target = moduleAt(mod.file, imp.source, modules);
  if (!target) return null;
  return resolveExport(target, imp.imported, modules) || { target, name: imp.imported };
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

// ---------------------------------------------------------------------------
// Navigation: where a tap goes, so step matching knows the screen after it.
// Only certain navigation counts: a handler whose top level calls
// navigation.navigate/push/replace/reset('Route') with no earlier `if` or
// `return` that could skip it. Conditional or indirect navigation, and back,
// leave the target unknown rather than guessed.

const NAV_METHODS = new Set(['navigate', 'push', 'replace', 'reset']);
// Navigator registrations: <Stack.Screen name="Plans" component={PlansScreen} />
// and each navigator's initial route, collected per extract().
let routeDefs = [];
let navigatorDefs = [];

function routeOfCall(call, code) {
  // navigation.navigate(...) or navigation.getParent()?.reset(...)
  if (call.type !== 'CallExpression' && call.type !== 'OptionalCallExpression') return undefined;
  const callee = call.callee;
  if (!callee || (callee.type !== 'MemberExpression' && callee.type !== 'OptionalMemberExpression')) return undefined;
  if (callee.property.type !== 'Identifier' || !NAV_METHODS.has(callee.property.name)) return undefined;
  if (!/^navigation\b/.test(code.slice(callee.object.start, callee.object.end))) return undefined;
  const arg = call.arguments[0];
  if (!arg) return null;
  if (callee.property.name !== 'reset') return arg.type === 'StringLiteral' ? arg.value : null;
  // reset({ index, routes: [{ name: 'Main' }] }): the route at index (default 0)
  if (arg.type !== 'ObjectExpression') return null;
  const prop = (name) => arg.properties.find((p) => p.type === 'ObjectProperty' && p.key.name === name);
  const routes = prop('routes');
  const index = prop('index');
  const i = index && index.value.type === 'NumericLiteral' ? index.value.value : 0;
  const route = routes && routes.value.type === 'ArrayExpression' && routes.value.elements[i];
  const name = route && route.type === 'ObjectExpression' && route.properties.find((p) => p.type === 'ObjectProperty' && p.key.name === 'name');
  return name && name.value.type === 'StringLiteral' ? name.value.value : null;
}

// The route a handler certainly navigates to, or null.
function handlerRoute(fn, code) {
  if (!fn || !/Function/.test(fn.type)) return null;
  if (fn.body.type !== 'BlockStatement') return routeOfCall(fn.body, code) || null;
  for (const stmt of fn.body.body) {
    if (stmt.type === 'IfStatement' || stmt.type === 'ReturnStatement' || stmt.type === 'SwitchStatement' || stmt.type === 'TryStatement') return null;
    if (stmt.type !== 'ExpressionStatement') continue;
    const route = routeOfCall(stmt.expression, code);
    if (route !== undefined) return route;
  }
  return null;
}

// The route an element's handlers (onPress, or a wrapper's onAction) certainly
// navigate to: exactly one distinct target among them.
function navigationTarget(opening, elementPath, code) {
  const targets = new Set();
  for (const attr of opening.attributes) {
    if (attr.type !== 'JSXAttribute' || !/^on[A-Z]/.test(attr.name.name) || !attr.value || attr.value.type !== 'JSXExpressionContainer') continue;
    let fn = attr.value.expression;
    if (fn.type === 'Identifier') {
      const binding = elementPath.scope.getBinding(fn.name);
      const node = binding && binding.path.node;
      fn = node && (node.type === 'VariableDeclarator' ? node.init : node);
    }
    const route = handlerRoute(fn, code);
    if (route) targets.add(route);
  }
  return targets.size === 1 ? [...targets][0] : null;
}

function recordRoutes(opening, elementPath, written, mod, modules) {
  const attr = (name) => opening.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name);
  if (/\.Screen$/.test(written)) {
    const name = attr('name');
    const component = attr('component');
    if (!name || !name.value || name.value.type !== 'StringLiteral' || !component || component.value.type !== 'JSXExpressionContainer') return;
    const expr = component.value.expression;
    if (expr.type !== 'Identifier') return;
    const target = componentFor(expr.name, mod, modules);
    routeDefs.push({ route: name.value.value, component: target ? target.name : expr.name });
  } else if (/\.Navigator$/.test(written)) {
    const initial = attr('initialRouteName');
    const first = elementPath.node.children.find((c) => c.type === 'JSXElement' && /\.Screen$/.test(jsxName(c.openingElement.name)));
    const firstName = first && first.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'name');
    const route = initial && initial.value && initial.value.type === 'StringLiteral' ? initial.value.value : firstName && firstName.value && firstName.value.value;
    if (route) navigatorDefs.push({ component: enclosingComponent(elementPath, mod), initial: route });
  }
}

// Route name -> the screen component it shows. A route whose component is a
// navigator (tabs inside a stack) shows that navigator's initial route.
function screenOfRoute(route) {
  const routes = new Map(routeDefs.map((r) => [r.route, r.component]));
  const initial = new Map(navigatorDefs.map((n) => [n.component, n.initial]));
  let component = routes.get(route);
  for (let depth = 0; component && initial.has(component) && depth < 5; depth++) component = routes.get(initial.get(component));
  return component || null;
}

function extractFromModule(mod, modules, wrappers) {
  const { code, ast } = mod;

  traverse(ast, {
    JSXElement(elementPath) {
      const opening = elementPath.node.openingElement;
      const written = jsxName(opening.name);
      const importSource = mod.imports[written.split('.')[0]] && mod.imports[written.split('.')[0]].source;
      const vendor = importSource && importSource !== 'react-native' && !isLocalSource(mod.file, importSource) ? { module: importSource } : {};
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
      recordRoutes(opening, elementPath, written, mod, modules);
      const route = navigationTarget(opening, elementPath, code);
      const nav = route ? { route } : {};
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
          ...nav,
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
          ...nav,
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

// options.aliases: import prefix -> directory, e.g. { '@/': '/app/src/' }.
// options.exclude: directories or files (absolute) not to scan.
function extract(srcDir, options = {}) {
  results = [];
  excluded = (options.exclude || []).map((p) => path.resolve(p));
  routeDefs = [];
  navigatorDefs = [];
  aliases = Object.fromEntries(Object.entries(options.aliases || {}).map(([k, v]) => [k, path.resolve(v)]));
  const modules = new Map();
  for (const file of collectFiles(srcDir)) {
    const mod = parseModule(file);
    // Keyed by absolute path: imports resolve to absolute paths, and a
    // relative key (e.g. scanning ./src) made every cross-file wrapper and
    // constant lookup miss.
    if (mod) modules.set(path.resolve(file), mod);
  }
  const wrappers = buildWrappers(modules);
  for (const mod of modules.values()) extractFromModule(mod, modules, wrappers);
  // navigatesTo: the screen a tap certainly lands on, once every navigator
  // registration is known (they can be in any file).
  for (const r of results) {
    if (!r.route) continue;
    const screen = screenOfRoute(r.route);
    delete r.route;
    if (screen) r.navigatesTo = screen;
  }
  return { findings: results, summary: summarize(results) };
}

module.exports = { extract, summarize };

// With no directory, scans the app in grounding.config.json (or the demo
// app); --save writes <output>/registry.json instead of printing.
if (require.main === module) {
  const { loadConfig } = require('../generator/config.mts');
  const config = loadConfig();
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith('--'));
  const registry = extract(dirArg ? path.resolve(dirArg) : config.app.sourceDir, { aliases: config.app.aliases, exclude: config.app.exclude });
  if (args.includes('--save')) {
    const file = path.join(config.output, 'registry.json');
    fs.mkdirSync(config.output, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');
    console.log(`Wrote ${file}: ${registry.findings.length} findings.`);
  } else {
    console.log(JSON.stringify(registry, null, 2));
  }
}
