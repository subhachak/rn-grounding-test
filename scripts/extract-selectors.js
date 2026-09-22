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
// Usage: node scripts/extract-selectors.js ./src > registry.json

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
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', 'build', 'dist', 'coverage', 'web-build', '__tests__']);
const TEST_FILE = /\.(test|spec)\.(jsx?|tsx?)$/;

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(file) && !file.startsWith('.')) walkDir(fullPath);
    } else if (/\.(jsx?|tsx?)$/.test(file) && !TEST_FILE.test(file)) {
      extractFromFile(fullPath);
    }
  }
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

function extractFromFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch (e) {
    console.error(`Skipping ${filePath}: parse error (${e.message})`);
    return;
  }

  const screenName = path.basename(filePath).replace(/\.(jsx?|tsx?)$/, '');

  traverse(ast, {
    JSXElement(elementPath) {
      const opening = elementPath.node.openingElement;
      const elementName = jsxName(opening.name);
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
        if (attr.value && attr.value.type === 'StringLiteral') {
          value = attr.value.value;
          category = 'stable';
        } else if (attr.value && attr.value.type === 'JSXExpressionContainer') {
          value = code.slice(attr.value.start, attr.value.end);
          category =
            attr.value.expression.type === 'TemplateLiteral' ? 'templated-dynamic' : 'expression-dynamic';
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
          file: filePath,
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
          // a spread (`{...props}`) could be passing a testID we can't see
          ...(hasSpreadProps && { hasSpreadProps: true }),
          file: filePath,
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
  walkDir(srcDir);
  return { findings: results, summary: summarize(results) };
}

module.exports = { extract };

if (require.main === module) {
  console.log(JSON.stringify(extract(process.argv[2] || './src'), null, 2));
}
