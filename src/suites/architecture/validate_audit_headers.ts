/**
 * scripts/auditors/architecture/validate_audit_headers.ts
 *
 * ILLEGAL AUDIT HEADERS & FILE-LEVEL SUPPRESSIONS AUDITOR (Node.js 26+)
 *
 * Enforces the project's Absolute Prohibition on File-Level Audit Ignores
 * and Zero-Ignore policies across the codebase:
 *   - Detects fallow file-level ignore directives.
 *   - Detects whole-file eslint-disable blocks.
 *   - Detects banned TypeScript compiler bypasses (@ts-nocheck, @ts-ignore, @ts-expect-error).
 *   - Detects auditor escape hatches misused as standalone file header comments.
 *   - Strictly respects project-level DIRECTORY IGNORES.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_audit_headers.ts
 *   npm run validate:audit-headers
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import type { FindingSeverity } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  FileScanAuditor,
  CANONICAL_IGNORE_DIRS,
  isPathIgnored,
  loadFallowIgnorePatterns,
  getEffectiveScannableRoots,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export const MAX_HEADER_LINES_CHECK = 10;

export type HeaderRuleId =
  | 'file-level-fallow-ignore'
  | 'file-level-eslint-disable'
  | 'banned-ts-suppression'
  | 'banned-magic-suppression'
  | 'banned-style-suppression'
  | 'header-auditor-escape'
  | 'unjustified-escape-hatch';

export const HEADER_RULES: readonly HeaderRuleId[] = [
  'file-level-fallow-ignore',
  'file-level-eslint-disable',
  'banned-ts-suppression',
  'banned-magic-suppression',
  'banned-style-suppression',
  'header-auditor-escape',
  'unjustified-escape-hatch'
];

export interface HeaderViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: HeaderRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}

export interface AuditHeadersResult {
  readonly filesScanned: number;
  readonly violations: readonly HeaderViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<string, number>;
}

export { CANONICAL_IGNORE_DIRS, isPathIgnored, loadFallowIgnorePatterns };

const FALLOW_IGNORE_FILE_REGEX = /^\s*\/\/\s*fallow-ignore-file\b/i;
const TS_SUPPRESSION_REGEX = /^\s*\/\/\s*@ts-(?:nocheck|ignore|expect-error)\b/i;
const ESLINT_DISABLE_BLOCK_REGEX =
  /^\s*\/\*\s*(?:eslint|oxlint)-disable\b(?!\s*-(?:next-line|line)\b)/i;
const ESLINT_DISABLE_TEMPLATE_REGEX =
  /^\s*<!--\s*(?:eslint|oxlint)-disable\b(?!\s*-(?:next-line|line)\b)/i;
const BANNED_MAGIC_SUPPRESSION_REGEX = /\/\/\s*(?:no-magic|magic-ok|number-ok)\b/i;
const BANNED_STYLE_SUPPRESSION_REGEX = /\/\/\s*(?:style-inherited|style-ok)\b/i;
const STANDALONE_ESCAPE_HATCHES_REGEX =
  /^\s*\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok)\s*$/i;
const UNJUSTIFIED_ESCAPE_HATCH_REGEX =
  /\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok|uuid-ok|infra-id-ok|spanish-ok|open-record|runtime-set|runtime-map|lib-duplicate-ok|fallback-ok)\b(?!\s*:\s*\S)/i;

function checkLineForIllegalHeaders(
  filePath: string,
  rawLine: string,
  lineNum: number
): HeaderViolation | null {
  const trimmed = rawLine.trim();

  // 1. Check for // fallow-ignore-file starting the comment line
  if (FALLOW_IGNORE_FILE_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'file-level-fallow-ignore',
      message: `Cabecera ilegal 'fallow-ignore-file' detectada. Está ESTRICTAMENTE PROHIBIDO silenciar auditorías para archivos completos. Resuelve el problema en el código o excluye el directorio a nivel de configuración global.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 2. Check for @ts-nocheck, @ts-ignore, @ts-expect-error starting the comment line
  if (TS_SUPPRESSION_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'banned-ts-suppression',
      message: `Supresión de TypeScript detectada ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibido por la política 'Zero-Ignore'.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 3. Check for file-level / block-level /* eslint-disable */
  if (ESLINT_DISABLE_BLOCK_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'file-level-eslint-disable',
      message: `Bloque '/* eslint-disable */' a nivel de archivo detectado. Usa 'eslint-disable-next-line' acotado a la línea específica únicamente cuando esté estrictamente justificado.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // Check for template-level <!-- eslint-disable -->
  if (ESLINT_DISABLE_TEMPLATE_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'file-level-eslint-disable',
      message: `Directiva '<!-- eslint-disable -->' a nivel de template detectada. Evita deshabilitar reglas en templates enteros.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 4. Check for banned magic number suppression directives
  const bannedMagicMatch = rawLine.match(BANNED_MAGIC_SUPPRESSION_REGEX);
  if (bannedMagicMatch) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'banned-magic-suppression',
      message: `Directiva de escape prohibida '// ${bannedMagicMatch[1]}' detectada. La política de Zero Magic Numbers exige declarar constantes descriptivas ('as const') sin excepciones.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 5. Check for banned style inheritance/suppression directives
  const bannedStyleMatch = rawLine.match(BANNED_STYLE_SUPPRESSION_REGEX);
  if (bannedStyleMatch) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'banned-style-suppression',
      message: `Directiva de escape prohibida '// ${bannedStyleMatch[1]}' detectada. Los estilos scoped de Vue 3 no penetran a componentes hijos; está estrictamente prohibido usar comentarios de herencia simulada de estilos. Cada componente con clases debe vincular o declarar sus estilos explícitamente.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 6. Check for standalone escape hatches in header lines
  if (lineNum <= MAX_HEADER_LINES_CHECK && STANDALONE_ESCAPE_HATCHES_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'header-auditor-escape',
      message: `Anotación de escape '${trimmed}' usada indebidamente como cabecera de archivo. Las anotaciones de escape deben añadirse únicamente al final de sentencias de código activas.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 7. Check for ANY unjustified escape hatch without mandatory ': <motivo>'
  const unjustifiedMatch = rawLine.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
  if (unjustifiedMatch) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'unjustified-escape-hatch',
      message: `[GUÍA DE ESCAPE HATCHES / IGNORES JUSTIFICADOS] Escape hatch '// ${unjustifiedMatch[1]}' sin justificación técnica obligatoria.
   📚 FORMATO CANÓNICO REQUERIDO: '// ${unjustifiedMatch[1]}: <motivo técnico detallado>'
   💡 EJEMPLOS VÁLIDOS SEGÚN EL CASO:
      - // domain-ok: Texto dinámico de UI, mensajes de chat o cadenas narrativas
      - // uuid-ok: UUID de base de datos o identificador único de sesión
      - // infra-id-ok: Identificador DOM o socket de red externo
      - // open-record: Contenedor JSON dinámico de clave-valor genérico
      - // runtime-set: Set O(1) de validación rápida de identificadores
      - // spanish-ok: Etiqueta o texto de interfaz en español
   ⚠️ PROHIBICIÓN: Nunca uses ignores genéricos ni los uses para ocultar errores de tipado en entidades del sistema.`,
      context: trimmed,
      severity: 'error'
    };
  }

  return null;
}

/**
 * Scans file contents for illegal suppression headers or file-level ignores.
 */
export function scanFileForIllegalHeaders(filePath: string, content: string): HeaderViolation[] {
  const violations: HeaderViolation[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const violation = checkLineForIllegalHeaders(filePath, lines[i]!, i + 1);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

/**
 * Object-oriented FileScanAuditor implementation for Illegal Audit Headers.
 */
export class AuditHeadersAuditor extends FileScanAuditor<HeaderRuleId> {
  private readonly collectedViolations: HeaderViolation[] = [];

  constructor(roots?: readonly string[], projectRoot?: string) {
    const headerRoots = roots ?? getEffectiveScannableRoots(getAuditConfig(projectRoot));
    super({
      usesThirdPartyTool: false,
      roots: headerRoots,
      projectRoot,
      ruleCapabilities: createRuleCapabilities(HEADER_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_audit_headers',
      name: 'Audit Headers & Suppression Validator',
      description: 'Prohíbe supresiones a nivel de archivo e ignores globales',
      family: 'architecture',
      ruleIds: HEADER_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(HEADER_RULES, 'polish'),
      packageName: 'Header',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '📰',
      ruleDescriptions: {
        'file-level-fallow-ignore': 'fallow-ignore-file prohibido',
        'file-level-eslint-disable': 'eslint-disable global prohibido',
        'banned-ts-suppression': '@ts-ignore/@ts-nocheck prohibido',
        'banned-magic-suppression': 'Escape de número mágico prohibido',
        'banned-style-suppression': 'Escape de estilos prohibido',
        'header-auditor-escape': 'Escape hatch mal ubicado',
        'unjustified-escape-hatch': 'Escape hatch sin justificación'
      },
      ruleRemediations: {
        'file-level-fallow-ignore':
          '1. Causa Raíz: Se encontró una directiva de supresión global `/* fallow-ignore-file */` o equivalente en la cabecera del archivo, ocultando deuda técnica, código muerto o duplicaciones en todo el módulo.\n2. Diagnóstico: Busca comentarios al inicio del archivo que contengan `fallow-ignore-file`.\n3. Solución Canónica: Elimina la directiva global. Si existe una excepción justificada para una sentencia puntual, acota la excepción a nivel de línea o aborda legítimamente la advertencia de Fallow refactorizando el código.\n4. Ejemplo:\n// Incorrecto:\n/* fallow-ignore-file */\n\n// Correcto: Resolver las violaciones en el módulo o solicitar excepción acotada con justificación.',
        'file-level-eslint-disable':
          '1. Causa Raíz: Se declaró una directiva `/* eslint-disable */` o `/* oxlint-disable */` sin acotar a una regla específica o aplicándola a todo el archivo.\n2. Diagnóstico: Revisa las primeras líneas del archivo para localizar comentarios `eslint-disable` globales.\n3. Solución Canónica: Elimina el disable global. Corrige el código para cumplir con el linter o, si es estrictamente inevitable, deshabilita únicamente la regla específica en la línea exacta mediante `// eslint-disable-next-line <regla> -- <motivo>`.\n4. Ejemplo:\n// Incorrecto:\n/* eslint-disable */\n\n// Correcto:\n// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Interoperabilidad con API externa no tipada',
        'banned-ts-suppression':
          '1. Causa Raíz: Uso de directivas de silenciamiento ciego `@ts-ignore` o `@ts-nocheck` en el archivo, lo que destruye la seguridad del sistema de tipos.\n2. Diagnóstico: Busca `@ts-ignore` o `@ts-nocheck` en el código fuente.\n3. Solución Canónica: Corrige los tipos en las interfaces, funciones o aserciones. Si existe un error conocido en una librería externa sin tipos, utiliza `@ts-expect-error` acompañado de un comentario explicativo obligatorio.\n4. Ejemplo:\n// Incorrecto:\n// @ts-ignore\nconst x = foo.bar();\n\n// Correcto:\n// @ts-expect-error - Librería externa emite tipos incorrectos en v1.2\nconst x = foo.bar();',
        'banned-magic-suppression':
          '1. Causa Raíz: Se intentó suprimir la auditoría de números mágicos mediante comentarios no canónicos o a nivel de cabecera.\n2. Diagnóstico: Revisa comentarios que intenten desactivar la regla de números mágicos en el archivo.\n3. Solución Canónica: Extrae los valores numéricos a constantes con significado semántico o tómalos del catálogo de tokens de diseño o configuración (`constants.ts`, `tokens.ts`).\n4. Ejemplo:\n// Incorrecto:\n// magic-number-disable\nconst timeout = 5000;\n\n// Correcto:\nexport const NETWORK_RETRY_DELAY_MS = 5000;\nconst timeout = NETWORK_RETRY_DELAY_MS;',
        'banned-style-suppression':
          '1. Causa Raíz: Se detectó una supresión global de reglas de estilos `/* stylelint-disable */` en la cabecera o bloque de estilos.\n2. Diagnóstico: Inspecciona las directivas `stylelint-disable` en archivos `.css`, `.scss` o bloques `<style>` de Vue.\n3. Solución Canónica: Corrige las propiedades CSS, anidamientos o valores z-index según los lineamientos de diseño. No apagues Stylelint a nivel de archivo.\n4. Ejemplo:\n// Incorrecto:\n/* stylelint-disable */\n.card { z-index: 99999; }\n\n// Correcto: Usar variables de z-index del sistema o corregir el selector.',
        'header-auditor-escape':
          '1. Causa Raíz: Se ubicó un comentario de escape o excepción de auditoría en la cabecera del archivo en vez de colocarlo directamente sobre la línea de código afectada.\n2. Diagnóstico: Revisa si hay comentarios como `// layout-ok:` o similar en el encabezado o imports del archivo.\n3. Solución Canónica: Mueve el escape hatch inmediatamente antes de la sentencia que lo requiere, o elimina el comentario si ya no es aplicable.\n4. Ejemplo:\n// Incorrecto: Colocar // layout-ok en la línea 1 del archivo\n// Correcto: Ubicar el comentario exactamente antes de gsap.set(elem, { width: 100 })',
        'unjustified-escape-hatch':
          '1. Causa Raíz: Se utilizó un escape hatch (ej. `layout-ok`, `@ts-expect-error`) sin proporcionar la justificación técnica requerida.\n2. Diagnóstico: Identifica comentarios de excepción que carecen de explicación o dos puntos seguidos del motivo (`// layout-ok: <explicación>`).\n3. Solución Canónica: Agrega una justificación clara y detallada explicando el motivo arquitectónico o la limitación técnica que fundamenta el escape.\n4. Ejemplo:\n// Incorrecto:\n// layout-ok\n\n// Correcto:\n// layout-ok: Animación de ancho de contenedor requerida por diseño responsive no transformable'
      }
    });
  }

  public getViolations(): readonly HeaderViolation[] {
    return this.collectedViolations;
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    // 1. fallow-ignore-file
    this.runSubAuditorSync('file-level-fallow-ignore', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (FALLOW_IGNORE_FILE_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'file-level-fallow-ignore' as const,
            message: `Cabecera ilegal 'fallow-ignore-file' detectada. Está ESTRICTAMENTE PROHIBIDO silenciar auditorías para archivos completos. Resuelve el problema en el código o excluye el directorio a nivel de configuración global.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 2. banned-ts-suppression
    this.runSubAuditorSync('banned-ts-suppression', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (TS_SUPPRESSION_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'banned-ts-suppression' as const,
            message: `Supresión de TypeScript detectada ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibido por la política 'Zero-Ignore'.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 3. file-level-eslint-disable
    this.runSubAuditorSync('file-level-eslint-disable', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (ESLINT_DISABLE_BLOCK_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'file-level-eslint-disable' as const,
            message: `Bloque '/* eslint-disable */' o '/* oxlint-disable */' a nivel de archivo detectado. Usa directivas acotadas a la línea específica únicamente cuando esté estrictamente justificado.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        } else if (ESLINT_DISABLE_TEMPLATE_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'file-level-eslint-disable' as const,
            message: `Directiva '<!-- eslint-disable -->' o '<!-- oxlint-disable -->' a nivel de template detectada. Evita deshabilitar reglas en templates enteros.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 4. banned-magic-suppression
    this.runSubAuditorSync('banned-magic-suppression', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (BANNED_MAGIC_SUPPRESSION_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'banned-magic-suppression' as const,
            message: `Supresión de número mágico desaconsejada detectada ('/' + '/ no-magic', '/' + '/ magic-ok', '/' + '/ number-ok'). Centraliza los números en constantes de dominio con 'as const' o tipado explícito.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 5. banned-style-suppression
    this.runSubAuditorSync('banned-style-suppression', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (BANNED_STYLE_SUPPRESSION_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'banned-style-suppression' as const,
            message: `Supresión de estilos prohibida detectada ('/' + '/ style-inherited', '/' + '/ style-ok'). Todos los componentes .vue DEBEN incluir su propio bloque <style lang="scss"> según la gobernanza de arquitectura.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 6. header-auditor-escape
    this.runSubAuditorSync('header-auditor-escape', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (STANDALONE_ESCAPE_HATCHES_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'header-auditor-escape' as const,
            message: `Escape hatch huérfano o mal ubicado detectado ('${line.trim()}'). Los escapes deben ubicarse en la misma línea del statement o inmediatamente precediéndolo con ':' y el motivo técnico.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 7. unjustified-escape-hatch
    this.runSubAuditorSync('unjustified-escape-hatch', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const unjustifiedMatch = line.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
        if (unjustifiedMatch) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'unjustified-escape-hatch' as const,
            message: `[GUÍA DE ESCAPE HATCHES / IGNORES JUSTIFICADOS] Escape hatch '// ${unjustifiedMatch[1]}' sin justificación técnica obligatoria.
    📚 FORMATO CANÓNICO REQUERIDO: '// ${unjustifiedMatch[1]}: <motivo técnico detallado>'
    ⚠️ PROHIBICIÓN: Nunca uses ignores genéricos ni los uses para ocultar errores de tipado en entidades del sistema.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });
  }
}

/**
 * Legacy procedural audit runner preserved for testing and external consumers.
 */
export function auditAuditHeaders(targetDir = process.cwd()): AuditHeadersResult {
  const config = getAuditConfig(targetDir);
  const scannableRoots = getEffectiveScannableRoots(config);
  const rootsToScan = scannableRoots.filter((r) => fs.existsSync(path.resolve(targetDir, r)));

  const auditor = new AuditHeadersAuditor(rootsToScan);
  const files = auditor['context'].collectFiles(rootsToScan);
  for (const file of files) {
    const relPath = path.relative(targetDir, file).split(path.sep).join(path.posix.sep);
    try {
      const content = fs.readFileSync(file, 'utf-8');
      auditor['recordScanned'](relPath);
      auditor['scanFile'](relPath, content);
    } catch {
      // catch-ok: Ignore read errors
    }
  }

  const violations = auditor.getViolations();
  const countsByRule: Record<string, number> = {};
  for (const r of HEADER_RULES) {
    countsByRule[r] = auditor.getCountsByRule().get(r) ?? 0;
  }

  return {
    filesScanned: auditor.getFilesScanned(),
    violations,
    passed: violations.length === 0,
    countsByRule
  };
}

// Direct CLI Execution Integration
if (
  process.argv[1] &&
  (process.argv[1].endsWith('validate_audit_headers.ts') ||
    process.argv[1].endsWith('validate_audit_headers.js'))
) {
  await BaseAuditor.runCli(new AuditHeadersAuditor());
}
