/**
 * scripts/auditors/architecture/validate_error_suppression.ts
 *
 * ZERO ERROR SUPPRESSION AUDITOR (Node.js 26+ Native)
 *
 * Enforces the project's Zero Error Suppression Mandate (AGENTS.md):
 *   1. No Empty Catch Blocks (`no-empty-catch`):
 *      Forbids empty `catch {}` or `catch (err) {}` blocks that swallow exceptions silently.
 *   2. No Silent Promise Catch (`no-silent-promise-catch`):
 *      Forbids `.catch(() => {})`, `.catch(() => null)`, `.catch(() => undefined)`
 *      that discard promise rejections without re-throwing or logging.
 *   3. No Silent Mock Fallbacks (`no-silent-mock-fallbacks`):
 *      Forbids using schema fallback wrappers (such as `v.fallback(...)` in Valibot)
 *      that silently heal invalid data rather than failing loud at trust boundaries.
 *   4. Strict Catch Narrowing (`strict-catch-narrowing`):
 *      Requires explicit type narrowing (`if (err instanceof Error)`) before accessing
 *      `.message` or `.code` on caught exception objects.
 *
 * Escape Hatches:
 *   `// catch-ok: <reason>`, `// fallback-ok: <reason>`, `// error-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_error_suppression.ts
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities,
  resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { stripComments } from '../../core/scannerUtils.ts';

enableCompileCache();

export type ErrorSuppressionRuleId =
  | 'no-empty-catch'
  | 'no-silent-promise-catch'
  | 'no-silent-mock-fallbacks'
  | 'strict-catch-narrowing';

export const ERROR_SUPPRESSION_RULES: readonly ErrorSuppressionRuleId[] = [
  'no-empty-catch',
  'no-silent-promise-catch',
  'no-silent-mock-fallbacks',
  'strict-catch-narrowing'
] as const;

// Regex for empty catch: catch (...) { /* only spaces or comments */ }
const EMPTY_CATCH_REGEX = /catch\s*(?:\([^)]*\)\s*)?\{([^{}]*)\}/g;

// Regex for silent promise catches: .catch(() => {}) or .catch(() => null/undefined/false)
const SILENT_PROMISE_CATCH_REGEX =
  /\.catch\s*\(\s*(?:\(\s*\)|[a-zA-Z_$][\w$]*)\s*=>\s*(?:\{(?:\s*|\s*(?:\/\/[^\r\n]*\r?\n|\/\*[\s\S]*?\*\/)\s*)\}|null|undefined|false|true)\s*\)/g;

// Regex for Valibot fallback in schemas: v.fallback( or fallback(
const VALIBOT_FALLBACK_REGEX = /\b(?:v\.)?fallback\s*\(/g;

export class ErrorSuppressionAuditor extends FileScanAuditor<ErrorSuppressionRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, ['src', 'scripts']);

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      roots: targetRoots,
      projectRoot: effectiveRoot,
      ruleCapabilities: createRuleCapabilities(ERROR_SUPPRESSION_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_error_suppression',
      name: 'Zero Error Suppression Auditor',
      description: 'Prohíbe supresión de errores, catch vacíos y fallbacks',
      family: 'architecture',
      ruleIds: ERROR_SUPPRESSION_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(ERROR_SUPPRESSION_RULES, 'hygiene'),
      packageName: 'Error',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🚫',
      ruleDescriptions: {
        'no-empty-catch': 'Bloque catch vacío o silencioso',
        'no-silent-promise-catch': 'Promesa con .catch() silencioso',
        'no-silent-mock-fallbacks': 'Uso prohibido de v.fallback',
        'strict-catch-narrowing': 'Catch sin instanceof Error'
      },
      ruleRemediations: {
        'no-empty-catch':
          '📖 GUÍA DE REMEDIACIÓN: no-empty-catch\n' +
          '1. Causa Raíz: Se encontró un bloque catch vacío o que no realiza ninguna acción con el error capturado. Silenciar excepciones oculta defectos críticos y rompe el principio de fallo ruidoso (Loud Failure).\n' +
          '2. Diagnóstico: Ubica el bloque catch reportado en el archivo y línea indicados.\n' +
          '3. Solución Canónica:\n' +
          '   a) Propaga el error lanzando una excepción tipada (`throw error`).\n' +
          '   b) Registra o maneja formalmente el error si se trata de una degradación controlada.\n' +
          '   c) Si ignorar el error es estrictamente intencional y seguro (ej: intento de lectura de archivo opcional), anota `// catch-ok: <justificación técnica explícita>` dentro del catch.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Bloque catch vacío sin manejo ni justificación\n' +
          '   ✅ Correcto:   Manejar el error o documentar `// catch-ok: cleanup opcional si el recurso cerró`',
        'no-silent-promise-catch':
          '📖 GUÍA DE REMEDIACIÓN: no-silent-promise-catch\n' +
          '1. Causa Raíz: Se encadenó un manejador catch vacío o sin acción sobre una Promesa sin registrar ni re-lanzar el error, dejando la promesa en un estado resuelto opaco.\n' +
          '2. Diagnóstico: Revisa el handler catch de la promesa en la línea reportada.\n' +
          '3. Solución Canónica:\n' +
          '   a) Registra el error en el logger o propágalo al llamador.\n' +
          '   b) Si la omisión es segura y deliberada, documenta `// catch-ok: <justificación>` en la función callback.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Promesa con catch vacío que descarta silenciosamente el error\n' +
          '   ✅ Correcto:   `fetchData().catch((err) => { logger.error("Fallo al obtener datos", err); });`',
        'no-silent-mock-fallbacks':
          '📖 GUÍA DE REMEDIACIÓN: no-silent-mock-fallbacks\n' +
          '1. Causa Raíz: Uso del método `v.fallback()` en esquemas Valibot. Los fallbacks silenciosos en esquemas enmascaran corrupciones de datos o discrepancias en la API en lugar de activar fallos de validación tempranos.\n' +
          '2. Diagnóstico: Busca la llamada a `v.fallback(...)` en los esquemas de validación.\n' +
          '3. Solución Canónica: Elimina `v.fallback()`. Si un campo es opcional en la API, tipifícalo explícitamente con `v.optional(...)` o `v.nullish(...)` y define el valor predeterminado en el constructor de dominio o factoría.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Uso de fallback silencioso en el esquema\n' +
          '   ✅ Correcto:   `v.optional(v.string(), "default")`',
        'strict-catch-narrowing':
          '📖 GUÍA DE REMEDIACIÓN: strict-catch-narrowing\n' +
          '1. Causa Raíz: En TypeScript moderno con `useUnknownInCatchVariables: true`, la variable de error en catch es de tipo `unknown`. Acceder a propiedades como message o stack sin verificar `instanceof Error` provoca fallos en tiempo de ejecución si el valor lanzado no es un objeto Error.\n' +
          '2. Diagnóstico: Ubica el acceso no seguro a propiedades de error en el bloque catch.\n' +
          '3. Solución Canónica: Estrecha el tipo mediante `e instanceof Error ? e.message : String(e)` o utiliza un helper de extracción tipado como `toErrorMessage(e)`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: Acceso directo a propiedades de error sobre un tipo unknown sin narrowing\n' +
          '   ✅ Correcto:   `const msg = e instanceof Error ? e.message : String(e);`'
      },
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    this.runSubAuditorSync('no-empty-catch', () => {
      this.auditEmptyCatch(relPath, content);
    });
    this.runSubAuditorSync('no-silent-promise-catch', () => {
      this.auditSilentPromiseCatch(relPath, content);
    });
    this.runSubAuditorSync('no-silent-mock-fallbacks', () => {
      this.auditSchemaFallbacks(relPath, content);
    });
    this.runSubAuditorSync('strict-catch-narrowing', () => {
      this.auditCatchNarrowing(relPath, content);
    });
  }

  private forEachNonCommentMatch(
    content: string,
    regexTemplate: RegExp,
    callback: (match: RegExpExecArray, line: number, lineContent: string) => void
  ): void {
    const regex = new RegExp(regexTemplate.source, regexTemplate.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const lineContent = this.getLineAt(content, line);
      const trimmed = lineContent.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      callback(match, line, lineContent);
    }
  }

  private auditEmptyCatch(relPath: string, content: string): void {
    this.forEachNonCommentMatch(content, EMPTY_CATCH_REGEX, (match, line, lineContent) => {
      const innerContent = match[1] ?? '';
      const strippedComments = stripComments(innerContent).trim();

      if (strippedComments.length === 0) {
        if (
          this.hasEscapeHatch(lineContent, ['catch-ok', 'error-ok']) ||
          this.hasEscapeHatch(match[0], ['catch-ok', 'error-ok']) ||
          this.hasEscapeHatch(innerContent, ['catch-ok', 'error-ok'])
        ) {
          return;
        }

        this.addViolation({
          ruleId: 'no-empty-catch',
          severity: 'error',
          file: relPath,
          line,
          message: `Empty catch block detected. Swallowing errors violates the Zero Error Suppression Mandate. Fail loudly or log with reason.`,
          context: match[0].slice(0, 100)
        });
      }
    });
  }

  private auditSilentPromiseCatch(relPath: string, content: string): void {
    this.forEachNonCommentMatch(content, SILENT_PROMISE_CATCH_REGEX, (match, line, lineContent) => {
      if (
        this.hasEscapeHatch(lineContent, ['catch-ok', 'error-ok']) ||
        this.hasEscapeHatch(match[0], ['catch-ok', 'error-ok'])
      ) {
        return;
      }

      this.addViolation({
        ruleId: 'no-silent-promise-catch',
        severity: 'error',
        file: relPath,
        line,
        message: `Silent promise .catch() handler detected. Swallowing rejections silently is strictly forbidden. Log or handle the rejection explicitly.`,
        context: match[0].slice(0, 100)
      });
    });
  }

  private auditSchemaFallbacks(relPath: string, content: string): void {
    if (
      !relPath.includes('schema') &&
      !relPath.includes('models') &&
      !relPath.includes('storage')
    ) {
      return;
    }

    this.forEachNonCommentMatch(content, VALIBOT_FALLBACK_REGEX, (_match, line, lineContent) => {
      if (this.hasEscapeHatch(lineContent, ['fallback-ok', 'schema-ok'])) {
        return;
      }

      this.addViolation({
        ruleId: 'no-silent-mock-fallbacks',
        severity: 'error',
        file: relPath,
        line,
        message: `Schema fallback detected via fallback(). Runtime schema auto-heal is prohibited; data schemas must fail loud on invalid shapes.`,
        context: lineContent.trim()
      });
    });
  }

  private auditCatchNarrowing(relPath: string, content: string): void {
    const catchBlockRegex = /catch\s*\(\s*([a-zA-Z_$][\w$]*)\s*\)\s*\{([\s\S]*?)\}/g;
    let match: RegExpExecArray | null;

    while ((match = catchBlockRegex.exec(content)) !== null) {
      const varName = match[1]!;
      const blockBody = match[2]!;

      // Check if blockBody accesses varName.message or (varName as any).message
      const hasMessageAccess = new RegExp(
        `\\b${varName}\\.message\\b|\\(\\s*${varName}\\s+as\\s+` + `any\\s*\\)\\.message`
      ).test(blockBody);
      if (hasMessageAccess) {
        // Check if there is an instanceof Error check
        const hasInstanceCheck = new RegExp(`\\b${varName}\\s+instanceof\\s+Error\\b`).test(
          blockBody
        );
        if (!hasInstanceCheck) {
          const line = this.getLineNumber(content, match.index);
          const lineContent = this.getLineAt(content, line);

          if (this.hasEscapeHatch(lineContent, ['catch-ok', 'error-ok'])) {
            continue;
          }

          this.addViolation({
            ruleId: 'strict-catch-narrowing',
            severity: 'error',
            file: relPath,
            line,
            message: `Caught error '${varName}' accessed without strict type narrowing. Verify '${varName} instanceof Error' before reading properties.`,
            context: `catch (${varName})`
          });
        }
      }
    }
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new ErrorSuppressionAuditor());
