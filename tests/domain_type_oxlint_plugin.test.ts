import { describe, it, expect } from 'vite-plus/test';

import {
  domainTypeOxlintPlugin,
  type OxlintAstNode,
  type OxlintReportDescriptor,
  type OxlintRuleContext
} from '../src/core/domainTypeOxlintPlugin.ts';

describe('domainTypeOxlintPlugin (3-Tier Canary Test Matrix)', () => {
  function createMockContext(options?: {
    text?: string;
    filename?: string;
    commentsBefore?: string[];
    commentsAfter?: string[];
  }): { reports: OxlintReportDescriptor[]; context: OxlintRuleContext } {
    const reports: OxlintReportDescriptor[] = [];
    const context: OxlintRuleContext = {
      filename: options?.filename,
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Record<string, T>');
    });

    it('Zero-Ignore Mandate: flags Record<string, T> regardless of // open-record: comment', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('PROHIBITED');
    });

    it('Zero-Ignore Mandate: flags new Set regardless of // runtime-set: directive', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('open string unions');
    });

    it('Zero-Ignore Mandate: flags open union regardless of // string-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
    });

    it('Active Canary: flags open union mixing named domain type reference and string keyword (DomainType | string)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [
          { type: 'TSTypeReference', typeName: { name: 'RelaxationCode' } },
          { type: 'TSStringKeyword' }
        ]
      });
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('open string unions');
    });

    it('Active Canary: flags open union mixing template literal type and string keyword', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [{ type: 'TSTemplateLiteralType' }, { type: 'TSStringKeyword' }]
      });
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('open string unions');
    });

    it('Clean Canary: allows closed domain type references union (TypeA | TypeB)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [
          { type: 'TSTypeReference', typeName: { name: 'AdminId' } },
          { type: 'TSTypeReference', typeName: { name: 'UserId' } }
        ]
      });
      expect(reports).toHaveLength(0);
    });

    it('Clean Canary: allows standard built-in type union with string (string | Iterable<string> | ReadonlyArray<string>)', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSUnionType?.({
        type: 'TSUnionType',
        types: [
          { type: 'TSStringKeyword' },
          { type: 'TSTypeReference', typeName: { name: 'Iterable' } },
          { type: 'TSTypeReference', typeName: { name: 'ReadonlyArray' } }
        ]
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('without `as const`');
    });

    it('Zero-Ignore Mandate: flags literal array regardless of // string-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
    });

    it('Clean Canary: permits literal arrays without as const in plain JavaScript files (.js, .cjs, .mjs)', () => {
      const { reports, context } = createMockContext({
        filename: '.agents/scripts/prevent_destructive_git.js'
      });
      const visitor = rule.create(context);
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        init: {
          type: 'ArrayExpression',
          elements: [
            { type: 'Literal', value: '.fallowrc.json' },
            { type: 'Literal', value: 'vite.config.ts' }
          ]
        }
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Casting to unknown');
    });

    it('Zero-Ignore Mandate: flags as unknown regardless of // type-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const x = y as unknown as T; // type-ok: complex third party generic'
      });
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSUnknownKeyword' }
      });
      expect(reports).toHaveLength(1);
    });

    it('Clean Canary: allows direct concrete type cast', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSAsExpression?.({
        type: 'TSAsExpression',
        typeAnnotation: { type: 'TSTypeReference', typeName: { name: 'CustomDomainDto' } }
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('new Date()');
    });

    it('Zero-Ignore Mandate: flags new Date() regardless of // date-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'const d = new Date(); // date-ok: legacy database driver'
      });
      const visitor = rule.create(context);
      visitor.NewExpression?.({
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Date' }
      });
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain("Domain identifier 'UserId'");
    });

    it('Zero-Ignore Mandate: flags type SessionId = string regardless of // infra-id-ok: comment', () => {
      const { reports, context } = createMockContext({
        text: 'type SessionId = string; // infra-id-ok: third party cookie session id'
      });
      const visitor = rule.create(context);
      visitor.TSTypeAliasDeclaration?.({
        type: 'TSTypeAliasDeclaration',
        id: { name: 'SessionId' },
        typeAnnotation: { type: 'TSStringKeyword' }
      });
      expect(reports).toHaveLength(1);
    });

    it('Clean Canary: non-Id type aliases are permitted', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAliasDeclaration?.({
        type: 'TSTypeAliasDeclaration',
        id: { name: 'UserDescription' },
        typeAnnotation: { type: 'TSStringKeyword' }
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('JSON.parse(JSON.stringify(...))');
    });

    it('Zero-Ignore Mandate: flags JSON clone regardless of // o1-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
    });

    it('Clean Canary: allows structuredClone()', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'structuredClone' }
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Redundant spread return');
    });

    it('Zero-Ignore Mandate: flags return [...arr] regardless of // o1-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
    });

    it('Clean Canary: allows direct array return', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.ReturnStatement?.({
        type: 'ReturnStatement',
        argument: { type: 'Identifier', name: 'arr' }
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Redundant literal annotation');
    });

    it('Zero-Ignore Mandate: flags : true regardless of // type-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
    });

    it('Clean Canary: allows : boolean type annotation', () => {
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);
      visitor.TSTypeAnnotation?.({
        type: 'TSTypeAnnotation',
        typeAnnotation: { type: 'TSBooleanKeyword' }
      });
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Async callback in computed() is prohibited');
    });

    it('Zero-Ignore Mandate: flags async computed regardless of // reactivity-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Direct observation of props property in watch()');
    });

    it('Zero-Ignore Mandate: flags naked prop watch regardless of // reactivity-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
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
      expect(reports).toHaveLength(1);
      expect(reports[0]!.message).toContain('Direct destructuring of reactive() is prohibited');
    });

    it('Zero-Ignore Mandate: flags destructuring regardless of // reactivity-ok: comment', () => {
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
      expect(reports).toHaveLength(1);
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
      expect(reports).toHaveLength(0);
    });
  });

  describe('Heuristic Refinements & False Positive Eradication Canaries', () => {
    it('CANARY: dom-event-leak ignores Pinia stores, SPA mount entrypoints, and cleanWorkerListener helpers', () => {
      const rule = domainTypeOxlintPlugin.rules['dom-event-leak'];
      // Simulate Oxlint runtime where context.getSourceCode is only valid during visitor execution
      let currentText = '';
      const reports: OxlintReportDescriptor[] = [];
      const context: OxlintRuleContext = {
        report: (d) => reports.push(d),
        getSourceCode: () => ({ getText: () => currentText })
      };
      const visitor = rule.create(context);
      expect(visitor.CallExpression).toBeDefined();

      currentText = 'export const useAuthStore = defineStore("auth", () => {});';
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'window' },
          property: { type: 'Identifier', name: 'addEventListener' }
        },
        arguments: [{ type: 'Literal', value: 'click' }]
      });
      expect(reports).toHaveLength(0);

      currentText =
        'cleanWorkerListener(worker, handler); worker.addEventListener("message", handler);';
      visitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'worker' },
          property: { type: 'Identifier', name: 'addEventListener' }
        },
        arguments: [{ type: 'Literal', value: 'message' }]
      });
      expect(reports).toHaveLength(0);
    });

    it('CANARY: no-insecure-random only flags sensitive token/secret/password identifiers, not PRNG seeds or NPC phrases in files mentioning secret/auth elsewhere', () => {
      const rule = domainTypeOxlintPlugin.rules['no-insecure-random'];
      const { reports, context } = createMockContext({
        text: '// secretDiscovered and useAuthStore are mentioned in this file\nconst seed = Math.floor(Math.random() * 100000);'
      });
      const visitor = rule.create(context);

      // Clean: PRNG seed assignment in a file that mentions secret/auth elsewhere
      const seedDeclarator: OxlintAstNode = {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'seed' }
      };
      const floorCall: OxlintAstNode = {
        type: 'CallExpression',
        parent: seedDeclarator
      };
      visitor.CallExpression?.({
        type: 'CallExpression',
        parent: floorCall,
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Math' },
          property: { type: 'Identifier', name: 'random' }
        }
      });
      expect(reports).toHaveLength(0);

      // Active: Assigning Math.random() to authToken or secretKey MUST be flagged
      const tokenDeclarator: OxlintAstNode = {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'authToken' }
      };
      visitor.CallExpression?.({
        type: 'CallExpression',
        parent: tokenDeclarator,
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Math' },
          property: { type: 'Identifier', name: 'random' }
        }
      });
      expect(reports).toHaveLength(1);
    });

    it('CANARY: unsafe-path-concat ignores WASM locateFile URLs and relative asset subkeys without filesystem context', () => {
      const rule = domainTypeOxlintPlugin.rules['unsafe-path-concat'];
      const { reports, context } = createMockContext({
        text: 'const animSubKey = `animated/${view}${shinyFolderSuffix}/${numVal}i${suffix}`;'
      });
      const visitor = rule.create(context);

      // Relative asset subkey in browser code without node:fs or node:path
      visitor.TemplateLiteral?.({
        type: 'TemplateLiteral',
        quasis: [
          { value: { raw: 'animated/' } },
          { value: { raw: '' } },
          { value: { raw: '/' } },
          { value: { raw: 'i' } },
          { value: { raw: '' } }
        ],
        expressions: [
          { type: 'Identifier', name: 'view' },
          { type: 'Identifier', name: 'shinyFolderSuffix' },
          { type: 'Identifier', name: 'numVal' },
          { type: 'Identifier', name: 'suffix' }
        ]
      });
      expect(reports).toHaveLength(0);

      // WASM locateFile callback URL
      const locateFileProp: OxlintAstNode = {
        type: 'Property',
        key: { type: 'Identifier', name: 'locateFile' }
      };
      const arrowFn: OxlintAstNode = {
        type: 'ArrowFunctionExpression',
        parent: locateFileProp
      };
      visitor.TemplateLiteral?.({
        type: 'TemplateLiteral',
        parent: arrowFn,
        quasis: [{ value: { raw: './node_modules/sql.js/dist/' } }, { value: { raw: '' } }],
        expressions: [{ type: 'Identifier', name: 'file' }]
      });
      expect(reports).toHaveLength(0);
    });

    it('CANARY: no-redundant-constant-alias ignores 1-2 char math shorthand (const T = KANTO_TILE_SIZE) and exported semantic aliases', () => {
      const rule = domainTypeOxlintPlugin.rules['no-redundant-constant-alias'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);

      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'T' },
        init: { type: 'Identifier', name: 'KANTO_TILE_SIZE' }
      });
      expect(reports).toHaveLength(0);

      const exportDecl: OxlintAstNode = { type: 'ExportNamedDeclaration' };
      const varDecl: OxlintAstNode = { type: 'VariableDeclaration', parent: exportDecl };
      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        parent: varDecl,
        id: { type: 'Identifier', name: 'CANONICAL_OCEAN_SHORE_BRUSH' },
        init: { type: 'Identifier', name: 'CANONICAL_SAND_OCEAN_SHORE_BRUSH' }
      });
      expect(reports).toHaveLength(0);
    });

    it('CANARY: no-hardcoded-secrets ignores official public supabase local JWTs and security probe test tokens', () => {
      const rule = domainTypeOxlintPlugin.rules['no-hardcoded-secrets'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);

      // Payload base64url for {"iss":"supabase-demo","role":"anon"}
      visitor.Literal?.({
        type: 'Literal',
        value:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
      });
      // Payload base64url for {"role":"anon","iss":"supabase","iat":1600000000,"exp":2500000000}
      visitor.Literal?.({
        type: 'Literal',
        value:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjI1MDAwMDAwMDB9.bWuWcdy1ICtTs7Zq7TNjum7G0VIS5je9rFlzshoeBLA'
      });
      // Forged signature probe token
      visitor.Literal?.({
        type: 'Literal',
        value:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjAwMDAwMDAwfQ.invalid_forged_signature_probe_hash'
      });
      expect(reports).toHaveLength(0);
    });

    it('CANARY: no-raw-local-storage ignores OPFS storage adapter modules implementing navigator.storage.getDirectory fallback', () => {
      const rule = domainTypeOxlintPlugin.rules['no-raw-local-storage'];
      let currentText =
        'const root = await navigator.storage.getDirectory();\nlocalStorage.removeItem(k);';
      const reports: OxlintReportDescriptor[] = [];
      const context: OxlintRuleContext = {
        report: (d) => reports.push(d),
        getSourceCode: () => ({ getText: () => currentText })
      };
      const visitor = rule.create(context);
      visitor.MemberExpression?.({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'localStorage' },
        property: { type: 'Identifier', name: 'removeItem' }
      });
      expect(reports).toHaveLength(0);

      currentText = 'localStorage.removeItem(k);';
      visitor.MemberExpression?.({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'localStorage' },
        property: { type: 'Identifier', name: 'removeItem' }
      });
      expect(reports).toHaveLength(1);
    });

    it('CANARY: unsafe-path-concat ignores HTTP URLs with query parameters and web variables', () => {
      const rule = domainTypeOxlintPlugin.rules['unsafe-path-concat'];
      const { reports, context } = createMockContext();
      const visitor = rule.create(context);

      visitor.TemplateLiteral?.({
        type: 'TemplateLiteral',
        quasis: [
          { value: { raw: '' } },
          { value: { raw: '/rest/v1/items?select=id,name&limit=' } },
          { value: { raw: '' } }
        ],
        expressions: [
          { type: 'Identifier', name: 'baseUrl' },
          { type: 'Identifier', name: 'limit' }
        ]
      });
      expect(reports).toHaveLength(0);
    });

    it('CANARY: hardcoded-slash-path ignores non-path variable split operations', () => {
      const slashRule = domainTypeOxlintPlugin.rules['hardcoded-slash-path'];
      const { reports, context } = createMockContext();
      const slashVisitor = slashRule.create(context);

      slashVisitor.CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'codeFile' },
          property: { type: 'Identifier', name: 'split' }
        },
        arguments: [{ type: 'Literal', value: '/' }]
      });
      expect(reports).toHaveLength(0);
    });

    it('CANARY: no-broad-string-array allows single-item accumulator buffer typed as string[]', () => {
      const rule = domainTypeOxlintPlugin.rules['no-broad-string-array'];
      const { reports, context } = createMockContext({ filename: 'src/logic/formatter.ts' });
      const visitor = rule.create(context);

      visitor.VariableDeclarator?.({
        type: 'VariableDeclarator',
        id: {
          type: 'Identifier',
          name: 'lines',
          typeAnnotation: {
            type: 'TSTypeAnnotation',
            typeAnnotation: {
              type: 'TSArrayType',
              elementType: { type: 'TSStringKeyword' }
            }
          }
        },
        init: {
          type: 'ArrayExpression',
          elements: [{ type: 'Literal', value: 'Report Header' }]
        }
      });
      expect(reports).toHaveLength(0);
    });
  });
});
