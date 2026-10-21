/**
 * packages/auditor/src/suites/architecture/validate_vue_reactivity.ts
 *
 * VUE REACTIVITY & STATE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces Vue 3 Composition API reactivity rules (vue-best-practices):
 *   1. No Side Effects in Computed (`no-side-effects-in-computed`):
 *      Prohibits in-place mutations (.sort, .splice, .push, .pop, .reverse) and
 *      ref reassignments (.value = ) inside computed() property bodies.
 *   2. Watch Reactive Property Getter (`watch-reactive-property-getter`):
 *      Enforces getter function wrapper when watching reactive props (e.g. watch(() => props.foo))
 *      preventing silent reactivity loss on primitive properties.
 *   3. No Async in Computed (`no-async-in-computed`):
 *      Prohibits computed(async () => ...); computed cannot unwrap promises.
 *   4. No Destructured Reactive (`no-destructured-reactive`):
 *      Prohibits destructuring reactive() objects directly without toRefs().
 *      (Note: defineProps destructuring is permitted under Vue 3.5+ native compiler transform).
 *
 * Escape Hatch:
 *   // reactivity-ok: <reason>, // sfc-ok: <reason>
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities, resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { AuditedDocument } from '../../core/auditedDocument.ts';
import ts from 'typescript';
import { extractVueScriptOrRaw } from '../../core/vueSfcParser.ts';

enableCompileCache();

export type VueReactivityRuleId =
  | 'no-side-effects-in-computed'
  | 'watch-reactive-property-getter'
  | 'no-async-in-computed'
  | 'no-destructured-reactive';

export const VUE_REACTIVITY_RULES: readonly VueReactivityRuleId[] = [
  'no-side-effects-in-computed',
  'watch-reactive-property-getter',
  'no-async-in-computed',
  'no-destructured-reactive'
] as const;

const ASYNC_COMPUTED_REGEX = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?async\s*(?:\([^)]*\)|[\w$]+)\s*=>/g;
// redos-ok: deterministic property accessor regex
const WATCH_PROP_NAKED_REGEX = /\bwatch\s*\(\s*(props\.[\w$]+(?:\.[\w$]+)*)\s*,/g;
const DESTRUCTURED_REACTIVE_REGEX = /const\s+\{[^}]+\}\s*=\s*reactive\s*(?:<[^>]+>\s*)?\(/g;

// redos-ok: deterministic property accessor regex
const DIRECT_REACTIVE_MUTATION_REGEX =
  /\b(?:(?:props|store)\.(?!value\b)[\w$]+(?:\.[\w$]+)*|[\w$]+\.value)\s*\??\.(?:sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;
const LOCAL_IDENTIFIER_MUTATION_REGEX =
  /\b([\w$]+)\s*\??\.(sort|reverse|splice|push|pop|shift|unshift)\s*\(/g;

function getCallNameAndFirstArg(
  node: ts.Node,
  ast: ts.SourceFile
): { calleeName: string; arg0: ts.Expression } | null {
  if (!ts.isCallExpression(node)) return null;
  let callee: ts.Expression = node.expression;
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  if (node.arguments.length === 0) return null;
  let arg0 = node.arguments[0]!;
  while (ts.isParenthesizedExpression(arg0)) arg0 = arg0.expression;
  return { calleeName: callee.getText(ast), arg0 };
}

export class ValidateVueReactivityAuditor extends FileScanAuditor<VueReactivityRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => [
        ...(config.paths.componentsRoots ?? []),
        ...(config.paths.viewsRoots ?? []),
        ...(config.paths.composablesRoots ?? []),
        ...(config.paths.storesRoots ?? [])
      ]
    );

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(VUE_REACTIVITY_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_vue_reactivity',
      name: 'Vue Reactivity & State Hygiene Auditor',
      description: 'Verifies Vue 3 Composition API reactivity and purity',
      family: 'architecture',
      ruleIds: VUE_REACTIVITY_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(VUE_REACTIVITY_RULES, 'behavior'),
      packageName: 'Vue',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '⚡',
      ruleDescriptions: {
        'no-side-effects-in-computed': 'Mutation or side effect in computed',
        'watch-reactive-property-getter': 'Watched property without getter in watch',
        'no-async-in-computed': 'Async function inside computed',
        'no-destructured-reactive': 'Destructuring reactive() without toRefs'
      },
      ruleRemediations: {
        'no-side-effects-in-computed':
          '1. Root Cause:\n' +
          'An in-place mutation (.sort(), .reverse(), .splice(), .push(), .pop()) on an array or a ref reassignment (.value =) was detected inside a "computed()" property body.\n' +
          'Computed properties in Vue 3 must be pure functions without side effects. Mutating reactive state being read inside computed triggers infinite re-render loops and desynchronizes dependent components.\n\n' +
          '2. Diagnosis:\n' +
          'Locate the computed property line indicated in the message. If sorting or filtering a list derived from props or refs, the mutation mutates the original source.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Create a shallow clone before sorting or mutating: "[...array].sort(...)" or "array.slice().reverse()".\n' +
          '2. Move mutations and ref assignments outside computed, executing them in "watchEffect" or event handlers/actions.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: in-place sort mutates the original prop or state\n' +
          'const sortedUsers = computed(() => props.users.sort((a, b) => a.name.localeCompare(b.name)));\n\n' +
          '// ✅ Correct: clone first via spread operator\n' +
          'const sortedUsers = computed(() => [...props.users].sort((a, b) => a.name.localeCompare(b.name)));',
        'watch-reactive-property-getter':
          '1. Root Cause:\n' +
          'An individual reactive property is passed directly as the source argument in "watch(props.propName, ...)" instead of being wrapped in a getter function.\n' +
          'In JavaScript and Vue 3, accessing a primitive property (string, number, boolean) passes the scalar value by copy at that instant. Vue cannot track future changes of a primitive unless passed as a getter function.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect the first argument of "watch()". If it accesses a property on "props." or a nested property on a reactive object, it must be wrapped in a getter function.\n\n' +
          '3. Canonical Solution:\n' +
          'Wrap the property access in an anonymous getter function: "watch(() => props.propName, (newVal) => { ... })".\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: reactivity lost silently on primitive values\n' +
          'watch(props.userId, (newId) => { fetchUser(newId); });\n\n' +
          '// ✅ Correct: reactive function getter\n' +
          'watch(() => props.userId, (newId) => { fetchUser(newId); });',
        'no-async-in-computed':
          '1. Root Cause:\n' +
          'An async function was passed to "computed(async () => ...)".\n' +
          'Vue 3\'s reactivity system does not unwrap promises returned by computed getters. The computed value will be an unresolved "Promise<T>" object, breaking template rendering.\n\n' +
          '2. Diagnosis:\n' +
          'Search for "computed(async () =>" in the component or composable.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Use "computedAsync" from "@vueuse/core" when deriving reactive state from an asynchronous promise.\n' +
          '2. Alternatively, use a "shallowRef" for resolved data and load the promise inside a "watchEffect" managing loading and error states.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: computed returns Promise<UserData>\n' +
          'const user = computed(async () => await api.getUser(id.value));\n\n' +
          '// ✅ Correct: computedAsync from VueUse\n' +
          'import { computedAsync } from "@vueuse/core";\n' +
          'const user = computedAsync(async () => await api.getUser(id.value), null);',
        'no-destructured-reactive':
          '1. Root Cause:\n' +
          'An object created with "reactive()" was destructured directly: "const { foo, bar } = reactive(...)".\n' +
          'Destructuring a Vue 3 reactive object extracts primitive values by copy, permanently disconnecting them from the reactive proxy.\n\n' +
          '2. Diagnosis:\n' +
          'Look for destructuring assignments from a "reactive()" call.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Wrap the object with "toRefs()" before destructuring: "const { foo, bar } = toRefs(state)".\n' +
          '2. Or keep the reactive object intact and access members with dot notation: "state.foo".\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: foo and bar lose reactivity\n' +
          'const state = reactive({ foo: 1, bar: "test" });\n' +
          'const { foo, bar } = state;\n\n' +
          '// ✅ Correct: toRefs preserves reactivity as Ref<T>\n' +
          'import { reactive, toRefs } from "vue";\n' +
          'const state = reactive({ foo: 1, bar: "test" });\n' +
          'const { foo, bar } = toRefs(state);'
      },
      roots: targetRoots,
      allowedExtensions: new Set(['.vue', '.ts', '.js']),
      projectRoot: effectiveRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const doc = new AuditedDocument(relPath, content, relPath);
    const ast = doc.getAst();

    if (ast) {
      this.scanAst(doc, ast, relPath, content);
      return;
    }

    const scriptContent = extractVueScriptOrRaw(relPath, content);
    if (!scriptContent) return;

    this.scanRegexMatches(
      scriptContent,
      ASYNC_COMPUTED_REGEX,
      relPath,
      'no-async-in-computed',
      ['reactivity-ok', 'sfc-ok'],
      'Asynchronous callback passed to computed(). computed cannot unwrap promises; use watchEffect or computedAsync from VueUse.',
      undefined,
      content
    );

    this.scanRegexMatches(
      scriptContent,
      WATCH_PROP_NAKED_REGEX,
      relPath,
      'watch-reactive-property-getter',
      ['reactivity-ok', 'sfc-ok'],
      'Watching reactive property directly as value instead of a getter. Use watch(() => props.prop, ...) to preserve reactivity.',
      undefined,
      content
    );

    this.scanRegexMatches(
      scriptContent,
      DESTRUCTURED_REACTIVE_REGEX,
      relPath,
      'no-destructured-reactive',
      ['reactivity-ok', 'sfc-ok'],
      'Destructuring reactive() object directly causes reactivity loss. Wrap with toRefs() before destructuring.',
      undefined,
      content
    );

    this.runSubAuditorSync('no-side-effects-in-computed', () => {
      this.auditComputedSideEffects(relPath, content, scriptContent);
    });
  }

  private checkAsyncInComputed(
    node: ts.Node,
    ast: ts.SourceFile,
    doc: AuditedDocument,
    relPath: string
  ): void {
    const callInfo = getCallNameAndFirstArg(node, ast);
    if (!callInfo || callInfo.calleeName !== 'computed') return;
    const { arg0 } = callInfo;
    if (!ts.isArrowFunction(arg0) && !ts.isFunctionExpression(arg0)) return;

    const isAsync = (arg0.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!isAsync) return;
    if (doc.hasEscapeHatchForNode(node, 'no-async-in-computed', ast)) return;

    const { line } = doc.getNodeLineAndColumn(node, ast);
    this.addViolation({
      ruleId: 'no-async-in-computed',
      severity: 'error',
      file: relPath,
      line,
      message:
        'Asynchronous callback passed to computed(). computed cannot unwrap promises; use watchEffect or computedAsync from VueUse.',
      context: node.getText(ast).slice(0, 100).replace(/\n/g, '↵')
    });
  }

  private checkWatchPropertyGetter(
    node: ts.Node,
    ast: ts.SourceFile,
    doc: AuditedDocument,
    relPath: string
  ): void {
    const callInfo = getCallNameAndFirstArg(node, ast);
    if (!callInfo || callInfo.calleeName !== 'watch') return;
    const { arg0 } = callInfo;
    if (!ts.isPropertyAccessExpression(arg0)) return;

    let root: ts.Expression = arg0;
    while (ts.isPropertyAccessExpression(root)) {
      root = root.expression;
    }
    if (!ts.isIdentifier(root) || root.text !== 'props') return;
    if (doc.hasEscapeHatchForNode(node, 'watch-reactive-property-getter', ast)) return;

    const { line } = doc.getNodeLineAndColumn(node, ast);
    this.addViolation({
      ruleId: 'watch-reactive-property-getter',
      severity: 'error',
      file: relPath,
      line,
      message:
        'Watching reactive property directly as value instead of a getter. Use watch(() => props.prop, ...) to preserve reactivity.',
      context: node.getText(ast).slice(0, 100).replace(/\n/g, '↵')
    });
  }

  private checkDestructuredReactive(
    node: ts.Node,
    ast: ts.SourceFile,
    doc: AuditedDocument,
    relPath: string
  ): void {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isObjectBindingPattern(node.name)) return;
    if (!node.initializer || !ts.isCallExpression(node.initializer)) return;

    let initCallee: ts.Expression = node.initializer.expression;
    while (ts.isParenthesizedExpression(initCallee)) initCallee = initCallee.expression;
    if (initCallee.getText(ast) !== 'reactive') return;
    if (doc.hasEscapeHatchForNode(node, 'no-destructured-reactive', ast)) return;

    const { line } = doc.getNodeLineAndColumn(node, ast);
    this.addViolation({
      ruleId: 'no-destructured-reactive',
      severity: 'error',
      file: relPath,
      line,
      message:
        'Destructuring reactive() object directly causes reactivity loss. Wrap with toRefs() before destructuring.',
      context: node.getText(ast).slice(0, 100).replace(/\n/g, '↵')
    });
  }

  private scanAst(
    doc: AuditedDocument,
    ast: ts.SourceFile,
    relPath: string,
    fullContent: string
  ): void {
    this.runSubAuditorSync('no-async-in-computed', () => {
      const visit = (node: ts.Node) => {
        this.checkAsyncInComputed(node, ast, doc, relPath);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    });

    this.runSubAuditorSync('watch-reactive-property-getter', () => {
      const visit = (node: ts.Node) => {
        this.checkWatchPropertyGetter(node, ast, doc, relPath);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    });

    this.runSubAuditorSync('no-destructured-reactive', () => {
      const visit = (node: ts.Node) => {
        this.checkDestructuredReactive(node, ast, doc, relPath);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    });

    const scriptContent = extractVueScriptOrRaw(relPath, fullContent) ?? fullContent;
    this.runSubAuditorSync('no-side-effects-in-computed', () => {
      this.auditComputedSideEffects(relPath, fullContent, scriptContent);
    });
  }

  private reportComputedViolation(
    relPath: string,
    fullContent: string,
    startIdx: number,
    needle: string,
    message: string
  ): void {
    const line = this.getLineNumber(fullContent, fullContent.indexOf(needle, startIdx));
    const lineContent = this.getLineAt(fullContent, line);

    if (this.hasEscapeHatch(lineContent, ['reactivity-ok', 'sfc-ok'])) return;

    this.addViolation({
      ruleId: 'no-side-effects-in-computed',
      severity: 'error',
      file: relPath,
      line,
      message,
      context: lineContent.trim()
    });
  }

  private auditDirectMutations(
    body: string,
    relPath: string,
    fullContent: string,
    startIdx: number
  ): void {
    const dirRegex = new RegExp(
      DIRECT_REACTIVE_MUTATION_REGEX.source,
      DIRECT_REACTIVE_MUTATION_REGEX.flags
    );
    let dirMatch: RegExpExecArray | null;
    while ((dirMatch = dirRegex.exec(body)) !== null) {
      this.reportComputedViolation(
        relPath,
        fullContent,
        startIdx,
        dirMatch[0],
        `In-place mutation '${dirMatch[0].trim()}' detected inside computed(). Mutating reactive state, props, or stores creates side effects.`
      );
    }
  }

  private evalLocalIdentifierMutation(
    targetVar: string,
    method: string,
    fullMatched: string,
    body: string
  ): string | null {
    const declRegex = new RegExp(`\\b(?:const|let|var)\\s+${targetVar}\\b([^;\\n]*)`);
    const declMatch = declRegex.exec(body);

    if (!declMatch) {
      return `In-place mutation '${fullMatched.trim()}' on external variable '${targetVar}' detected inside computed(). Create a shallow copy first.`;
    }

    const initExpr = declMatch[1] ?? '';
    const hasCloning =
      initExpr.includes('[...') ||
      initExpr.includes('.slice(') ||
      initExpr.includes('.filter(') ||
      initExpr.includes('.map(') ||
      initExpr.includes('Array.from(') ||
      initExpr.includes('new Array') ||
      initExpr.includes('[]') ||
      body.includes(`${targetVar} = [...`) ||
      body.includes(`${targetVar} = ${targetVar}.filter`);

    if (
      hasCloning ||
      (!initExpr.includes('props.') && !initExpr.includes('.value') && !initExpr.includes('store.'))
    ) {
      return null;
    }

    if (method === 'sort' || method === 'reverse') {
      return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first (e.g. [...${targetVar}].${method}()).`;
    }
    if (
      method === 'push' ||
      method === 'pop' ||
      method === 'shift' ||
      method === 'unshift' ||
      method === 'splice'
    ) {
      return `In-place mutation '${fullMatched.trim()}' on aliased reactive state detected inside computed(). Create a shallow copy first.`;
    }

    return null;
  }

  private auditLocalIdentifierMutations(
    body: string,
    relPath: string,
    fullContent: string,
    startIdx: number
  ): void {
    const locRegex = new RegExp(
      LOCAL_IDENTIFIER_MUTATION_REGEX.source,
      LOCAL_IDENTIFIER_MUTATION_REGEX.flags
    );
    let locMatch: RegExpExecArray | null;
    while ((locMatch = locRegex.exec(body)) !== null) {
      const fullMatched = locMatch[0];
      const targetVar = locMatch[1];
      const method = locMatch[2];

      if (!targetVar || !method) continue;
      if (locMatch.index > 0 && body[locMatch.index - 1] === '.') continue;
      if (targetVar === 'props' || targetVar === 'store' || targetVar === 'value') continue;

      const violationMessage = this.evalLocalIdentifierMutation(
        targetVar,
        method,
        fullMatched,
        body
      );
      if (violationMessage) {
        this.reportComputedViolation(relPath, fullContent, startIdx, fullMatched, violationMessage);
      }
    }
  }

  private auditRefAssignments(
    body: string,
    relPath: string,
    fullContent: string,
    startIdx: number
  ): void {
    const refAssignRegex = /\b[\w$]+\.value\s*=(?!=)/g;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = refAssignRegex.exec(body)) !== null) {
      this.reportComputedViolation(
        relPath,
        fullContent,
        startIdx,
        refMatch[0],
        `Mutation '${refMatch[0]}' detected inside computed(). Computed properties must be pure derivations without side effects.`
      );
    }
  }

  private auditComputedSideEffects(relPath: string, fullContent: string, script: string): void {
    const computedCallRegex = /\bcomputed\s*\(\s*(?:<[^>]+>\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{/g;
    let compMatch: RegExpExecArray | null;

    while ((compMatch = computedCallRegex.exec(script)) !== null) {
      const startIdx = compMatch.index + compMatch[0].length;
      const body = this.extractBalancedBlock(script, startIdx);
      if (!body) continue;

      this.auditDirectMutations(body, relPath, fullContent, startIdx);
      this.auditLocalIdentifierMutations(body, relPath, fullContent, startIdx);
      this.auditRefAssignments(body, relPath, fullContent, startIdx);
    }
  }

  private extractBalancedBlock(text: string, startIndex: number): string | null {
    let depth = 1;
    let i = startIndex;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth === 0) {
      return text.slice(startIndex, i - 1);
    }
    return null;
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateVueReactivityAuditor());
