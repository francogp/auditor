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
 * 14. no-store-destructuring-without-storetorefs: Forbids destructuring Pinia stores without storeToRefs().
 * 15. no-direct-state-mutation-outside-actions: Forbids direct assignment to store.$state.
 * 16. no-deprecated-router-next: Forbids 3-parameter (to, from, next) navigation guards in Vue Router 4.
 * 17. no-define-async-component-in-router: Forbids wrapping route components with defineAsyncComponent.
 * 18. no-window-location-navigation: Forbids hard window.location navigation for internal SPA routes.
 * 19. no-silent-promise-catch: Forbids silent .catch() that swallows promise errors.
 * 20. no-silent-mock-fallbacks: Forbids Valibot v.fallback() silently masking schema errors.
 * 21. strict-catch-narrowing: Requires explicit type narrowing (instanceof Error) on caught exceptions.
 * 22. dom-event-leak: Detects addEventListener without cleanup or once: true.
 * 23. interval-leak: Detects setInterval without clearInterval.
 * 24. no-boolean-trap-parameters: Forbids multiple positional boolean parameters in function signatures.
 * 25. no-massive-switch: Forbids switch statements with > 10 case branches.
 * 26. no-tautological-integration-mocks: Forbids mocking database or core execution engines in tests.
 * 27. playwright-id-locators-only: Enforces 100% ID-based locators in E2E simulations.
 * 28. no-playwright-force-click: Forbids force click in Playwright simulations.
 * 29. no-test-timeout-inflation: Forbids inflating test timeouts (>= 30000ms) to mask slowness.
 * 30. no-playwright-polling-waits: Forbids page.waitForTimeout() in simulations.
 * 31. script-setup-required: Requires Vue 3 SFCs to use Composition API with script setup.
 * 32. vue-template-quote-escaping: Forbids escaped quotes inside Vue template attribute bindings.
 * 33. no-data-provider-in-template: Forbids calling data providers directly inside Vue template expressions.
 * 34. no-raw-html-injection: Forbids HTML injection via v-html or innerHTML.
 * 35. no-insecure-random: Forbids Math.random() for sensitive tokens, IDs or cryptography.
 * 36. no-permissive-cors: Forbids wildcard '*' in Access-Control-Allow-Origin.
 * 37. no-unvalidated-redirect: Forbids open redirects with unvalidated parameters.
 *
 * All rules strictly inspect AST nodes without bypass comments (Zero-Ignore Mandate).
 * INVARIANT: Zero hardcoded directory names or folder paths. Rules MUST be pure AST visitors;
 * scoping belongs 100% to SSoT (.auditor/audit.config.ts.paths) and DYNAMIC_*_OFF_RULES.
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
  readonly params?: readonly OxlintAstNode[];
  readonly body?: OxlintAstNode | readonly OxlintAstNode[];
  readonly key?: OxlintAstNode;
  readonly left?: OxlintAstNode;
  readonly right?: OxlintAstNode;
  readonly param?: OxlintAstNode;
  readonly quasis?: readonly {
    readonly value?: { readonly raw?: string; readonly cooked?: string };
  }[];
  readonly expressions?: readonly OxlintAstNode[];
  readonly operator?: string;
  readonly source?: { readonly value?: string };
  readonly superClass?: { readonly name?: string };
  readonly properties?: readonly OxlintAstNode[];
  readonly cases?: readonly OxlintAstNode[];
  readonly declaration?: OxlintAstNode;
}

export type OxlintRuleListener = Record<string, (node: OxlintAstNode) => void>;

export type OxlintCommentNode = string | { readonly value?: string };

export interface OxlintReportDescriptor {
  readonly node: unknown;
  readonly message: string;
}

export interface OxlintRuleContext {
  filename?: string;
  getFilename?(): string;
  report(descriptor: OxlintReportDescriptor): void;
  getSourceCode?(): {
    getText(node?: unknown): string;
    getCommentsBefore?(node?: unknown): readonly OxlintCommentNode[];
    getCommentsAfter?(node?: unknown): readonly OxlintCommentNode[];
  };
}

export const CANONICAL_INFRA_ID_WHITELIST = [
  'suiteId',
  'ruleId',
  'runId',
  'buildId',
  'eslintRuleId',
  'taskId',
  'sessionId',
  'shortId'
] as const;

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

function isGsapCall(
  node: OxlintAstNode,
  methods: readonly string[] = ['to', 'from', 'fromTo']
): boolean {
  const callee = node.callee;
  return (
    callee?.type === 'MemberExpression' &&
    (callee.object?.name === 'gsap' || callee.object?.name === 'tl') &&
    methods.includes(callee.property?.name ?? '')
  );
}

function getNodePropKeyName(node: OxlintAstNode): string {
  const p = node as { key?: { name?: string; value?: unknown } };
  return p.key?.name ?? (typeof p.key?.value === 'string' ? p.key.value : '');
}

export const NON_DOMAIN_COLLECTION_KEYWORDS: ReadonlySet<string> = new Set([
  'lines',
  'parts',
  'chunks',
  'words',
  'tokens',
  'classes',
  'errors',
  'warnings',
  'achievements',
  'logs',
  'results',
  'missing',
  'args',
  'flags',
  'files',
  'entries',
  'rows',
  'queries',
  'messages',
  'diffs',
  'patterns',
  'findings',
  'details',
  'dirs',
  'paths',
  'roots',
  'globs',
  'labels',
  'violations',
  'items',
  'commands',
  'scripts',
  'headers',
  'steps',
  'rules',
  'types',
  'extensions',
  'modules',
  'sections',
  'subtitles',
  'names',
  'codes',
  'tags',
  'candidates',
  'res',
  'list',
  'arr',
  'output',
  'buffer',
  'elements',
  'records',
  'sources',
  'targets',
  'params',
  'values',
  'keys',
  'props',
  'attributes',
  'variants',
  'aliases',
  'skills',
  'identifiers',
  'langs',
  'languages',
  'terms',
  'acronyms',
  'stopwords',
  'ids',
  'binaries',
  'packages',
  'constants',
  'chars',
  'nodes',
  'specs',
  'options',
  'methods'
]);

export const NON_DOMAIN_COLLECTION_REGEX = new RegExp(
  `\\b\\w*(?:${Array.from(NON_DOMAIN_COLLECTION_KEYWORDS).join('|')})\\b`,
  'i'
);

function getRuleContextFilename(context: OxlintRuleContext): string {
  const raw = context.filename || (context.getFilename ? context.getFilename() : '');
  return raw ? raw.split('\\').join('/') : '';
}

function isJsModuleFilename(fname: string): boolean {
  return (
    Boolean(fname) && (fname.endsWith('.js') || fname.endsWith('.cjs') || fname.endsWith('.mjs'))
  );
}

function unwrapBroadArrayExpression(init: OxlintAstNode | undefined): OxlintAstNode | undefined {
  if (!init) return undefined;
  if (init.type === 'TSAsExpression') {
    const isConst =
      init.typeAnnotation?.type === 'TSTypeReference' &&
      init.typeAnnotation.typeName?.name === 'const';
    return isConst ? undefined : init.expression;
  }
  return init;
}

function isStringLiteralArrayExpression(expr: OxlintAstNode | undefined): boolean {
  if (expr?.type !== 'ArrayExpression') return false;
  const elements = expr.elements ?? [];
  return (
    elements.length > 0 &&
    elements.every(
      (el: OxlintAstNode | null) => el?.type === 'Literal' && typeof el.value === 'string'
    )
  );
}

function isMutatedOrTypedStringBuffer(node: OxlintAstNode, context: OxlintRuleContext): boolean {
  const idType = node.id?.typeAnnotation?.typeAnnotation;
  if (idType && idType.type !== 'TSArrayType') return true;
  if (idType?.type === 'TSArrayType' && idType.elementType?.type === 'TSStringKeyword') {
    return true;
  }
  const varName = node.id?.type === 'Identifier' ? (node.id.name ?? '') : '';
  if (!varName || !context.getSourceCode) return false;
  const sourceText = context.getSourceCode().getText();
  return (
    sourceText.includes(`${varName}.push(`) ||
    sourceText.includes(`${varName}.unshift(`) ||
    sourceText.includes(`${varName}.splice(`)
  );
}

function hasEventListenerOnceOption(args: readonly OxlintAstNode[]): boolean {
  if (args.length < 3) return false;
  const opt = args[2] as {
    type?: string;
    properties?: readonly { key?: OxlintAstNode; value?: OxlintAstNode }[];
  };
  if (opt?.type !== 'ObjectLiteralExpression' && opt?.type !== 'ObjectExpression') return false;
  return Boolean(
    opt.properties?.some((p) => {
      const k = p.key?.name || (p.key as { value?: unknown })?.value;
      const v = (p.value as { value?: unknown })?.value;
      return k === 'once' && v === true;
    })
  );
}

function isDomEventLeakExemptSource(fullText: string): boolean {
  if (
    fullText.includes('defineStore(') ||
    fullText.includes('createApp(') ||
    fullText.includes('.mount(') ||
    fullText.includes('export function initGlobal')
  ) {
    return true;
  }
  return (
    fullText.includes('removeEventListener') ||
    fullText.includes('cleanWorkerListener') ||
    fullText.includes('onUnmounted') ||
    fullText.includes('onBeforeUnmount') ||
    fullText.includes('onScopeDispose')
  );
}

function isInsideLocateFileProperty(node: OxlintAstNode): boolean {
  let ancestor = node.parent;
  let ancDepth = 0;
  while (ancestor && ancDepth < 5) {
    if (ancestor.type === 'Property' && ancestor.key?.name === 'locateFile') {
      return true;
    }
    ancestor = ancestor.parent;
    ancDepth++;
  }
  return false;
}

const AUDITOR_RULE_SIBLING_KEYS: ReadonlySet<string> = new Set<string>([
  'remediationPhase',
  'defaultSeverity',
  'fixable',
  'ruleId',
  'suiteId',
  'ruleDescriptions',
  'ruleRemediations',
  'ruleCapabilities'
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          TSUnionType(node: OxlintAstNode): void {
            const types = node.types ?? [];
            const hasStringKeyword = types.some((t: OxlintAstNode) => t.type === 'TSStringKeyword');
            if (!hasStringKeyword) return;

            const BUILTIN_TYPES = new Set([
              'Buffer',
              'Uint8Array',
              'ArrayBuffer',
              'Blob',
              'Error',
              'RegExp',
              'Date',
              'URL',
              'Promise',
              'Record',
              'Array',
              'Set',
              'Map',
              'NodeJS',
              'Iterable',
              'AsyncIterable',
              'Iterator',
              'AsyncIterator',
              'ReadonlyArray',
              'ReadonlySet',
              'ReadonlyMap',
              'Generator',
              'AsyncGenerator'
            ]);

            const hasDilutedDomainType = types.some((t: OxlintAstNode) => {
              if (t.type === 'TSLiteralType' && typeof t.literal?.value === 'string') return true;
              if (t.type === 'TSTemplateLiteralType') return true;
              if (t.type === 'TSTypeReference') {
                const name = t.typeName?.name;
                if (!name || BUILTIN_TYPES.has(name)) return false;
                const isDomainLikeType =
                  /(?:Id|Key|Type|Kind|Mode|Status|State|Phase|Tier|Role|Category|Code|Name|Slot|Variant|Scope|Level|Format|Target|Source|Engine|Provider)$/.test(
                    name
                  );
                return isDomainLikeType;
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          TSTypeReference(node: OxlintAstNode): void {
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          NewExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (!callee || (callee.name !== 'Set' && callee.name !== 'Map')) return;

            const parent = node.parent;
            const varName = parent?.id?.name ?? parent?.key?.name ?? '';
            if (
              varName &&
              (NON_DOMAIN_COLLECTION_REGEX.test(varName) ||
                COMMON_NON_DOMAIN_SET_NAMES.has(varName.toUpperCase()))
            ) {
              return;
            }

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
          description: 'Forbids string literal arrays without as const or canonical domain typing'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          VariableDeclarator(node: OxlintAstNode): void {
            if (isJsModuleFilename(getRuleContextFilename(context))) return;
            const arrayExpr = unwrapBroadArrayExpression(node.init);
            if (!isStringLiteralArrayExpression(arrayExpr)) return;
            if (!isMutatedOrTypedStringBuffer(node, context)) {
              context.report({
                node,
                message:
                  'String literal array declared without `as const`. Add `as const` or type with a canonical domain.'
              });
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
      create(context: OxlintRuleContext): OxlintRuleListener {
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          NewExpression(node: OxlintAstNode): void {
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
          CallExpression(node: OxlintAstNode): void {
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
          description: 'Forbids domain identifier aliases (type XId = string) without nominal Brand'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          TSTypeAliasDeclaration(node: OxlintAstNode): void {
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          ReturnStatement(node: OxlintAstNode): void {
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
          description: 'Forbids explicit boolean literal type annotations (: true or : false)'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          TSTypeAnnotation(node: OxlintAstNode): void {
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
          description: 'Forbids async callbacks inside computed() in Vue 3'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (!callee || (callee.name !== 'computed' && callee.property?.name !== 'computed')) {
              return;
            }

            const args = node.arguments ?? [];
            if (args.length > 0) {
              const callback = args[0];
              if (
                callback &&
                (callback.type === 'ArrowFunctionExpression' ||
                  callback.type === 'FunctionExpression')
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
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (!callee || (callee.name !== 'watch' && callee.property?.name !== 'watch')) {
              return;
            }

            const args = node.arguments ?? [];
            if (args.length > 0) {
              const target = args[0];
              if (target?.type === 'MemberExpression') {
                const obj = target.object;
                if (obj?.name === 'props' || (obj?.type === 'Identifier' && obj.name === 'props')) {
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
          description: 'Forbids destructuring reactive() objects directly without toRefs()'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          VariableDeclarator(node: OxlintAstNode): void {
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
    },

    'no-store-destructuring-without-storetorefs': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids destructuring Pinia stores directly without storeToRefs()'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        const storeIdentifiers = new Set<string>();
        return {
          VariableDeclarator(node: OxlintAstNode): void {
            if (node.id?.type === 'ObjectPattern') {
              const init = node.init;
              if (init?.type === 'CallExpression') {
                const callee = init.callee;
                const calleeName = callee?.name || callee?.property?.name;
                if (typeof calleeName === 'string' && /^use[A-Z]\w*Store$/.test(calleeName)) {
                  context.report({
                    node,
                    message: `Direct destructuring of Pinia store '${calleeName}()' strips reactivity. Wrap with 'storeToRefs(${calleeName}())' or access properties on the store instance.`
                  });
                  return;
                }
              }
              if (
                init?.type === 'Identifier' &&
                typeof init.name === 'string' &&
                storeIdentifiers.has(init.name)
              ) {
                context.report({
                  node,
                  message: `Indirect destructuring of Pinia store '${init.name}' strips reactivity. Wrap with 'storeToRefs(${init.name})' or access properties on the store instance.`
                });
                return;
              }
            } else if (node.id?.type === 'Identifier' && typeof node.id.name === 'string') {
              if (node.init?.type === 'CallExpression') {
                const callee = node.init.callee;
                const calleeName = callee?.name || callee?.property?.name;
                if (typeof calleeName === 'string' && /^use[A-Z]\w*Store$/.test(calleeName)) {
                  storeIdentifiers.add(node.id.name);
                }
              }
            }
          }
        };
      }
    },

    'no-direct-state-mutation-outside-actions': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids direct assignment to store.$state outside actions or persistence coordinators'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          AssignmentExpression(node: OxlintAstNode): void {
            const left = node.left;
            if (left?.type === 'MemberExpression') {
              const isDirectState = left.property?.name === '$state';
              const isNestedState =
                left.object?.type === 'MemberExpression' && left.object.property?.name === '$state';
              if (isDirectState || isNestedState) {
                context.report({
                  node,
                  message:
                    'Direct state mutation via store.$state is PROHIBITED. Mutate state through store actions, $patch(), or dedicated persistence coordinators.'
                });
              }
            }
          }
        };
      }
    },

    'no-deprecated-router-next': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids deprecated 3-parameter next() in Vue Router navigation guards'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        const ROUTER_GUARD_METHODS = new Set([
          'beforeEach',
          'beforeResolve',
          'afterEach',
          'beforeEnter'
        ]);
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const methodName = callee?.name || callee?.property?.name;
            if (typeof methodName === 'string' && ROUTER_GUARD_METHODS.has(methodName)) {
              const args = node.arguments ?? [];
              if (args.length > 0) {
                const callback = args[0];
                if (
                  callback &&
                  (callback.type === 'ArrowFunctionExpression' ||
                    callback.type === 'FunctionExpression')
                ) {
                  if ((callback.params ?? []).length >= 3) {
                    context.report({
                      node: callback,
                      message: `Deprecated 3-parameter '(to, from, next)' guard in Vue Router '${methodName}'. Navigation guards must return boolean or route location in Vue Router 4.`
                    });
                  }
                }
              }
            }
          }
        };
      }
    },

    'no-define-async-component-in-router': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids wrapping router route components with defineAsyncComponent'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Property(node: OxlintAstNode): void {
            const key = node.key;
            if ((key?.name || (key as { value?: unknown })?.value) === 'component') {
              const value = (node as { value?: OxlintAstNode }).value;
              if (value?.type === 'CallExpression') {
                const callee = value.callee;
                if ((callee?.name || callee?.property?.name) === 'defineAsyncComponent') {
                  context.report({
                    node,
                    message:
                      "Wrapping route component with 'defineAsyncComponent' is prohibited. Vue Router 4 natively supports dynamic imports '() => import(...)'. "
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-window-location-navigation': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids hard window.location navigation for internal SPA routes'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        function isRelativePathLiteral(valNode: unknown): boolean {
          if (!valNode || typeof valNode !== 'object') return false;
          const literal = valNode as { type?: string; value?: unknown };
          if (literal.type === 'Literal' && typeof literal.value === 'string') {
            const v = literal.value;
            return v.startsWith('/') && !v.startsWith('//');
          }
          return false;
        }
        return {
          AssignmentExpression(node: OxlintAstNode): void {
            const left = node.left;
            if (left?.type === 'MemberExpression') {
              if (
                left.property?.name === 'href' &&
                (left.object?.name === 'location' ||
                  (left.object?.type === 'MemberExpression' &&
                    left.object.property?.name === 'location')) &&
                isRelativePathLiteral(node.right)
              ) {
                context.report({
                  node,
                  message:
                    "Using 'window.location.href' for internal SPA navigation destroys client state. Use router.push() or <RouterLink>."
                });
              }
            }
          },
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression') {
              const isLocationAssign =
                callee.property?.name === 'assign' &&
                (callee.object?.name === 'location' ||
                  (callee.object?.type === 'MemberExpression' &&
                    callee.object.property?.name === 'location'));
              const args = node.arguments ?? [];
              if (isLocationAssign && args.length > 0 && isRelativePathLiteral(args[0])) {
                context.report({
                  node,
                  message:
                    "Using 'window.location.assign()' for internal SPA navigation destroys client state. Use router.push() or <RouterLink>."
                });
              }
            }
          }
        };
      }
    },

    'no-silent-promise-catch': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids silent promise catches that swallow rejections'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'catch') {
              const args = node.arguments ?? [];
              if (args.length > 0) {
                const handler = args[0];
                if (
                  handler &&
                  (handler.type === 'ArrowFunctionExpression' ||
                    handler.type === 'FunctionExpression')
                ) {
                  const body = handler.body;
                  const bodyNode =
                    body && !Array.isArray(body) ? (body as OxlintAstNode) : undefined;
                  const innerBody = bodyNode?.body;
                  const blockStatements = Array.isArray(innerBody) ? innerBody : [];
                  const isEmptyBlock =
                    bodyNode?.type === 'BlockStatement' && blockStatements.length === 0;
                  const isNullOrUndefined = bodyNode?.type === 'Literal' && bodyNode.value === null;
                  const isUndefinedIdent =
                    bodyNode?.type === 'Identifier' && bodyNode.name === 'undefined';

                  if (isEmptyBlock || isNullOrUndefined || isUndefinedIdent) {
                    context.report({
                      node,
                      message:
                        "Silent promise rejection handler '.catch(...)' suppresses errors. Log the error or rethrow."
                    });
                  }
                }
              }
            }
          }
        };
      }
    },

    'no-silent-mock-fallbacks': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids Valibot v.fallback() silently masking schema errors'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const isVFallback =
              callee?.type === 'MemberExpression' &&
              callee.object?.name === 'v' &&
              callee.property?.name === 'fallback';
            const isDirectFallback = callee?.type === 'Identifier' && callee.name === 'fallback';
            if (isVFallback || isDirectFallback) {
              context.report({
                node,
                message:
                  "Using Valibot 'fallback()' or 'v.fallback()' is PROHIBITED. Fail loud at boundaries rather than silently healing invalid schema data."
              });
            }
          }
        };
      }
    },

    'strict-catch-narrowing': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Requires explicit type narrowing before accessing caught error properties'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CatchClause(node: OxlintAstNode): void {
            const param = node.param;
            if (!param || param.type !== 'Identifier' || typeof param.name !== 'string') return;
            const errParamName = param.name;

            const bodyText = context.getSourceCode
              ? context.getSourceCode().getText(node.body)
              : '';
            const accessesMessageOrCode =
              bodyText.includes(`${errParamName}.message`) ||
              bodyText.includes(`${errParamName}.code`) ||
              bodyText.includes(`${errParamName}.stack`);

            const hasInstanceOfNarrowing =
              bodyText.includes(`${errParamName} instanceof Error`) ||
              bodyText.includes(`instanceof Error`);

            if (accessesMessageOrCode && !hasInstanceOfNarrowing) {
              context.report({
                node: node.param,
                message: `Caught exception '${errParamName}' accessed (.message/.code) without type narrowing. Narrow with 'if (${errParamName} instanceof Error)' first.`
              });
            }
          }
        };
      }
    },

    'dom-event-leak': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Detects addEventListener without cleanup or once: true'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        const PROCESS_LIFETIME_EVENTS = new Set([
          'beforeunload',
          'unload',
          'pagehide',
          'pageshow',
          'error',
          'unhandledrejection',
          'rejectionhandled',
          'vite:preloadError',
          'DOMContentLoaded',
          'load',
          'online',
          'offline',
          'session-conflict'
        ]);
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (
              callee?.type === 'MemberExpression' &&
              callee.property?.name === 'addEventListener'
            ) {
              if (callee.object?.name === 'self') {
                return;
              }
              const fname = getRuleContextFilename(context);
              if (fname.endsWith('.worker.ts') || fname.endsWith('.worker.js')) {
                return;
              }
              const args = node.arguments ?? [];
              const firstArg = args[0];
              if (
                firstArg?.type === 'Literal' &&
                typeof firstArg.value === 'string' &&
                PROCESS_LIFETIME_EVENTS.has(firstArg.value)
              ) {
                return;
              }
              if (hasEventListenerOnceOption(args)) return;

              const fullText = context.getSourceCode ? context.getSourceCode().getText() : '';
              if (!isDomEventLeakExemptSource(fullText)) {
                context.report({
                  node,
                  message:
                    "Potential DOM event listener leak: 'addEventListener' attached without '{ once: true }', 'removeEventListener', or 'onUnmounted()' lifecycle cleanup."
                });
              }
            }
          }
        };
      }
    },

    'interval-leak': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Detects setInterval without matching clearInterval or cleanup'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const isSetInterval =
              callee?.name === 'setInterval' ||
              (callee?.type === 'MemberExpression' && callee.property?.name === 'setInterval');

            if (isSetInterval) {
              const fullText = context.getSourceCode ? context.getSourceCode().getText() : '';
              const hasClearInterval = fullText.includes('clearInterval');
              if (!hasClearInterval) {
                context.report({
                  node,
                  message:
                    "Potential timer leak: 'setInterval' invoked without a matching 'clearInterval'. Store the timer ID and clear it on unmount."
                });
              }
            }
          }
        };
      }
    },

    'no-boolean-trap-parameters': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids multiple positional boolean parameters in function signatures'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        function checkParams(node: OxlintAstNode): void {
          const params = (node.params ?? []) as readonly {
            type?: string;
            typeAnnotation?: { typeAnnotation?: { type?: string }; type?: string };
            parameter?: { typeAnnotation?: { typeAnnotation?: { type?: string } } };
          }[];
          let booleanCount = 0;
          for (const param of params) {
            const typeAnnotation =
              param.typeAnnotation?.typeAnnotation?.type ?? param.typeAnnotation?.type;
            const nestedType = param.parameter?.typeAnnotation?.typeAnnotation?.type;
            if (typeAnnotation === 'TSBooleanKeyword' || nestedType === 'TSBooleanKeyword') {
              booleanCount++;
            }
          }
          if (booleanCount >= 2) {
            context.report({
              node,
              message:
                'Positional boolean parameters detected (multiple boolean arguments). Refactor multiple boolean flags into a typed options object with named properties.'
            });
          }
        }
        return {
          FunctionDeclaration: checkParams,
          FunctionExpression: checkParams,
          ArrowFunctionExpression: checkParams
        };
      }
    },

    'no-massive-switch': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids switch statements with excessive case branches'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          SwitchStatement(node: OxlintAstNode): void {
            const cases = (node as { cases?: readonly unknown[] }).cases ?? [];
            if (cases.length > 10) {
              context.report({
                node,
                message: `Massive switch statement (${cases.length} cases) detected. Refactor branches into a domain map table or strategy handlers.`
              });
            }
          }
        };
      }
    },

    'no-tautological-integration-mocks': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids mocking database or core execution engines in tests'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.object?.name === 'vi') {
              const method = callee.property?.name;
              if (method === 'mock' || method === 'spyOn') {
                const firstArg = node.arguments?.[0] as { value?: unknown };
                const target = typeof firstArg?.value === 'string' ? firstArg.value : '';
                const isForbiddenTarget = /supabase|database|\bdb\b|persistence|repository/i.test(
                  target
                );
                if (isForbiddenTarget) {
                  context.report({
                    node,
                    message: `Tautological mock detected. Mocking core execution engine '${target}' is strictly forbidden.`
                  });
                }
              }
            }
          }
        };
      }
    },

    'playwright-id-locators-only': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Enforces 100% ID-based locators in E2E simulations'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression') {
              const methodName = callee.property?.name;
              if (methodName === 'getByText') {
                context.report({
                  node,
                  message:
                    "Text-based locator 'getByText' detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id=\"...\"]', '[data-testid=\"...\"]')."
                });
                return;
              }
              if (methodName === 'getByRole') {
                const secondArg = node.arguments?.[1] as {
                  properties?: readonly { key?: { name?: string } }[];
                };
                const hasName = secondArg?.properties?.some((p) => p.key?.name === 'name');
                if (hasName) {
                  context.report({
                    node,
                    message:
                      "Text-based locator 'getByRole' with name detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id=\"...\"]', '[data-testid=\"...\"]')."
                  });
                  return;
                }
              }
              if (methodName === 'locator' || methodName === 'click' || methodName === 'dblclick') {
                const firstArg = node.arguments?.[0] as { value?: unknown };
                if (typeof firstArg?.value === 'string') {
                  const text = firstArg.value;
                  if (text.startsWith(':has-text(') || text.startsWith('text=')) {
                    context.report({
                      node,
                      message:
                        "Text-based locator detected in E2E spec. Project policy requires 100% ID-based locators ('#id', '[id=\"...\"]', '[data-testid=\"...\"]')."
                    });
                  }
                }
              }
            }
          }
        };
      }
    },

    'no-playwright-force-click': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids force click in Playwright simulations'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression') {
              const method = callee.property?.name;
              if (method === 'click' || method === 'dblclick') {
                const args = node.arguments ?? [];
                for (const arg of args) {
                  const props = (
                    arg as {
                      properties?: readonly {
                        key?: { name?: string };
                        value?: { value?: unknown };
                      }[];
                    }
                  )?.properties;
                  if (props?.some((p) => p.key?.name === 'force' && p.value?.value === true)) {
                    context.report({
                      node,
                      message:
                        'Force click ({ force: true }) detected in E2E simulation. Interactivity checks must pass naturally.'
                    });
                    break;
                  }
                }
              }
            }
          }
        };
      }
    },

    'no-test-timeout-inflation': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids inflating test timeouts to mask slowness'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const args = node.arguments ?? [];
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'setTimeout') {
              const firstArg = args[0] as { value?: unknown };
              if (typeof firstArg?.value === 'number' && firstArg.value >= 30000) {
                context.report({
                  node,
                  message: `Test timeout inflation detected (${firstArg.value}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`
                });
                return;
              }
            }
            const isTestFn =
              (callee?.type === 'Identifier' && (callee.name === 'it' || callee.name === 'test')) ||
              (callee?.type === 'MemberExpression' &&
                (callee.property?.name === 'it' || callee.property?.name === 'test'));
            if (isTestFn && args.length >= 3) {
              const lastArg = args[args.length - 1] as { value?: unknown };
              if (typeof lastArg?.value === 'number' && lastArg.value >= 30000) {
                context.report({
                  node,
                  message: `Test timeout inflation detected (${lastArg.value}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`
                });
              }
            }
          },
          Property(node: OxlintAstNode): void {
            const key = (node as { key?: { name?: string }; value?: { value?: unknown } }).key;
            const value = (node as { value?: { value?: unknown } }).value;
            if (
              (key?.name === 'testTimeout' || key?.name === 'timeout') &&
              typeof value?.value === 'number' &&
              value.value >= 30000
            ) {
              const parentObj = node.parent;
              const grandParent = parentObj?.parent;
              if (grandParent) {
                if (grandParent.type !== 'CallExpression') {
                  return;
                }
                const callee = grandParent.callee;
                const calleeName =
                  callee?.type === 'Identifier'
                    ? callee.name
                    : callee?.type === 'MemberExpression'
                      ? callee.property?.name
                      : undefined;
                if (
                  calleeName !== 'describe' &&
                  calleeName !== 'it' &&
                  calleeName !== 'test' &&
                  calleeName !== 'suite'
                ) {
                  return;
                }
              }
              context.report({
                node,
                message: `Test timeout inflation detected (${value.value}ms). Extending test timeouts to mask slowness or contention is strictly forbidden.`
              });
            }
          }
        };
      }
    },

    'no-playwright-polling-waits': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids page.waitForTimeout() in simulations'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'waitForTimeout') {
              context.report({
                node,
                message:
                  "Artificial sleep 'page.waitForTimeout()' detected. Simulations must synchronize via reactive events or locator assertions."
              });
            }
          }
        };
      }
    },

    'script-setup-required': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Requires Vue 3 SFCs to use Composition API with script setup'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          ExportDefaultDeclaration(node: OxlintAstNode): void {
            const filename = context.filename || (context.getFilename ? context.getFilename() : '');
            if (filename && !filename.endsWith('.vue')) return;
            const decl = (node as { declaration?: { type?: string } }).declaration;
            if (decl?.type === 'ObjectExpression') {
              context.report({
                node,
                message:
                  'Options API detected. Vue 3 SFCs must strictly standardize on Composition API via <script setup>.'
              });
            }
          }
        };
      }
    },

    'vue-template-quote-escaping': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids escaped quotes inside Vue template attribute bindings'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Program(node: OxlintAstNode): void {
            const filename = context.filename || (context.getFilename ? context.getFilename() : '');
            if (filename && !filename.endsWith('.vue')) return;
            const source = context.getSourceCode ? context.getSourceCode().getText() : '';
            if (/(?:\s:|\bv-bind:)[\w-]+="[^"\n]*\\"[^"\n]*"/.test(source)) {
              context.report({
                node,
                message:
                  'Escaped quotes detected inside Vue template bindings. Clean and simplify template attributes.'
              });
            }
          }
        };
      }
    },

    'no-data-provider-in-template': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids calling data providers directly inside Vue template expressions'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const fname = getRuleContextFilename(context);
            if (fname && !fname.endsWith('.vue')) {
              return;
            }
            const sourceCode = context.getSourceCode?.()?.getText() ?? '';
            const templateMatch = /<template[\s>]/i.exec(sourceCode);
            const templateEnd = sourceCode.lastIndexOf('</template>');
            const templateStart = templateMatch ? templateMatch.index : -1;
            if (!templateMatch || templateStart < 0 || templateEnd <= templateStart) {
              return;
            }
            if (node.range) {
              const start = node.range[0];
              if (start < templateStart || start > templateEnd) {
                return;
              }
            }

            const callee = node.callee;
            if (callee?.type === 'MemberExpression') {
              const objName = callee.object?.name;
              if (
                typeof objName === 'string' &&
                (objName === 'dataProvider' || objName.endsWith('DataProvider'))
              ) {
                context.report({
                  node,
                  message: `Heavy data provider invocation '${objName}' detected in template. Compute or resolve data in <script setup>.`
                });
              }
            }
          }
        };
      }
    },

    'no-raw-html-injection': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids HTML injection via v-html or innerHTML'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          AssignmentExpression(node: OxlintAstNode): void {
            const left = (node as { left?: { type?: string; property?: { name?: string } } }).left;
            if (left?.type === 'MemberExpression') {
              const prop = left.property?.name;
              if (prop === 'innerHTML' || prop === 'outerHTML') {
                context.report({
                  node,
                  message: `Direct HTML injection via '${prop}' detected. Use safe text interpolation or sanitized DOM builders to prevent XSS.`
                });
              }
            }
          },
          JSXAttribute(node: OxlintAstNode): void {
            const name = (node as { name?: { name?: string } }).name?.name;
            if (name === 'v-html' || name === 'dangerouslySetInnerHTML') {
              context.report({
                node,
                message: `Direct HTML injection via '${name}' detected. Use safe text interpolation to prevent XSS.`
              });
            }
          }
        };
      }
    },

    'no-insecure-random': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids Math.random() for sensitive tokens, IDs or cryptography'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        const SENSITIVE_CRYPTO_IDENT =
          /(?:token|secret|password|nonce|salt|auth|session|csrf|jwt|api_?key|private_?key|signature)/i;
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (
              callee?.type === 'MemberExpression' &&
              callee.object?.name === 'Math' &&
              callee.property?.name === 'random'
            ) {
              let cur = node.parent;
              let isSensitive = false;
              let depth = 0;
              while (cur && depth < 6) {
                const candidateName =
                  cur.id?.name ??
                  cur.key?.name ??
                  (typeof cur.key?.value === 'string' ? cur.key.value : undefined) ??
                  (cur.left?.type === 'Identifier' ? cur.left.name : cur.left?.property?.name);
                if (
                  typeof candidateName === 'string' &&
                  SENSITIVE_CRYPTO_IDENT.test(candidateName)
                ) {
                  isSensitive = true;
                  break;
                }
                cur = cur.parent;
                depth++;
              }
              if (!isSensitive && !node.parent) {
                const fullSource = context.getSourceCode ? context.getSourceCode().getText() : '';
                isSensitive = SENSITIVE_CRYPTO_IDENT.test(fullSource);
              }
              if (isSensitive) {
                context.report({
                  node,
                  message:
                    'Math.random() is cryptographically insecure for tokens/secrets. Use crypto.randomUUID() or crypto.getRandomValues().'
                });
              }
            }
          }
        };
      }
    },

    'no-permissive-cors': {
      meta: {
        type: 'problem',
        docs: {
          description: "Forbids wildcard '*' in Access-Control-Allow-Origin"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Property(node: OxlintAstNode): void {
            const key = (node as { key?: { name?: string; value?: unknown } }).key;
            const value = (node as { value?: { value?: unknown } }).value;
            const keyName = key?.name ?? (typeof key?.value === 'string' ? key.value : '');
            if (keyName === 'Access-Control-Allow-Origin' && value?.value === '*') {
              context.report({
                node,
                message: "Permissive CORS origin '*' detected. Explicitly declare allowed origins."
              });
            }
          }
        };
      }
    },

    'no-unvalidated-redirect': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids open redirects with unvalidated parameters'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'redirect') {
              const args = node.arguments ?? [];
              if (args.length > 0) {
                const arg = args[args.length - 1] as {
                  type?: string;
                  property?: { name?: string };
                };
                if (
                  arg?.type === 'MemberExpression' &&
                  (arg.property?.name === 'url' || arg.property?.name === 'query')
                ) {
                  context.report({
                    node,
                    message:
                      'Unvalidated open redirect detected. Validate destination URL against an allowlist before redirecting.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'valibot-schema-type-parity': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforces domain type purity and non-redundant nullability in Valibot schemas'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.object?.name === 'v') {
              const method = callee.property?.name;
              if (method === 'unknown') {
                context.report({
                  node,
                  message:
                    "Loose 'v.unknown()' schema detected. Schemas must define strict typed domain boundaries (/domain-type-first)."
                });
                return;
              }
              if (method === 'optional') {
                const args = node.arguments ?? [];
                if (args.length > 0) {
                  const inner = args[0] as {
                    type?: string;
                    callee?: {
                      type?: string;
                      object?: { name?: string };
                      property?: { name?: string };
                    };
                  };
                  if (
                    inner?.type === 'CallExpression' &&
                    inner.callee?.object?.name === 'v' &&
                    inner.callee?.property?.name === 'nullable'
                  ) {
                    context.report({
                      node,
                      message:
                        "Redundant 'v.optional(v.nullable(...))' schema nesting detected. Use either nullable or optional directly."
                    });
                  }
                }
              }
            }
          }
        };
      }
    },

    'no-redundant-constant-alias': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids redundant 1:1 constant aliases (const A = B)'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          VariableDeclarator(node: OxlintAstNode): void {
            if (
              node.id?.type === 'Identifier' &&
              node.init?.type === 'Identifier' &&
              typeof node.id.name === 'string' &&
              typeof node.init.name === 'string' &&
              node.id.name !== node.init.name
            ) {
              const idName = node.id.name;
              const initName = node.init.name;
              if (idName.length <= 2) {
                return;
              }
              if (node.parent?.parent?.type === 'ExportNamedDeclaration') {
                return;
              }
              const isUpper = /^[A-Z0-9_]+$/.test(idName) && /^[A-Z0-9_]+$/.test(initName);
              if (isUpper) {
                context.report({
                  node,
                  message: `Redundant 1:1 constant alias 'const ${idName} = ${initName}' detected. Use '${initName}' directly at call sites.`
                });
              }
            }
          }
        };
      }
    },

    'no-literal-suffix-constant': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids raw literal numeric values embedded in constant name suffixes'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          VariableDeclarator(node: OxlintAstNode): void {
            if (node.id?.type === 'Identifier' && typeof node.id.name === 'string') {
              const name = node.id.name;
              if (
                /_[0-9]+$/.test(name) &&
                !/^(?:HTTP|PORT|STATUS|CODE)_[0-9]+$/i.test(name) &&
                !/^[A-Z]_[0-9]+$/.test(name)
              ) {
                context.report({
                  node,
                  message: `Constant '${name}' includes raw literal value suffix. Name constants semantically without value-embedding suffixes.`
                });
              }
            }
          }
        };
      }
    },
    'unsafe-path-concat': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "Forbids assembling filesystem paths via string concatenation ('+', template literals)"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          TemplateLiteral(node: OxlintAstNode): void {
            const quasis = node.quasis ?? [];
            const firstRaw = quasis[0]?.value?.raw ?? '';
            // Ignore web endpoints, web protocols, data uris, git repos
            if (
              firstRaw.startsWith('/') ||
              /^(?:https?:|git\+|data:|ftp:|file:\/\/)/i.test(firstRaw)
            ) {
              return;
            }
            // Display-only relative path decoration (./${rel})
            if (
              quasis.length === 2 &&
              (firstRaw === './' || firstRaw === '../') &&
              quasis[1]?.value?.raw === ''
            ) {
              return;
            }
            const fullRaw = quasis.map((q) => q.value?.raw ?? '').join('');
            // If template contains URL query parameters (? or &), endpoint markers, or web asset extensions, it is a web URL, not a filesystem path
            if (
              fullRaw.includes('?') ||
              fullRaw.includes('&') ||
              /\/(?:api|rest|auth|embed|assets|cries|sprites|images|audio|sounds|icons|fonts|public|static|v\d+)\//i.test(
                fullRaw
              ) ||
              /\.(?:mp3|ogg|wav|png|webp|jpg|jpeg|gif|svg|woff2?|ttf|eot|mp4|webm)$/i.test(fullRaw)
            ) {
              return;
            }
            const parent = node.parent;
            if (
              parent?.type === 'AssignmentExpression' &&
              parent.left?.type === 'MemberExpression' &&
              /^(?:pathname|href|src|url|action|poster|data)$/i.test(
                parent.left.property?.name ?? ''
              )
            ) {
              return;
            }
            if (isInsideLocateFileProperty(node)) {
              return;
            }
            // A filesystem path is not a multi-word message or sentence
            if (
              fullRaw.includes(' ') &&
              (fullRaw.includes('. ') ||
                fullRaw.includes(': ') ||
                fullRaw.includes('? ') ||
                fullRaw.split(' ').length > 3)
            ) {
              return;
            }
            const hasPathSep = quasis.some(
              (q) =>
                typeof q.value?.raw === 'string' &&
                (q.value.raw.includes('/') || q.value.raw.includes('\\\\'))
            );
            if (!hasPathSep || (node.expressions?.length ?? 0) === 0) {
              return;
            }

            // Verify if any expression looks like a path/file variable (excluding URL / web identifiers)
            const isUrlExpr = (name: string): boolean =>
              /^(?:base|api)?(?:url|endpoint|origin|host|uri|href|link)$/i.test(name);
            const firstExprName = (node.expressions?.[0] as { name?: string })?.name ?? '';
            if (isUrlExpr(firstExprName)) {
              return;
            }

            const hasPathExpr = (node.expressions ?? []).some((expr) => {
              const exprName = (expr as { name?: string })?.name ?? '';
              if (isUrlExpr(exprName)) return false;
              return /(?:path|dir|folder|file|root|base|dest|cwd|target)$/i.test(exprName);
            });
            const hasPathQuasiPrefix = quasis.some((q) => {
              const raw = q.value?.raw ?? '';
              return /^\.{1,2}[/\\]|^[a-zA-Z]:[/\\]/.test(raw);
            });

            if (hasPathExpr || hasPathQuasiPrefix) {
              context.report({
                node,
                message:
                  "Unsafe path concatenation via template literal. Use 'path.join()' or 'path.resolve()' from 'node:path' passing each segment as a separate argument."
              });
            }
          },
          BinaryExpression(node: OxlintAstNode): void {
            if (node.operator === '+') {
              const left = node.left as { type?: string; value?: unknown; name?: string };
              const right = node.right as { type?: string; value?: unknown; name?: string };
              const isPathStr = (val: unknown): boolean =>
                typeof val === 'string' &&
                (val === '/' || val === '\\' || val.includes('/') || val.includes('\\')) &&
                !val.includes('?') &&
                !val.includes('&') &&
                !/\/(?:api|rest|auth|embed|assets|v\d+)\//i.test(val);
              const isPathName = (name: unknown): boolean =>
                typeof name === 'string' &&
                !/url|endpoint|origin|host|uri|href|link/i.test(name) &&
                /path|dir|folder|file|root|base/i.test(name);

              if (
                (isPathStr(left?.value) &&
                  (isPathName(right?.name) || right?.type === 'CallExpression')) ||
                (isPathStr(right?.value) &&
                  (isPathName(left?.name) || left?.type === 'CallExpression'))
              ) {
                context.report({
                  node,
                  message:
                    "Unsafe path concatenation via '+' operator. Use 'path.join()' or 'path.resolve()' from 'node:path'."
                });
              }
            }
          }
        };
      }
    },

    'unsanitized-env-argv-path': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids passing unsanitized process.argv or process.env directly to filesystem sinks'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const isFsSink =
              callee?.type === 'MemberExpression' &&
              (callee.object?.name === 'fs' ||
                (callee.object?.type === 'MemberExpression' &&
                  callee.object.object?.name === 'fs'));
            if (!isFsSink) return;

            const isProcessArgvOrEnv = (target: OxlintAstNode | undefined): boolean => {
              if (target?.type !== 'MemberExpression') return false;
              const obj = target.object;
              if (obj?.type === 'MemberExpression' && obj.object?.name === 'process') {
                const prop = obj.property?.name;
                return prop === 'argv' || prop === 'env';
              }
              if (obj?.name === 'process') {
                const prop = target.property?.name;
                return prop === 'argv' || prop === 'env';
              }
              return false;
            };

            const args = node.arguments ?? [];
            for (const arg of args) {
              if (isProcessArgvOrEnv(arg)) {
                context.report({
                  node,
                  message:
                    'Unsanitized process.argv or process.env passed directly to fs sink. Validate containment before passing to filesystem operations.'
                });
                break;
              }
            }
          }
        };
      }
    },

    'untrusted-url-fetch': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Requires URL origin/protocol validation before passing dynamic targets to fetch()'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const isFetch =
              callee?.name === 'fetch' ||
              (callee?.type === 'MemberExpression' &&
                (callee.object?.name === 'window' || callee.object?.name === 'globalThis') &&
                callee.property?.name === 'fetch');
            if (isFetch) {
              const firstArg = node.arguments?.[0];
              if (
                firstArg &&
                (firstArg.type === 'Identifier' || firstArg.type === 'MemberExpression')
              ) {
                const source = context.getSourceCode ? context.getSourceCode().getText() : '';
                if (
                  !source.includes('new URL(') &&
                  !source.includes('isValidUrl') &&
                  !source.includes('assertSafeUrl')
                ) {
                  context.report({
                    node,
                    message:
                      'Untrusted URL passed to fetch() without origin or protocol validation. Construct and validate with new URL().'
                  });
                }
              }
            }
          }
        };
      }
    },

    'hardcoded-slash-path': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "Forbids hardcoding '\\' or '/' in string split() operations on path variables"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'split') {
              const sourceCode = context.getSourceCode ? context.getSourceCode().getText() : '';
              if (sourceCode) {
                const isNodeContext =
                  sourceCode.includes('node:') ||
                  sourceCode.includes('process.') ||
                  sourceCode.includes('import.meta.dirname');
                if (!isNodeContext) {
                  return;
                }
              }
              const getObjName = (target: OxlintAstNode | undefined): string => {
                if (!target) return '';
                if (target.type === 'Identifier') return target.name ?? '';
                if (target.type === 'MemberExpression') {
                  const p = target.property;
                  return p?.name ?? '';
                }
                return '';
              };
              const objName = getObjName(callee.object);
              if (!objName || !/(?:path|dir|folder)/i.test(objName)) {
                return;
              }
              const arg = node.arguments?.[0] as { type?: string; value?: unknown };
              if (
                arg?.type === 'Literal' &&
                typeof arg.value === 'string' &&
                (arg.value === '\\' || arg.value === '\\\\' || arg.value === '/')
              ) {
                context.report({
                  node,
                  message:
                    "Hardcoded path separator in split(). Use 'node:path' utilities (path.basename, path.dirname, path.sep) instead."
                });
              }
            }
          }
        };
      }
    },

    'no-hardcoded-secrets': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Detects hardcoded secrets, API tokens, cryptographic private keys, and database passwords'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Literal(node: OxlintAstNode): void {
            if (typeof node.value === 'string' && node.value.length >= 8) {
              const str = node.value;
              // Exempt official public local Supabase CLI demo JWTs and security probe test tokens
              if (
                str.includes('eyJpc3MiOiJzdXBhYmFzZS1kZW1vI') ||
                str.includes('eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlI') ||
                str.includes('invalid_forged_signature_probe')
              ) {
                return;
              }
              if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(str)) {
                context.report({
                  node,
                  message:
                    'Hardcoded private cryptographic key detected. Store keys in a secure secret manager or vault.'
                });
              } else if (/\bAKIA[0-9A-Z]{16}\b/.test(str)) {
                context.report({
                  node,
                  message:
                    'Hardcoded AWS Access Key ID detected. Use IAM roles or environment variables.'
                });
              } else if (/\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/.test(str)) {
                context.report({
                  node,
                  message:
                    'Hardcoded GitHub personal access token detected. Use environment variables or secret manager.'
                });
              } else if (
                /\bBearer\s+[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\b/.test(str) ||
                /\beyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\b/.test(str)
              ) {
                context.report({
                  node,
                  message: 'Hardcoded Bearer or JWT token detected. Retrieve tokens dynamically.'
                });
              } else if (/\b(?:postgres|mysql|mongodb|mongodb\+srv):\/\/[^:]+:[^@]+@/.test(str)) {
                context.report({
                  node,
                  message:
                    'Database connection URI with hardcoded credentials detected. Use environment variables.'
                });
              }
            }
          }
        };
      }
    },

    'ephemeral-no-source-temp-references': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids referencing temporary or scratch paths inside source code trees'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Literal(node: OxlintAstNode): void {
            if (typeof node.value === 'string') {
              const val = node.value.trim();
              if (
                !val ||
                val.endsWith('/**') ||
                val.endsWith('/*') ||
                val.startsWith('scratch/') ||
                val.startsWith('./scratch/') ||
                val.includes('/scratch/') ||
                /^(?:https?:|git\+|data:|ftp:|file:\/\/)/i.test(val) ||
                val.includes('?') ||
                val.includes('&')
              ) {
                return;
              }
              if (
                (val.includes('/') || val.includes('\\')) &&
                /(?:[\\/])(?:temp|tmp|temp_\w+|tmp_\w+)(?:[\\/]|$)/i.test(val)
              ) {
                context.report({
                  node,
                  message:
                    "Forbidden reference to ephemeral path inside source code tree. All temporary databases and scratch artifacts must reside strictly inside 'scratch/'."
                });
              }
            }
          }
        };
      }
    },

    'no-raw-local-storage': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "Forbids direct access to 'localStorage' without domain repository abstraction"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          MemberExpression(node: OxlintAstNode): void {
            if (node.object?.name === 'localStorage') {
              const prop = node.property?.name;
              if (
                prop === 'getItem' ||
                prop === 'setItem' ||
                prop === 'removeItem' ||
                prop === 'clear'
              ) {
                const source = context.getSourceCode ? context.getSourceCode().getText() : '';
                if (source.includes('navigator.storage.getDirectory')) {
                  return;
                }
                context.report({
                  node,
                  message:
                    "Direct access to 'localStorage' detected. Abstract storage persistence behind a domain repository or adapter."
                });
              }
            }
          }
        };
      }
    },

    'no-raw-session-storage': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "Forbids direct access to 'sessionStorage' without domain repository abstraction"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          MemberExpression(node: OxlintAstNode): void {
            if (node.object?.name === 'sessionStorage') {
              const prop = node.property?.name;
              if (
                prop === 'getItem' ||
                prop === 'setItem' ||
                prop === 'removeItem' ||
                prop === 'clear'
              ) {
                context.report({
                  node,
                  message:
                    "Direct access to 'sessionStorage' detected. Abstract storage persistence behind a domain repository or adapter."
                });
              }
            }
          }
        };
      }
    },

    'no-direct-process-argv': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids direct process.argv, Deno.args, or Bun.argv access outside canonical Citty harness'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          MemberExpression(node: OxlintAstNode): void {
            const isProcessArgv = node.object?.name === 'process' && node.property?.name === 'argv';
            const isDenoArgs = node.object?.name === 'Deno' && node.property?.name === 'args';
            const isBunArgv = node.object?.name === 'Bun' && node.property?.name === 'argv';

            if (isProcessArgv || isDenoArgs || isBunArgv) {
              context.report({
                node,
                message:
                  "Direct command-line argument access detected. Standardize CLI execution on declarative 'citty' contracts (cittyHarness.ts)."
              });
            }
          }
        };
      }
    },

    'no-banned-cli-parsers': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids unauthorized third-party CLI parsers in favor of citty'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          ImportDeclaration(node: OxlintAstNode): void {
            const specifier = node.source?.value;
            const BANNED = new Set(['yargs', 'commander', 'minimist', 'cac', 'arg', 'mri']);
            if (typeof specifier === 'string' && BANNED.has(specifier)) {
              context.report({
                node,
                message: `Unauthorized CLI parser library '${specifier}'. Use 'citty' exclusively for CLI commands.`
              });
            }
          }
        };
      }
    },

    'no-homebrew-flag-parsing': {
      meta: {
        type: 'problem',
        docs: {
          description: "Forbids manual startsWith('--') or includes('--') flag parsing heuristics"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression') {
              const prop = callee.property?.name;
              if (prop === 'startsWith' || prop === 'includes') {
                const objName = (callee.object as { name?: string })?.name;
                if (objName && !/arg|flag|param|opt|token|cli/i.test(objName)) {
                  return;
                }
                const arg = node.arguments?.[0] as { type?: string; value?: unknown };
                if (typeof arg?.value === 'string' && arg.value.startsWith('--')) {
                  context.report({
                    node,
                    message: `Homebrew CLI flag parsing detected (${prop}('${arg.value}')). Define CLI parameters declaratively with 'citty'.`
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-cli-eval-bypass': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbids eval, new Function or fd 0 reading for CLI execution bypass'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.name === 'eval') {
              context.report({
                node,
                message:
                  'Dynamic CLI eval bypass detected. Commands must execute declaratively through Citty.'
              });
            } else if (
              callee?.type === 'MemberExpression' &&
              callee.object?.name === 'fs' &&
              callee.property?.name === 'readFileSync'
            ) {
              const firstArg = node.arguments?.[0] as { type?: string; value?: unknown };
              if (firstArg?.value === 0) {
                context.report({
                  node,
                  message:
                    'Direct fd 0 stdin reading detected. Use Citty CLI options or structured stdin readers.'
                });
              }
            }
          }
        };
      }
    },
    'no-await-in-loops-query': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Detects asynchronous database queries inside loops (N+1 query pattern)'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          AwaitExpression(node: OxlintAstNode): void {
            let parent = node.parent;
            let inLoop = false;
            while (parent) {
              const t = parent.type;
              if (
                t === 'ForStatement' ||
                t === 'ForOfStatement' ||
                t === 'ForInStatement' ||
                t === 'WhileStatement' ||
                t === 'DoWhileStatement'
              ) {
                inLoop = true;
                break;
              }
              parent = parent.parent;
            }
            if (inLoop) {
              const arg = node.argument;
              if (arg?.type === 'CallExpression') {
                const callee = arg.callee;
                const calleeName =
                  callee?.type === 'MemberExpression'
                    ? (callee.property?.name ?? '')
                    : (callee?.name ?? '');
                const objName =
                  callee?.type === 'MemberExpression' ? (callee.object?.name ?? '') : '';
                if (
                  /db|supabase|prisma|repository/i.test(objName) ||
                  /query|findFirst|findMany|findById|select/i.test(calleeName)
                ) {
                  context.report({
                    node,
                    message:
                      'Asynchronous database query inside loop (N+1 query pattern). Extract IDs and batch queries outside the loop.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-select-star-in-queries': {
      meta: {
        type: 'problem',
        docs: {
          description: "Forbids .select('*') in database/ORM queries"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'select') {
              const firstArg = node.arguments?.[0] as { type?: string; value?: unknown };
              if (firstArg?.type === 'Literal' && firstArg.value === '*') {
                context.report({
                  node,
                  message:
                    "Use of .select('*') in database query. Project specific required columns to avoid unnecessary network and memory payload."
                });
              }
            }
          }
        };
      }
    },

    'require-paginated-queries': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Requires pagination, limits, or unique row constraints on collection queries'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (callee?.type === 'MemberExpression' && callee.property?.name === 'from') {
              const parent = node.parent as {
                type?: string;
                property?: { name?: string };
                parent?: { type?: string; property?: { name?: string } };
              };
              if (parent?.property?.name === 'select') {
                const source = context.getSourceCode ? context.getSourceCode().getText() : '';
                if (!/\.(?:limit|range|single|maybeSingle|head|csv)\b/.test(source)) {
                  context.report({
                    node,
                    message:
                      'Database collection query without pagination or limit (.limit(), .range(), or .single()). Add limit to prevent unbounded memory growth.'
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-direct-database-instantiation': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Forbids direct database client instantiation outside repositories or factories'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          NewExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            const name = callee?.name;
            const BANNED_CLIENTS = new Set(['Client', 'Pool', 'SupabaseClient', 'PrismaClient']);
            if (typeof name === 'string' && BANNED_CLIENTS.has(name)) {
              context.report({
                node,
                message: `Direct database client instantiation '${name}' detected. Abstract database connections inside repositories or singleton adapters.`
              });
            }
          }
        };
      }
    },

    'require-storage-try-catch': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Requires storage.setItem to be wrapped in try/catch for QuotaExceededError safety'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (
              callee?.type === 'MemberExpression' &&
              (callee.object?.name === 'localStorage' ||
                callee.object?.name === 'sessionStorage') &&
              callee.property?.name === 'setItem'
            ) {
              let cur = node.parent;
              let inTry = false;
              while (cur) {
                if (cur.type === 'TryStatement') {
                  inTry = true;
                  break;
                }
                cur = cur.parent;
              }
              if (!inTry) {
                context.report({
                  node,
                  message:
                    'Storage setItem call outside try/catch block. Wrap storage writes to handle QuotaExceededError.'
                });
              }
            }
          }
        };
      }
    },

    'no-gsap-layout-properties': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prohibits layout property animations in GSAP'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            if (isGsapCall(node)) {
              const args = node.arguments ?? [];
              const varsObj = args[args.length - 1] as {
                type?: string;
                properties?: readonly { key?: { name?: string; value?: unknown } }[];
              };
              if (varsObj?.type === 'ObjectExpression' && varsObj.properties) {
                const LAYOUT = new Set([
                  'top',
                  'left',
                  'right',
                  'bottom',
                  'width',
                  'height',
                  'margin',
                  'padding'
                ]);
                for (const prop of varsObj.properties) {
                  const key = getNodePropKeyName(prop);
                  if (LAYOUT.has(key)) {
                    context.report({
                      node,
                      message: `Animating layout property '${key}' in GSAP. Use GPU-accelerated transforms (x, y, scale, rotation) instead.`
                    });
                    break;
                  }
                }
              }
            }
          }
        };
      }
    },

    'gsap-named-timer-constants': {
      meta: {
        type: 'problem',
        docs: {
          description: "Enforces semantic constants with '_SEC' suffix for GSAP duration"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            if (isGsapCall(node, ['to', 'from'])) {
              const durArg = node.arguments?.[1] as { type?: string; value?: unknown };
              if (
                durArg?.type === 'Literal' &&
                typeof durArg.value === 'number' &&
                durArg.value > 0
              ) {
                context.report({
                  node,
                  message: `Raw numeric duration '${durArg.value}' in GSAP animation. Extract to a semantic constant with '_SEC' suffix.`
                });
              }
            }
          }
        };
      }
    },

    'no-gsap-banned-ui-timers': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prohibits setTimeout/setInterval in GSAP-animated components'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const name = node.callee?.name;
            if (name === 'setTimeout' || name === 'setInterval') {
              const source = context.getSourceCode ? context.getSourceCode().getText() : '';
              if (source.includes("from 'gsap'") || source.includes('gsap.')) {
                context.report({
                  node,
                  message: `Banned UI timer (${name}) in animated component. Use GSAP timelines or gsap.delayedCall for deterministic timing.`
                });
              }
            }
          }
        };
      }
    },

    'require-gsap-cleanup-on-unmount': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Enforces GSAP context revert or kill on component unmount'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (
              callee?.type === 'MemberExpression' &&
              callee.object?.name === 'gsap' &&
              callee.property?.name === 'context'
            ) {
              const source = context.getSourceCode ? context.getSourceCode().getText() : '';
              if (!source.includes('.revert(') && !source.includes('onUnmounted')) {
                context.report({
                  node,
                  message:
                    'GSAP context created without revert() in lifecycle unmount. Clean up animations on unmount to prevent leaks.'
                });
              }
            }
          }
        };
      }
    },

    'no-unscoped-component-selectors': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prohibits unscoped global CSS selectors in component GSAP tweens'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            if (isGsapCall(node)) {
              const target = node.arguments?.[0] as { type?: string; value?: unknown };
              if (
                target?.type === 'Literal' &&
                typeof target.value === 'string' &&
                target.value.startsWith('.')
              ) {
                const source = context.getSourceCode ? context.getSourceCode().getText() : '';
                if (source.includes('<template') && !source.includes('ref(')) {
                  context.report({
                    node,
                    message: `Unscoped string selector '${target.value}' in component animation. Target template refs or scoped elements directly.`
                  });
                }
              }
            }
          }
        };
      }
    },

    'no-nested-scrolltrigger': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prohibits nested scrollTrigger in child tweens of timelines'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Property(node: OxlintAstNode): void {
            const key = (node as { key?: { name?: string; value?: unknown } }).key;
            const keyName = key?.name ?? (typeof key?.value === 'string' ? key.value : '');
            if (keyName === 'scrollTrigger') {
              let cur = node.parent;
              let inTlChild = false;
              while (cur) {
                if (cur.type === 'CallExpression') {
                  const callee = (cur as { callee?: { object?: { name?: string } } }).callee;
                  if (callee?.object?.name === 'tl') {
                    inTlChild = true;
                    break;
                  }
                }
                cur = cur.parent;
              }
              if (inTlChild) {
                context.report({
                  node,
                  message:
                    'Nested scrollTrigger in timeline child tween detected. Define scrollTrigger on the parent timeline, not individual tweens.'
                });
              }
            }
          }
        };
      }
    },

    'no-scrolltrigger-markers-production': {
      meta: {
        type: 'problem',
        docs: {
          description: "Prohibits 'markers: true' on ScrollTrigger in production code"
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Property(node: OxlintAstNode): void {
            const keyName = getNodePropKeyName(node);
            const val = (node as { value?: { value?: unknown } }).value;
            if (keyName === 'markers' && val?.value === true) {
              context.report({
                node,
                message:
                  "ScrollTrigger 'markers: true' detected in production code. Remove markers before shipping."
              });
            }
          }
        };
      }
    },

    'no-file-level-suppressions': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Prohibits file-level suppression headers (eslint-disable, fallow-ignore, @ts-nocheck)'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Program(node: OxlintAstNode): void {
            const source = context.getSourceCode ? context.getSourceCode().getText() : '';
            const headerSlice = source.slice(0, 1000);
            if (
              /\/\*\s*eslint-disable\s*\*\/|\/\/\s*fallow-ignore-file|\/\/\s*@ts-nocheck/.test(
                headerSlice
              )
            ) {
              context.report({
                node,
                message:
                  'File-level suppression header detected. Standalone whole-file ignore directives are strictly prohibited.'
              });
            }
          }
        };
      }
    },

    'auditor-class-inheritance': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Enforces BaseAuditor or FileScanAuditor inheritance on all Auditor classes'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          ClassDeclaration(node: OxlintAstNode): void {
            const className = (node as { id?: { name?: string } }).id?.name;
            if (
              typeof className === 'string' &&
              className.endsWith('Auditor') &&
              className !== 'BaseAuditor' &&
              className !== 'FileScanAuditor'
            ) {
              const superClass = node.superClass?.name;
              if (superClass !== 'BaseAuditor' && superClass !== 'FileScanAuditor') {
                context.report({
                  node,
                  message: `Auditor class '${className}' must inherit from BaseAuditor or FileScanAuditor.`
                });
              }
            }
          }
        };
      }
    },

    'no-homebrew-file-walker': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prohibits manual recursive fs.readdirSync traversals in auditor suites'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          CallExpression(node: OxlintAstNode): void {
            const callee = node.callee;
            if (
              callee?.type === 'MemberExpression' &&
              callee.object?.name === 'fs' &&
              callee.property?.name === 'readdirSync'
            ) {
              const args = node.arguments ?? [];
              const firstArg = args[0] as { name?: string; value?: unknown };
              const argName =
                firstArg?.name ?? (typeof firstArg?.value === 'string' ? firstArg.value : '');
              if (/dist|build/i.test(argName)) {
                return;
              }
              const secondArg = args[1];
              let isRecursive = false;
              if (secondArg?.type === 'ObjectExpression') {
                isRecursive = (secondArg.properties ?? []).some((prop) => {
                  const keyName = getNodePropKeyName(prop);
                  const val = (prop as { value?: { value?: unknown } }).value?.value;
                  return keyName === 'recursive' && val === true;
                });
              }
              if (isRecursive) {
                context.report({
                  node,
                  message:
                    'Homebrew recursive fs.readdirSync traversal in auditor suite. Leverage collectRepositoryFiles() from auditorBase.'
                });
              }
            }
          }
        };
      }
    },

    'auditor-rule-description-limit': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Enforces maximum length of 60 chars on auditor rule descriptions'
        }
      },
      create(context: OxlintRuleContext): OxlintRuleListener {
        return {
          Property(node: OxlintAstNode): void {
            const keyName = getNodePropKeyName(node);
            const val = (node as { value?: { type?: string; value?: unknown } }).value;
            if (
              keyName === 'description' &&
              val?.type === 'Literal' &&
              typeof val.value === 'string'
            ) {
              const parentKey = getNodePropKeyName((node.parent as OxlintAstNode) ?? {});
              if (parentKey === 'docs' || parentKey === 'meta') {
                return;
              }
              if (node.parent?.type === 'ObjectExpression') {
                const props = node.parent.properties ?? [];
                const isAuditorRuleObj = props.some((p) =>
                  AUDITOR_RULE_SIBLING_KEYS.has(getNodePropKeyName(p))
                );
                if (!isAuditorRuleObj) {
                  return;
                }
              }
              if (val.value.length > 60) {
                context.report({
                  node,
                  message: `Rule description exceeds 60 characters ('${val.value.slice(0, 30)}...'). Provide concise single-line descriptions.`
                });
              }
            }
          }
        };
      }
    }
  }
};

export default domainTypeOxlintPlugin;
