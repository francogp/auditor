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
 * 26. no-tautological-integration-mocks: Forbids mocking database or core execution engines in integration tests.
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
  readonly params?: readonly OxlintAstNode[];
  readonly body?: OxlintAstNode | readonly OxlintAstNode[];
  readonly key?: OxlintAstNode;
  readonly left?: OxlintAstNode;
  readonly right?: OxlintAstNode;
  readonly param?: OxlintAstNode;
  readonly quasis?: readonly {
    readonly value?: {
      readonly raw?: string;
      readonly cooked?: string;
    };
  }[];
  readonly expressions?: readonly OxlintAstNode[];
  readonly operator?: string;
  readonly source?: {
    readonly value?: string;
  };
  readonly superClass?: {
    readonly name?: string;
  };
  readonly properties?: readonly OxlintAstNode[];
  readonly cases?: readonly OxlintAstNode[];
  readonly declaration?: OxlintAstNode;
}
export type OxlintRuleListener = Record<string, (node: OxlintAstNode) => void>;
export type OxlintCommentNode = string | {
  readonly value?: string;
};
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
export declare const CANONICAL_INFRA_ID_WHITELIST: readonly ["suiteId", "ruleId", "runId", "buildId", "eslintRuleId", "taskId", "sessionId", "shortId"];
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
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-record-string-key': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-untyped-string-set-map': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-broad-string-array': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-double-cast-unknown': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-legacy-date': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-unbranded-id': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-json-clone': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-redundant-spread-return': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-boolean-literal-annotation': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-async-in-computed': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'watch-reactive-property-getter': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-destructured-reactive': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-store-destructuring-without-storetorefs': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-direct-state-mutation-outside-actions': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-deprecated-router-next': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-define-async-component-in-router': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-window-location-navigation': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-silent-promise-catch': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-silent-mock-fallbacks': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'strict-catch-narrowing': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'dom-event-leak': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'interval-leak': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-boolean-trap-parameters': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-massive-switch': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-tautological-integration-mocks': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'playwright-id-locators-only': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-playwright-force-click': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-test-timeout-inflation': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-playwright-polling-waits': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'script-setup-required': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'vue-template-quote-escaping': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-data-provider-in-template': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-raw-html-injection': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-insecure-random': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-permissive-cors': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-unvalidated-redirect': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'valibot-schema-type-parity': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-redundant-constant-alias': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-literal-suffix-constant': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'unsafe-path-concat': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'unsanitized-env-argv-path': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'untrusted-url-fetch': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'hardcoded-slash-path': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-hardcoded-secrets': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'ephemeral-no-source-temp-references': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-raw-local-storage': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-raw-session-storage': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-direct-process-argv': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-banned-cli-parsers': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-homebrew-flag-parsing': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-cli-eval-bypass': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-await-in-loops-query': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-select-star-in-queries': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'require-paginated-queries': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-direct-database-instantiation': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'require-storage-try-catch': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-gsap-layout-properties': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'gsap-named-timer-constants': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-gsap-banned-ui-timers': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'require-gsap-cleanup-on-unmount': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-unscoped-component-selectors': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-nested-scrolltrigger': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-scrolltrigger-markers-production': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-file-level-suppressions': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'auditor-class-inheritance': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'no-homebrew-file-walker': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
    'auditor-rule-description-limit': {
      meta: {
        type: string;
        docs: {
          description: string;
        };
      };
      create(context: OxlintRuleContext): OxlintRuleListener;
    };
  };
};
export { domainTypeOxlintPlugin as default };