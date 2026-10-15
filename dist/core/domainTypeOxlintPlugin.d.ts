//#region src/core/domainTypeOxlintPlugin.d.ts
/**
 * @francogp/domain-type Oxlint JS Plugin
 *
 * Enforces the 4 core domain-type-first rules:
 * 1. no-naked-string-union: Forbids open string unions (| string) mixing primitives with domain literals.
 * 2. no-record-string-key: Forbids Record<string, T> or Record<PropertyKey, T> in favor of Record<DomainId, T>.
 * 3. no-untyped-string-set-map: Forbids new Set / new Map instantiated with string literals without domain typing.
 * 4. no-broad-string-array: Forbids string literal arrays without `as const`.
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
}
export interface OxlintReportDescriptor {
  readonly node: unknown;
  readonly message: string;
}
export interface OxlintRuleContext {
  report(descriptor: OxlintReportDescriptor): void;
  getSourceCode?(): {
    getText(node?: unknown): string;
    getCommentsBefore?(node?: unknown): unknown[];
  };
}
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
  };
};
//#endregion
export { domainTypeOxlintPlugin as default };