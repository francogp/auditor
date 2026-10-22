//#region src/core/domainTypeOxlintPlugin.d.ts
/**
 * @francogp/domain-type Oxlint JS Plugin (Node.js 26+ Native)
 *
 * Comprehensive single-file AST plugin enforcing strict domain types,
 * O(1) data structure hygiene, type assertion purity, and Vue 3 reactivity.
 *
 * Enforces:
 * 1. no-naked-string-union: Forbids open string unions (| string) mixing primitives with domain literals.
 * 2. no-record-string-key: Forbids Record<string, T> in favor of Record<DomainId, T> (permits open unknown dictionaries).
 * 3. no-untyped-string-set-map: Forbids new Set / new Map instantiated with string literals without domain typing.
 * 4. no-broad-string-array: Forbids string literal arrays without `as const`.
 * 5. no-double-cast-unknown: Forbids `as unknown as T` bypassing type boundaries.
 * 6. no-legacy-date: Forbids `new Date()` and `Date.now()` in favor of Temporal API.
 * 7. no-unbranded-id: Forbids `type XId = string` without nominal Brand<string, ...>.
 * 8. no-json-clone: Forbids `JSON.parse(JSON.stringify(...))` in favor of structuredClone.
 * 9. no-redundant-spread-return: Forbids `return [...arr]` in favor of direct return or readonly arrays.
 * 10. no-boolean-literal-annotation: Forbids `: true` or `: false` type annotations.
 * 11. no-async-in-computed: Forbids async callbacks in computed().
 * 12. watch-reactive-property-getter: Forbids naked prop references in watch().
 * 13. no-destructured-reactive: Forbids destructuring reactive() without toRefs().
 *
 * All rules strictly inspect AST nodes without bypass comments (Zero-Ignore Mandate).
 */
export interface OxlintAstNode {
  readonly type?: string;
  readonly name?: string;
  readonly value?: unknown;
  readonly types?: readonly OxlintAstNode[];
  readonly literal?: {
    readonly value?: unknown;
  };
  readonly typeName?: {
    readonly name?: string;
  };
  readonly typeArguments?: {
    readonly params?: readonly OxlintAstNode[];
  };
  readonly typeParameters?: {
    readonly params?: readonly OxlintAstNode[];
  };
  readonly typeAnnotation?: OxlintAstNode;
  readonly elementType?: OxlintAstNode;
  readonly callee?: OxlintAstNode;
  readonly arguments?: readonly OxlintAstNode[];
  readonly elements?: readonly (OxlintAstNode | null)[];
  readonly init?: OxlintAstNode;
  readonly expression?: OxlintAstNode;
  readonly id?: OxlintAstNode;
  readonly object?: OxlintAstNode;
  readonly property?: OxlintAstNode;
  readonly argument?: OxlintAstNode;
  readonly async?: boolean;
  readonly range?: readonly [number, number];
  readonly parent?: OxlintAstNode;
}
export type OxlintCommentNode = string | {
  readonly value?: string;
};
export interface OxlintReportDescriptor {
  readonly node: unknown;
  readonly message: string;
}
export interface OxlintRuleContext {
  report(descriptor: OxlintReportDescriptor): void;
  getSourceCode?(): {
    getText(node?: unknown): string;
    getCommentsBefore?(node?: unknown): readonly OxlintCommentNode[];
    getCommentsAfter?(node?: unknown): readonly OxlintCommentNode[];
  };
}
export declare const COMMON_NON_DOMAIN_SET_NAMES: Set<string>;
export declare const domainTypeOxlintPlugin: {
  meta: {
    name: string;
    version: string;
  };
  rules: {
    'no-naked-string-union': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        TSUnionType(node: OxlintAstNode): void;
      };
    };
    'no-record-string-key': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        TSTypeReference(node: OxlintAstNode): void;
      };
    };
    'no-untyped-string-set-map': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        NewExpression(node: OxlintAstNode): void;
      };
    };
    'no-broad-string-array': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        VariableDeclarator(node: OxlintAstNode): void;
      };
    };
    'no-double-cast-unknown': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        TSAsExpression: (node: OxlintAstNode) => void;
        TSTypeAssertion: (node: OxlintAstNode) => void;
      };
    };
    'no-legacy-date': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        NewExpression(node: OxlintAstNode): void;
        CallExpression(node: OxlintAstNode): void;
      };
    };
    'no-unbranded-id': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        TSTypeAliasDeclaration(node: OxlintAstNode): void;
      };
    };
    'no-json-clone': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        CallExpression(node: OxlintAstNode): void;
      };
    };
    'no-redundant-spread-return': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        ReturnStatement(node: OxlintAstNode): void;
      };
    };
    'no-boolean-literal-annotation': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        TSTypeAnnotation(node: OxlintAstNode): void;
      };
    };
    'no-async-in-computed': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        CallExpression(node: OxlintAstNode): void;
      };
    };
    'watch-reactive-property-getter': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        CallExpression(node: OxlintAstNode): void;
      };
    };
    'no-destructured-reactive': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): {
        VariableDeclarator(node: OxlintAstNode): void;
      };
    };
  };
};
//#endregion
export { domainTypeOxlintPlugin as default };