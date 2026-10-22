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
  readonly literal?: { readonly value?: unknown };
  readonly typeName?: { readonly name?: string };
  readonly typeArguments?: { readonly params?: readonly OxlintAstNode[] };
  readonly typeParameters?: { readonly params?: readonly OxlintAstNode[] };
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

export type OxlintCommentNode = string | { readonly value?: string };

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

export const COMMON_NON_DOMAIN_SET_NAMES = new Set([
  'FLAGS',
  'DIRS',
  'ROOTS',
  'PATHS',
  'COMMANDS',
  'TAGS',
  'ELEMENTS',
  'SELECTORS',
  'TOKENS',
  'KEYWORDS',
  'CHARS',
  'GLOBS',
  'FILES',
  'EXTENSIONS',
  'NAMES',
  'KEYS',
  'WORDS',
  'ALIASES',
  'SKILLS',
  'SKIP',
  'VARIANTS',
  'CLASSES',
  'BUILTINS',
  'PACKAGES',
  'ENTRIES',
  'LINES',
  'CHUNKS',
  'ATTRIBUTES',
  'PROPERTIES',
  'ALLOWED_EXTS'
]);

export const domainTypeOxlintPlugin = {
  meta: {
    name: '@francogp/domain-type',
    version: '1.1.0'
  },
  rules: {
    'no-naked-string-union': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids open string unions (| string) or wildcards that dilute typed domains'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          TSUnionType(node: OxlintAstNode) {
            const types = node.types ?? [];
            const hasStringKeyword = types.some((t: OxlintAstNode) => t.type === 'TSStringKeyword');
            if (!hasStringKeyword) return;

            const hasDilutedDomainType = types.some((t: OxlintAstNode) => {
              if (t.type === 'TSLiteralType' && typeof t.literal?.value === 'string') return true;
              if (t.type === 'TSTemplateLiteralType') return true;
              if (t.type === 'TSTypeReference') {
                const name = t.typeName?.name;
                return typeof name === 'string' && name.length > 0;
              }
              return false;
            });

            if (hasDilutedDomainType) {
              context.report({
                node,
                message:
                  'Using open string unions (| string) with domain types or literals is STRICTLY PROHIBITED. Use canonical domain types or Branded Types.'
              });
            }
          }
        };
      }
    },

    'no-record-string-key': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids Record<string, T> or Record<PropertyKey, T> in favor of explicit domain keys'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          TSTypeReference(node: OxlintAstNode) {
            if (node.typeName?.name !== 'Record') return;

            const params = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
            if (params.length === 0) return;

            const firstParam = params[0];
            if (!firstParam) return;
            const isRawStringKey =
              firstParam.type === 'TSStringKeyword' ||
              (firstParam.type === 'TSTypeReference' &&
                firstParam.typeName?.name === 'PropertyKey');

            if (!isRawStringKey) return;

            // Exception: open dictionary Record<string, unknown> or Record<string, any>
            const secondParam = params[1];
            if (
              secondParam &&
              (secondParam.type === 'TSUnknownKeyword' || secondParam.type === 'TSAnyKeyword')
            ) {
              return;
            }

            context.report({
              node,
              message:
                'Using Record<string, T> or Record<PropertyKey, T> is PROHIBITED. Use Record<DomainId, T> with a canonical domain key.'
            });
          }
        };
      }
    },

    'no-untyped-string-set-map': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids new Set / new Map with string literals without canonical domain typing'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          NewExpression(node: OxlintAstNode) {
            const callee = node.callee;
            if (!callee || (callee.name !== 'Set' && callee.name !== 'Map')) return;

            const typeParams = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
            const hasUntypedParam = typeParams.some(
              (p: OxlintAstNode) => p.type === 'TSStringKeyword'
            );
            const args = node.arguments ?? [];

            if (args.length > 0) {
              const firstArg = args[0];
              if (firstArg && firstArg.type === 'ArrayExpression') {
                const hasStringLiteral = firstArg.elements?.some(
                  (el: OxlintAstNode | null) =>
                    el?.type === 'Literal' && typeof el.value === 'string'
                );
                if (hasStringLiteral && (typeParams.length === 0 || hasUntypedParam)) {
                  context.report({
                    node,
                    message: `Instantiating ${callee.name} with string literals without explicit domain typing is PROHIBITED.`
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-broad-string-array': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids string literal arrays without as const or canonical domain typing'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          VariableDeclarator(node: OxlintAstNode) {
            if (!node.init) return;

            let isConstAssertion = false;
            let arrayExpr: OxlintAstNode | undefined = node.init;

            if (node.init.type === 'TSAsExpression') {
              if (
                node.init.typeAnnotation?.type === 'TSTypeReference' &&
                node.init.typeAnnotation.typeName?.name === 'const'
              ) {
                isConstAssertion = true;
              }
              arrayExpr = node.init.expression;
            }

            if (arrayExpr?.type === 'ArrayExpression' && !isConstAssertion) {
              const elements = arrayExpr.elements ?? [];
              if (
                elements.length > 0 &&
                elements.every(
                  (el: OxlintAstNode | null) =>
                    el?.type === 'Literal' && typeof el.value === 'string'
                )
              ) {
                const idType = node.id?.typeAnnotation?.typeAnnotation;
                const isNakedStringArray =
                  !idType ||
                  (idType.type === 'TSArrayType' && idType.elementType?.type === 'TSStringKeyword');

                if (isNakedStringArray) {
                  context.report({
                    node,
                    message:
                      'String literal array declared without `as const`. Add `as const` or type with a canonical domain.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-double-cast-unknown': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Strictly forbids double assertions or casts to unknown (`as unknown -> as T`)'
        }
      },
      create(context: OxlintRuleContext) {
        const verifyNode = (node: OxlintAstNode): void => {
          const typeAnn = node.typeAnnotation;
          if (
            typeAnn &&
            (typeAnn.type === 'TSUnknownKeyword' ||
              (typeAnn.type === 'TSTypeReference' && typeAnn.typeName?.name === 'unknown'))
          ) {
            context.report({
              node,
              message:
                'Casting to unknown (`as unknown`) is STRICTLY PROHIBITED. Use type guards, canonical typing, or direct interfaces.'
            });
          }
        };
        return {
          TSAsExpression: verifyNode,
          TSTypeAssertion: verifyNode
        };
      }
    },

    'no-legacy-date': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids legacy Date constructors (new Date() and Date.now()) in favor of Temporal API'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          NewExpression(node: OxlintAstNode) {
            const callee = node.callee;
            if (
              callee &&
              (callee.name === 'Date' || (callee.type === 'Identifier' && callee.name === 'Date'))
            ) {
              context.report({
                node,
                message:
                  'Using new Date() is STRICTLY PROHIBITED. Use modern Temporal API (Temporal.Now.instant() / Temporal.Instant).'
              });
            }
          },
          CallExpression(node: OxlintAstNode) {
            const callee = node.callee;
            if (callee && (callee.type === 'MemberExpression' || callee.object)) {
              const obj = callee.object;
              const prop = callee.property;
              if (
                (obj?.name === 'Date' || (obj?.type === 'Identifier' && obj.name === 'Date')) &&
                (prop?.name === 'now' || (prop?.type === 'Identifier' && prop.name === 'now'))
              ) {
                context.report({
                  node,
                  message:
                    'Using Date.now() is STRICTLY PROHIBITED. Use Temporal.Now.instant().epochMilliseconds or performance.now().'
                });
              }
            }
          }
        };
      }
    },

    'no-unbranded-id': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids domain identifier aliases (type XId = string) without nominal Brand'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          TSTypeAliasDeclaration(node: OxlintAstNode) {
            const typeName = node.id?.name;
            if (!typeName || !/^[A-Z]\w*Id$/.test(typeName)) return;

            const typeAnn = node.typeAnnotation;
            if (typeAnn?.type === 'TSStringKeyword') {
              context.report({
                node,
                message: `Domain identifier '${typeName}' must not be a bare string. Use Brand<string, '${typeName}'> or a canonical union.`
              });
            }
          }
        };
      }
    },

    'no-json-clone': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids JSON.parse(JSON.stringify(...)) in favor of structuredClone() or functional factories'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          CallExpression(node: OxlintAstNode) {
            const callee = node.callee;
            if (!callee || (callee.name !== 'parse' && callee.property?.name !== 'parse')) return;
            if (callee.object?.name !== 'JSON') return;

            const args = node.arguments ?? [];
            if (args.length > 0) {
              const firstArg = args[0];
              if (firstArg?.type === 'CallExpression') {
                const innerCallee = firstArg.callee;
                if (
                  innerCallee?.object?.name === 'JSON' &&
                  (innerCallee.name === 'stringify' || innerCallee.property?.name === 'stringify')
                ) {
                  context.report({
                    node,
                    message:
                      'Using JSON.parse(JSON.stringify(...)) is PROHIBITED due to O(N) overhead. Use structuredClone() or factory functions.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-redundant-spread-return': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids shallow spread returns return [...arr] when array is already immutable'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          ReturnStatement(node: OxlintAstNode) {
            const arg = node.argument;
            if (arg?.type === 'ArrayExpression') {
              const elements = arg.elements ?? [];
              if (elements.length === 1 && elements[0]?.type === 'SpreadElement') {
                context.report({
                  node,
                  message:
                    'Redundant spread return with return [...arr]. Return the array directly or mark it as readonly T[].'
                });
              }
            }
          }
        };
      }
    },

    'no-boolean-literal-annotation': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids explicit boolean literal type annotations (: true or : false)'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          TSTypeAnnotation(node: OxlintAstNode) {
            const inner = node.typeAnnotation;
            if (!inner) return;

            const isLiteralBool =
              (inner.type === 'TSLiteralType' && typeof inner.literal?.value === 'boolean') ||
              inner.type === 'TSTrueKeyword' ||
              inner.type === 'TSFalseKeyword';

            if (isLiteralBool) {
              context.report({
                node,
                message:
                  'Redundant literal annotation (: true or : false). Use : boolean or type inference by assignment.'
              });
            }
          }
        };
      }
    },

    'no-async-in-computed': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids async callbacks inside computed() in Vue 3'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          CallExpression(node: OxlintAstNode) {
            const callee = node.callee;
            if (!callee || (callee.name !== 'computed' && callee.property?.name !== 'computed')) {
              return;
            }

            const args = node.arguments ?? [];
            if (args.length > 0) {
              const callback = args[0];
              if (
                callback &&
                (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')
              ) {
                if (callback.async) {
                  context.report({
                    node,
                    message:
                      'Async callback in computed() is prohibited. computed does not unwrap promises; use watchEffect or VueUse computedAsync.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'watch-reactive-property-getter': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Requires getter function () => props.foo when watching reactive properties in watch()'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          CallExpression(node: OxlintAstNode) {
            const callee = node.callee;
            if (!callee || (callee.name !== 'watch' && callee.property?.name !== 'watch')) {
              return;
            }

            const args = node.arguments ?? [];
            if (args.length > 0) {
              const target = args[0];
              if (target?.type === 'MemberExpression') {
                const obj = target.object;
                if (obj?.name === 'props' || obj?.type === 'Identifier' && obj.name === 'props') {
                  context.report({
                    node,
                    message:
                      'Direct observation of props property in watch(). Use a getter function watch(() => props.property, ...) to preserve reactivity.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-destructured-reactive': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids destructuring reactive() objects directly without toRefs()'
        }
      },
      create(context: OxlintRuleContext) {
        return {
          VariableDeclarator(node: OxlintAstNode) {
            if (node.id?.type === 'ObjectPattern') {
              const init = node.init;
              if (init?.type === 'CallExpression') {
                const callee = init.callee;
                if (callee?.name === 'reactive' || callee?.property?.name === 'reactive') {
                  context.report({
                    node,
                    message:
                      'Direct destructuring of reactive() is prohibited without toRefs(). Wrap object with toRefs() to preserve reactivity.'
                  });
                }
              }
            }
          }
        };
      }
    }
  }
};

export default domainTypeOxlintPlugin;
