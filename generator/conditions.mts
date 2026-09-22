// Evaluates the source text the extractor records for render conditions
// (`isEntitled`, `!(item.entitled)`) and for templated testIDs
// (`plan-item-${item.id}`) against persona props and a test-data record.
//
// Deliberately a whitelist interpreter over Babel's AST, never eval():
// condition text comes from app source, and anything outside the subset below
// is reported as unverifiable instead of being guessed at.
import babelParser from '@babel/parser';
import type * as t from '@babel/types';

export class Unverifiable extends Error {}

type Scope = Record<string, unknown>;

function evaluate(node: t.Node, scope: Scope): unknown {
  switch (node.type) {
    case 'Identifier':
      if (!(node.name in scope)) throw new Unverifiable(`no test data for \`${node.name}\``);
      return scope[node.name];
    case 'MemberExpression': {
      if (node.computed || node.property.type !== 'Identifier') {
        throw new Unverifiable('computed member access');
      }
      const obj = evaluate(node.object, scope);
      if (obj === null || typeof obj !== 'object' || !(node.property.name in obj)) {
        throw new Unverifiable(`no test data for \`.${node.property.name}\``);
      }
      return (obj as Record<string, unknown>)[node.property.name];
    }
    case 'UnaryExpression':
      if (node.operator !== '!') throw new Unverifiable(`operator ${node.operator}`);
      return !evaluate(node.argument, scope);
    case 'LogicalExpression': {
      const left = evaluate(node.left, scope);
      if (node.operator === '&&') return left && evaluate(node.right, scope);
      if (node.operator === '||') return left || evaluate(node.right, scope);
      throw new Unverifiable(`operator ${node.operator}`);
    }
    case 'BinaryExpression': {
      const l = evaluate(node.left as t.Expression, scope);
      const r = evaluate(node.right, scope);
      if (node.operator === '===' || node.operator === '==') return l === r;
      if (node.operator === '!==' || node.operator === '!=') return l !== r;
      throw new Unverifiable(`operator ${node.operator}`);
    }
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'TemplateLiteral':
      return node.quasis
        .map((q, i) => q.value.cooked + (i < node.expressions.length ? String(evaluate(node.expressions[i], scope)) : ''))
        .join('');
    default:
      throw new Unverifiable(`unsupported expression ${node.type}`);
  }
}

export function evaluateExpression(source: string, scope: Scope): unknown {
  return evaluate(babelParser.parseExpression(source), scope);
}

export function evaluateCondition(source: string, scope: Scope): boolean {
  return Boolean(evaluate(babelParser.parseExpression(source), scope));
}

// Registry values for templated IDs keep the JSX braces: {`plan-item-${item.id}`}
export function resolveTemplate(registryValue: string, scope: Scope): string {
  const expr = babelParser.parseExpression(registryValue.replace(/^\{|\}$/g, ''));
  if (expr.type !== 'TemplateLiteral') throw new Unverifiable('not a template literal');
  return String(evaluate(expr, scope));
}
