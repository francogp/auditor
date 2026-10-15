import { describe, it, expect } from 'vite-plus/test';
import {
  domainTypeOxlintPlugin,
  type OxlintReportDescriptor,
  type OxlintRuleContext
} from '../src/core/domainTypeOxlintPlugin.ts';

describe('domainTypeOxlintPlugin (12 Canary Matrix)', () => {
  function createMockContext(): { reports: OxlintReportDescriptor[]; context: OxlintRuleContext } {
    const reports: OxlintReportDescriptor[] = [];
    const context: OxlintRuleContext = {
      report: (descriptor: OxlintReportDescriptor) => {
        reports.push(descriptor);
      }
    };
    return { reports, context };
  }

  describe('no-double-cast-unknown Canaries (C-AST-01, C-AST-02)', () => {
    const rule = domainTypeOxlintPlugin.rules['no-double-cast-unknown'];

    it('C-AST-01: flags TSAsExpression casting to TSUnknownKeyword', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSUnknownKeyword' }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('casteo hacia unknown');
    });

    it('C-AST-02: flags TSTypeAssertion casting to unknown reference', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAssertion?.({
        type: 'TSTypeAssertion',
        typeAnnotation: { type: 'TSTypeReference', typeName: { name: 'unknown' } }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('casteo hacia unknown');
    });
  });

  describe('no-legacy-date Canaries (C-AST-03, C-AST-04, C-AST-05)', () => {
    const rule = domainTypeOxlintPlugin.rules['no-legacy-date'];

    it('C-AST-03: flags new Date() invocation', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Date' }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('new Date()');
      expect(reports[0]!.message).toContain('Temporal');
    });

    it('C-AST-04: flags new Date(arg) with arguments', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Date' },
        arguments: [{ type: 'Literal', value: '2026-01-01' }]
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('new Date()');
    });

    it('C-AST-05: flags Date.now() call', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Date' },
          property: { type: 'Identifier', name: 'now' }
        }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Date.now()');
    });
  });

  describe('Domain Schema Canaries (C-AST-06, C-AST-07)', () => {
    it('C-AST-06: flags naked string union mixing primitive string and string literals', () => {
      const rule = domainTypeOxlintPlugin.rules['no-naked-string-union'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [
          { type: 'TSLiteralType', literal: { value: 'active' } },
          { type: 'TSStringKeyword' }
        ]
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('uniones de string abiertas');
    });

    it('C-AST-07: flags Record with raw string key', () => {
      const rule = domainTypeOxlintPlugin.rules['no-record-string-key'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeReference?.({
        type: 'TSTypeReference',
        typeName: { name: 'Record' },
        typeArguments: {
          params: [{ type: 'TSStringKeyword' }, { type: 'TSNumberKeyword' }]
        }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Record<string, T>');
    });
  });

  describe('Clean Path Canaries (C-AST-08 to C-AST-12)', () => {
    it('C-AST-08: Temporal calls are ignored by no-legacy-date', () => {
      const rule = domainTypeOxlintPlugin.rules['no-legacy-date'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Temporal' },
          property: { type: 'Identifier', name: 'Now' }
        }
      });
      expect(reports.length).toBe(0);
    });

    it('C-AST-09: Non-unknown type casts are ignored by no-double-cast-unknown', () => {
      const rule = domainTypeOxlintPlugin.rules['no-double-cast-unknown'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSTypeReference', typeName: { name: 'CustomDomainDto' } }
      });
      expect(reports.length).toBe(0);
    });

    it('C-AST-10: Arrays with as const are allowed by no-broad-string-array', () => {
      const rule = domainTypeOxlintPlugin.rules['no-broad-string-array'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        init: {
          type: 'TSAsExpression',
          typeAnnotation: {
            type: 'TSTypeReference',
            typeName: { name: 'const' }
          },
          expression: {
            type: 'ArrayExpression',
            elements: [{ type: 'Literal', value: 'alpha' }]
          }
        }
      });
      expect(reports.length).toBe(0);
    });

    it('C-AST-11: Record with branded domain ID key is allowed by no-record-string-key', () => {
      const rule = domainTypeOxlintPlugin.rules['no-record-string-key'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeReference?.({
        type: 'TSTypeReference',
        typeName: { name: 'Record' },
        typeArguments: {
          params: [
            { type: 'TSTypeReference', typeName: { name: 'UserId' } },
            { type: 'TSNumberKeyword' }
          ]
        }
      });
      expect(reports.length).toBe(0);
    });

    it('C-AST-12: Typed Set/Map instantiations with domain type parameters are allowed', () => {
      const rule = domainTypeOxlintPlugin.rules['no-untyped-string-set-map'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Set' },
        typeArguments: {
          params: [{ type: 'TSTypeReference', typeName: { name: 'CanonicalDomainKey' } }]
        }
      });
      expect(reports.length).toBe(0);
    });
  });
});
