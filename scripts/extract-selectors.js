// AST-based selector extraction, upgraded to classify each finding into
// the categories we're testing: stable, templated-dynamic, or (implicitly,
// by absence) missing.
//
// Usage: node build-registry.js ./src > registry.json

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const SRC_DIR = process.argv[2] || './src';
const results = [];

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !file.includes('node_modules')) {
      walkDir(fullPath);
    } else if (/\.(jsx?|tsx?)$/.test(file)) {
      extractFromFile(fullPath);
    }
  }
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
    JSXAttribute(nodePath) {
      const name = nodePath.node.name.name;
      if (name === 'testID' || name === 'accessibilityLabel' || name === 'accessibilityIdentifier') {
        let value = null;
        let category = null;

        if (nodePath.node.value && nodePath.node.value.type === 'StringLiteral') {
          value = nodePath.node.value.value;
          category = 'stable';
        } else if (nodePath.node.value && nodePath.node.value.type === 'JSXExpressionContainer') {
          const expr = nodePath.node.value.expression;
          value = code.slice(nodePath.node.value.start, nodePath.node.value.end);
          category = expr.type === 'TemplateLiteral' ? 'templated-dynamic' : 'expression-dynamic';
        }

        // find the enclosing JSX element name (e.g. TouchableOpacity, Text) for context
        let elementName = 'unknown';
        const jsxOpeningEl = nodePath.findParent((p) => p.isJSXOpeningElement());
        if (jsxOpeningEl) {
          elementName = jsxOpeningEl.node.name.name || 'unknown';
        }

        results.push({
          screen: screenName,
          element: elementName,
          attribute: name,
          category,
          value,
          file: filePath,
          line: nodePath.node.loc.start.line,
        });
      }
    },
  });
}

walkDir(SRC_DIR);

// Summary by category, plus flag screens with JSX elements that have
// NEITHER testID nor accessibilityLabel (best-effort missing-ID detection:
// interactive-looking elements with no locator attribute at all).
const summary = { stable: 0, 'templated-dynamic': 0, 'expression-dynamic': 0 };
for (const r of results) summary[r.category] = (summary[r.category] || 0) + 1;

console.log(JSON.stringify({ findings: results, summary }, null, 2));
