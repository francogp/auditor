/**
 * scripts/auditors/architecture/validate_reactive_leaks.ts
 *
 * REACTIVE & DOM EVENT LEAK AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict memory leak prevention and listener hygiene across Vue components and composables:
 *   1. Event Listeners: Every window/document/element.addEventListener must either have { once: true },
 *      an explicit removeEventListener, or an unmount lifecycle hook (onUnmounted, onBeforeUnmount, onScopeDispose).
 *   2. Native Timers: Every setInterval must have a clearInterval.
 *
 * Escape Hatch:
 *   // leak-ok: <justification> or // reactive-leak-ok: <justification>
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_leaks.ts
 *   npm run validate:reactive-leaks
 */

import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export const REACTIVE_LEAK_RULES = ['dom-event-leak', 'interval-leak'] as const;

export type ReactiveLeakRuleId = (typeof REACTIVE_LEAK_RULES)[number];

function hasOnceOption(node: ts.CallExpression): boolean {
  if (node.arguments.length < 3) return false;
  const optionsArg = node.arguments[2];
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return false;

  for (const prop of optionsArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      prop.name &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'once'
    ) {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
      }
    }
  }
  return false;
}

function resolveReactiveRoots(
  config: ReturnType<typeof getAuditConfig>,
  customRoots?: readonly string[]
): readonly string[] {
  if (customRoots && customRoots.length > 0) return customRoots;
  return [
    ...(config.paths.componentsRoots ?? []),
    ...(config.paths.viewsRoots ?? []),
    ...(config.paths.composablesRoots ?? [])
  ];
}

export class ReactiveLeaksAuditor extends FileScanAuditor<ReactiveLeakRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = resolveReactiveRoots(config, roots);
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(REACTIVE_LEAK_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_reactive_leaks',
      name: 'Reactive & DOM Event Leak Auditor',
      description: 'Detecta posibles fugas de memoria y listeners sin limpiar',
      family: 'architecture',
      ruleIds: REACTIVE_LEAK_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(REACTIVE_LEAK_RULES, 'behavior'),
      packageName: 'Fuga',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '💧',
      ruleDescriptions: {
        'dom-event-leak': 'addEventListener sin limpiar',
        'interval-leak': 'setInterval sin limpiar'
      },
      ruleRemediations: {
        'dom-event-leak':
          'Causa Raíz:\n' +
          'Se registró un escucha de eventos ("addEventListener") sobre window, document o un elemento del DOM dentro de un componente o composable sin mecanismo de desregistro.\n' +
          'Si el componente se desmonta y el listener no se elimina, la función callback permanece viva en memoria y retiene todo el ámbito léxico del componente, produciendo fugas de memoria acumulativas.\n\n' +
          'Diagnóstico:\n' +
          'Revisa la llamada a "addEventListener". Faltan la opción "{ once: true }", la llamada a "removeEventListener" o el ciclo de vida "onUnmounted" / "onScopeDispose".\n\n' +
          'Solución Canónica:\n' +
          '1. Usar "useEventListener" de "@vueuse/core", que registra y remueve el listener automáticamente en sincronía con el ciclo de vida del componente.\n' +
          '2. Si usas la API nativa, define la función listener como variable con nombre y llama a "removeEventListener" dentro de "onUnmounted()".\n' +
          '3. Si el evento solo debe ocurrir una única vez, pasa "{ once: true }" como tercer argumento.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: listener huérfano sin limpieza\n' +
          'window.addEventListener("resize", handleResize);\n\n' +
          '// ✅ Correcto (Opción A): useEventListener de VueUse\n' +
          'import { useEventListener } from "@vueuse/core";\n' +
          'useEventListener(window, "resize", handleResize);\n\n' +
          '// ✅ Correcto (Opción B): limpieza explícita en onUnmounted\n' +
          'onMounted(() => window.addEventListener("resize", handleResize));\n' +
          'onUnmounted(() => window.removeEventListener("resize", handleResize));',
        'interval-leak':
          'Causa Raíz:\n' +
          'Se inició un temporizador repetitivo ("setInterval") en un componente o composable sin almacenar su identificador ni ejecutar "clearInterval".\n' +
          'El temporizador continuará ejecutándose indefinidamente cada N milisegundos en segundo plano incluso después de que la vista haya sido destruida, degradando la batería y la CPU.\n\n' +
          'Diagnóstico:\n' +
          'Busca la llamada a "setInterval" en el archivo señalado.\n\n' +
          'Solución Canónica:\n' +
          '1. Usar "useIntervalFn" de "@vueuse/core", que gestiona el arranque, pausa y destrucción automática con el hook de desmontaje de Vue.\n' +
          '2. Si usas la API nativa, almacena el handle retornado y cancela el temporizador en "onUnmounted()".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: setInterval sin cancelar\n' +
          'setInterval(() => { refreshData(); }, 5000);\n\n' +
          '// ✅ Correcto: useIntervalFn de VueUse\n' +
          'import { useIntervalFn } from "@vueuse/core";\n' +
          'useIntervalFn(() => { refreshData(); }, 5000);'
      },
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot
    });
  }

  private checkEventListenerLeak(
    node: ts.CallExpression,
    sf: ts.SourceFile,
    relPath: string,
    checkLineEscape: (lineNum: number) => boolean,
    hasRemoveEventListener: boolean,
    hasUnmountHook: boolean
  ): void {
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== 'addEventListener') return;

    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (checkLineEscape(line)) return;

    if (!hasOnceOption(node) && !hasRemoveEventListener && !hasUnmountHook) {
      this.addViolation({
        ruleId: 'dom-event-leak',
        severity: 'error',
        file: relPath,
        line,
        message:
          'addEventListener sin removeEventListener ni ciclo de vida onUnmounted / onScopeDispose (potencial fuga de memoria).',
        context: node.getText(sf)
      });
    }
  }

  private checkIntervalLeak(
    node: ts.CallExpression,
    sf: ts.SourceFile,
    relPath: string,
    checkLineEscape: (lineNum: number) => boolean,
    hasClearInterval: boolean
  ): void {
    const expr = node.expression;
    if (!ts.isIdentifier(expr) || expr.text !== 'setInterval') return;

    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (checkLineEscape(line) || hasClearInterval) return;

    this.addViolation({
      ruleId: 'interval-leak',
      severity: 'error',
      file: relPath,
      line,
      message: 'setInterval ejecutado sin clearInterval en el componente o composable.',
      context: node.getText(sf)
    });
  }

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
    // Fast string pre-filter to skip files that cannot contain reactive leaks
    if (!content.includes('addEventListener') && !content.includes('setInterval')) {
      return;
    }

    const sf = sourceFile ?? this.context.getAst(relPath, content);
    if (!sf.text.trim()) return;

    const fullLines = content.split('\n');
    const hasUnmountHook =
      content.includes('onUnmounted') ||
      content.includes('onBeforeUnmount') ||
      content.includes('onScopeDispose');
    const hasRemoveEventListener = content.includes('removeEventListener');
    const hasClearInterval = content.includes('clearInterval');

    const checkLineEscape = (lineNum: number): boolean => {
      const lineText = fullLines[lineNum - 1] || '';
      return lineText.includes('leak-ok') || lineText.includes('reactive-leak-ok');
    };

    this.runSubAuditorSync('dom-event-leak', () => {
      const visitEvents = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          this.checkEventListenerLeak(
            node,
            sf,
            relPath,
            checkLineEscape,
            hasRemoveEventListener,
            hasUnmountHook
          );
        }
        ts.forEachChild(node, visitEvents);
      };
      visitEvents(sf);
    });

    this.runSubAuditorSync('interval-leak', () => {
      const visitIntervals = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          this.checkIntervalLeak(node, sf, relPath, checkLineEscape, hasClearInterval);
        }
        ts.forEachChild(node, visitIntervals);
      };
      visitIntervals(sf);
    });
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ReactiveLeaksAuditor());
