import { describe, it, expect } from 'vite-plus/test';
import {
  domainTypeOxlintPlugin,
  type OxlintReportDescriptor,
  type OxlintRuleContext
} from '../src/core/domainTypeOxlintPlugin.ts';

describe('domainTypeOxlintPlugin (3-Tier Canary Test Matrix)', () => {
  function createMockContext(options?: {
    text?: string;
    commentsBefore?: string[];
    commentsAfter?: string[];
  }): { reports: OxlintReportDescriptor[]; context: OxlintRuleContext } {
    const reports: OxlintReportDescriptor[] = [];
    const context: OxlintRuleContext = {
      report: (descriptor: OxlintReportDescriptor) => {
        reports.push(descriptor);
      },
      getSourceCode: () => ({
        getText: () => options?.text ?? '',
        getCommentsBefore: () => options?.commentsBefore ?? [],
        getCommentsAfter: () => options?.commentsAfter ?? []
      })
    };
    return { reports, context };
  }

  describe('no-record-string-key Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-record-string-key'];

    it('Active Canary: flags Record with raw string key', () => {
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

    it('Escape Canary: allows Record<string, T> with // open-record: comment', () => {
      const { reports, context } = createMockContext({
        text: 'type Dict = Record<string, number>; // open-record: Dynamic mapping'
      });
      const visitor = rule.create(context);
      visitor.TSTypeReference?.({
        type: 'TSTypeReference',
        typeName: { name: 'Record' },
        typeArguments: {
          params: [{ type: 'TSStringKeyword' }, { type: 'TSNumberKeyword' }]
        }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: permits open unknown dictionary Record<string, unknown>', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeReference?.({
        type: 'TSTypeReference',
        typeName: { name: 'Record' },
        typeArguments: {
          params: [{ type: 'TSStringKeyword' }, { type: 'TSUnknownKeyword' }]
        }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-untyped-string-set-map Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-untyped-string-set-map'];

    it('Active Canary: flags new Set with string literal array without domain typing', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Set' },
        arguments: [
          {
            type: 'ArrayExpression',
            elements: [
              { type: 'Literal', value: 'admin' },
              { type: 'Literal', value: 'user' }
            ]
          }
        ]
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('PROHIBIDO instanciar Set');
    });

    it('Escape Canary: allows new Set with // runtime-set: directive', () => {
      const { reports, context } = createMockContext({
        text: "const SET = new Set(['a', 'b']); // runtime-set: dynamic validation"
      });
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Set' },
        arguments: [
          {
            type: 'ArrayExpression',
            elements: [{ type: 'Literal', value: 'a' }]
          }
        ]
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows new Set with explicit domain type argument', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Set' },
        typeArguments: {
          params: [{ type: 'TSTypeReference', typeName: { name: 'CanonicalDomainKey' } }]
        },
        arguments: [
          {
            type: 'ArrayExpression',
            elements: [{ type: 'Literal', value: 'a' }]
          }
        ]
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-naked-string-union Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-naked-string-union'];

    it('Active Canary: flags open string union mixing literals and string keyword', () => {
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

    it('Escape Canary: allows open union with // string-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: "type Status = 'active' | string; // string-ok: external plugin status"
      });
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [
          { type: 'TSLiteralType', literal: { value: 'active' } },
          { type: 'TSStringKeyword' }
        ]
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows closed domain union', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [
          { type: 'TSLiteralType', literal: { value: 'active' } },
          { type: 'TSLiteralType', literal: { value: 'inactive' } }
        ]
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-broad-string-array Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-broad-string-array'];

    it('Active Canary: flags literal array without as const', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        init: {
          type: 'ArrayExpression',
          elements: [
            { type: 'Literal', value: 'red' },
            { type: 'Literal', value: 'blue' }
          ]
        }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('sin `as const`');
    });

    it('Escape Canary: allows literal array with // string-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: "const colors = ['red', 'blue']; // string-ok: non-domain utility array"
      });
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        init: {
          type: 'ArrayExpression',
          elements: [{ type: 'Literal', value: 'red' }]
        }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows literal array with as const', () => {
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
            elements: [{ type: 'Literal', value: 'red' }]
          }
        }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-double-cast-unknown Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-double-cast-unknown'];

    it('Active Canary: flags as unknown cast', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSUnknownKeyword' }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('casteo hacia unknown');
    });

    it('Escape Canary: allows as unknown with // type-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const x = y as unknown as T; // type-ok: complex third party generic'
      });
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSUnknownKeyword' }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows direct concrete type cast', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSTypeReference', typeName: { name: 'CustomDomainDto' } }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-legacy-date Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-legacy-date'];

    it('Active Canary: flags new Date()', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Date' }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('new Date()');
    });

    it('Escape Canary: allows new Date() with // date-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const d = new Date(); // date-ok: legacy database driver'
      });
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Date' }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows Temporal.Now calls', () => {
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
  });

  describe('no-unbranded-id Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-unbranded-id'];

    it('Active Canary: flags type UserId = string without brand', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAliasDeclaration?.({
        type: 'TSTypeAliasDeclaration',
        id: { name: 'UserId' },
        typeAnnotation: { type: 'TSStringKeyword' }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain("identificador de dominio 'UserId'");
    });

    it('Escape Canary: allows type UserId = string with // infra-id-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'type SessionId = string; // infra-id-ok: third party cookie session id'
      });
      const visitor = rule.create(context);
      visitor.TSTypeAliasDeclaration?.({
        type: 'TSTypeAliasDeclaration',
        id: { name: 'SessionId' },
        typeAnnotation: { type: 'TSStringKeyword' }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: non-Id type aliases are permitted', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAliasDeclaration?.({
        type: 'TSTypeAliasDeclaration',
        id: { name: 'UserDescription' },
        typeAnnotation: { type: 'TSStringKeyword' }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-json-clone Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-json-clone'];

    it('Active Canary: flags JSON.parse(JSON.stringify(x))', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { name: 'JSON' },
          property: { name: 'parse' }
        },
        arguments: [
          {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: { name: 'JSON' },
              property: { name: 'stringify' }
            }
          }
        ]
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('JSON.parse(JSON.stringify(...))');
    });

    it('Escape Canary: allows JSON clone with // o1-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const copy = JSON.parse(JSON.stringify(x)); // o1-ok: non-serializable strip'
      });
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { name: 'JSON' },
          property: { name: 'parse' }
        },
        arguments: [
          {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: { name: 'JSON' },
              property: { name: 'stringify' }
            }
          }
        ]
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows structuredClone()', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'structuredClone' }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-redundant-spread-return Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-redundant-spread-return'];

    it('Active Canary: flags return [...arr]', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.ReturnStatement?.({
        type: 'ReturnStatement',
        argument: {
          type: 'ArrayExpression',
          elements: [{ type: 'SpreadElement' }]
        }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Retorno redundante con propagación');
    });

    it('Escape Canary: allows return [...arr] with // o1-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'return [...arr]; // o1-ok: defensive mutation copy'
      });
      const visitor = rule.create(context);
      visitor.ReturnStatement?.({
        type: 'ReturnStatement',
        argument: {
          type: 'ArrayExpression',
          elements: [{ type: 'SpreadElement' }]
        }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows direct array return', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.ReturnStatement?.({
        type: 'ReturnStatement',
        argument: { type: 'Identifier', name: 'arr' }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-boolean-literal-annotation Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-boolean-literal-annotation'];

    it('Active Canary: flags variable with : true literal annotation', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAnnotation?.({
        type: 'TSTypeAnnotation',
        typeAnnotation: {
          type: 'TSLiteralType',
          literal: { value: true }
        }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Anotación literal redundante');
    });

    it('Escape Canary: allows : true with // type-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const FLAG: true = true; // type-ok: exact type discriminator'
      });
      const visitor = rule.create(context);
      visitor.TSTypeAnnotation?.({
        type: 'TSTypeAnnotation',
        typeAnnotation: {
          type: 'TSLiteralType',
          literal: { value: true }
        }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows : boolean type annotation', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAnnotation?.({
        type: 'TSTypeAnnotation',
        typeAnnotation: { type: 'TSBooleanKeyword' }
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-async-in-computed Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-async-in-computed'];

    it('Active Canary: flags computed(async () => ...)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'computed' },
        arguments: [
          {
            type: 'ArrowFunctionExpression',
            async: true
          }
        ]
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Callback asíncrono en computed() prohibido');
    });

    it('Escape Canary: allows async computed with // reactivity-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const val = computed(async () => ...); // reactivity-ok: experimental promise computed'
      });
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'computed' },
        arguments: [
          {
            type: 'ArrowFunctionExpression',
            async: true
          }
        ]
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows synchronous computed callback', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'computed' },
        arguments: [
          {
            type: 'ArrowFunctionExpression',
            async: false
          }
        ]
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('watch-reactive-property-getter Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['watch-reactive-property-getter'];

    it('Active Canary: flags watch(props.foo, ...)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'watch' },
        arguments: [
          {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'props' },
            property: { type: 'Identifier', name: 'isOpen' }
          }
        ]
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Observación directa de propiedad props en watch()');
    });

    it('Escape Canary: allows naked prop watch with // reactivity-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'watch(props.isOpen, ...); // reactivity-ok: reactive ref passed from parent'
      });
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'watch' },
        arguments: [
          {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'props' },
            property: { type: 'Identifier', name: 'isOpen' }
          }
        ]
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows getter function watch(() => props.isOpen, ...)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'watch' },
        arguments: [
          {
            type: 'ArrowFunctionExpression'
          }
        ]
      });
      expect(reports.length).toBe(0);
    });
  });

  describe('no-destructured-reactive Canaries', () => {
    const rule = domainTypeOxlintPlugin.rules['no-destructured-reactive'];

    it('Active Canary: flags const { a, b } = reactive(...)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: { type: 'ObjectPattern' },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'reactive' }
        }
      });
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toContain('Desestructuración directa de reactive() prohibida');
    });

    it('Escape Canary: allows destructuring with // reactivity-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const { count } = reactive({ count: 0 }); // reactivity-ok: one-shot snapshot'
      });
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: { type: 'ObjectPattern' },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'reactive' }
        }
      });
      expect(reports.length).toBe(0);
    });

    it('Clean Canary: allows non-destructured reactive state', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'state' },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'reactive' }
        }
      });
      expect(reports.length).toBe(0);
    });
  });
});
