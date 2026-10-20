/**
 * scripts/auditors/architecture/validate_type_check.ts
 *
 * TYPESCRIPT & VUE SFC TYPE CHECK AUDITOR (Node.js 26+ Native)
 *
 * Runs `vue-tsc --noEmit` across the repository, parses TypeScript compiler diagnostics,
 * maps them to StandardAuditResult findings with severity 'error', and persists structured
 * JSON reports to scratch/audits/architecture/validate_type_check.json.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process scripts/auditors/architecture/validate_type_check.ts
 *   npm run validate:types
 */

import path from 'node:path';
import fsSync from 'node:fs';
import { spawnSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import type { AuditFinding } from '../../core/auditContract.ts';

enableCompileCache();

export type TypeCheckRuleId = 'ts-compiler-error';

export const TYPE_CHECK_RULES: readonly TypeCheckRuleId[] = ['ts-compiler-error'] as const;

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;
const DEFAULT_ERROR_LINE = 1 as const;
const DECIMAL_RADIX = 10 as const;

const DIAGNOSTIC_REGEX =
  /^(?<file>[^(:\n]+)(?::(?<line>\d+):\d+|\((?<line2>\d+),\d+\))(?::\s*|\s*-\s*|\s+)(?:error|warning)\s+(?<code>TS\d+):\s*(?<msg>\S.*)$/;

function createFindingFromMatch(groups: Record<string, string>, cwd: string): AuditFinding {
  const rawFile = groups.file ?? '';
  const lineStr = groups.line ?? groups.line2 ?? '1';
  const code = groups.code ?? 'TS';
  const msg = groups.msg ?? 'TypeScript compiler error';

  const resolvedPath = path.isAbsolute(rawFile) ? path.relative(cwd, rawFile) : rawFile;
  const cleanFile = resolvedPath.split(path.sep).join(path.posix.sep);

  return {
    suiteId: 'validate_type_check',
    suiteName: 'TypeScript & Vue Type Validator',
    ruleId: 'ts-compiler-error',
    ruleDescription: 'TypeScript: Error de compilación o tipo',
    severity: 'error',
    file: cleanFile,
    line: Number.parseInt(lineStr, DECIMAL_RADIX) || DEFAULT_ERROR_LINE,
    context: code,
    message: msg
  };
}

/**
 * Parses raw diagnostic output from vue-tsc / tsc into canonical AuditFindings.
 */
export function parseTypeScriptDiagnostics(
  output: string,
  cwd: string = process.cwd()
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (!output || !output.trim()) return findings;

  const lines = output.split(/\r?\n/);
  let currentFinding: AuditFinding | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const match = DIAGNOSTIC_REGEX.exec(line);
    if (match?.groups) {
      if (currentFinding) {
        findings.push(currentFinding);
      }
      currentFinding = createFindingFromMatch(match.groups, cwd);
    } else if (currentFinding && line.startsWith('  ')) {
      currentFinding.message += ` ${line.trim()}`;
    }
  }

  if (currentFinding) {
    findings.push(currentFinding);
  }

  return findings;
}

function recordTsConfigFiles(projectRoot: string, recordScanned: (p: string) => void): void {
  try {
    const rootFiles = fsSync.readdirSync(projectRoot);
    for (const f of rootFiles) {
      if (f.startsWith('tsconfig') && f.endsWith('.json')) {
        recordScanned(path.join(projectRoot, f));
      }
    }
  } catch {
    // catch-ok: ignore unreadable project root
  }
}

function resolveTypeCheckBinary(projectRoot: string): { cmd: string; args: string[] } {
  const vueTscPath = path.resolve(projectRoot, 'node_modules/vue-tsc/bin/vue-tsc.js');
  if (fsSync.existsSync(vueTscPath)) {
    return { cmd: 'node', args: [vueTscPath, '--noEmit'] };
  }

  const tscCandidates = [
    path.resolve(projectRoot, 'node_modules/typescript/bin/tsc'),
    path.resolve(import.meta.dirname, '../../../node_modules/typescript/bin/tsc'),
    path.resolve(import.meta.dirname, '../../../../typescript/bin/tsc')
  ];

  for (const cand of tscCandidates) {
    if (fsSync.existsSync(cand)) {
      return { cmd: 'node', args: [cand, '--noEmit'] };
    }
  }

  return { cmd: 'tsc', args: ['--noEmit'] };
}

export interface TypeCheckAuditorOptions {
  readonly projectRoot?: string;
}

export class TypeCheckAuditor extends BaseAuditor<TypeCheckRuleId> {
  constructor(options: TypeCheckAuditorOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'TypeScript',
        fallbackBehavior: 'throw'
      },
      ruleCapabilities: createRuleCapabilities(TYPE_CHECK_RULES, {
        speed: ['light', 'full'],
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: true
      }),
      id: 'validate_type_check',
      name: 'TypeScript & Vue Type Validator',
      description: 'Errores de tipado y compilación en TypeScript y SFCs Vue',
      family: 'architecture',
      packageName: 'TypeScript',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🏷️',
      ruleIds: TYPE_CHECK_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TYPE_CHECK_RULES, 'contracts'),
      ruleDescriptions: {
        'ts-compiler-error': 'Error de compilación o tipo'
      },
      ruleRemediations: {
        'ts-compiler-error':
          '📖 GUÍA DE REMEDIACIÓN: ts-compiler-error\n' +
          '1. Causa Raíz: El compilador de TypeScript (`tsc` o `vue-tsc`) detectó un error de tipos, interfaz incompatible, propiedad inexistente o fallo de sintaxis estática (código de diagnóstico TSxxxx).\n' +
          '2. Diagnóstico: Revisa el archivo, número de línea y código de error TS emitido (ej: TS2322 tipo incompatible, TS2339 propiedad inexistente, TS2345 argumento inválido).\n' +
          '3. Solución Canónica:\n' +
          '   a) Corrige la firma de tipo o interfaz en el origen para que satisfaga el contrato estricto del compilador.\n' +
          '   b) Si faltan propiedades en un objeto literal, agrégalas según el tipo esperado o define la propiedad como opcional (`?`) si el dominio lo autoriza.\n' +
          '   c) Nunca utilices `// @ts-ignore` ni castings ciegos como `as any`. Modela los tipos con el rigor adecuado.\n' +
          '4. Ejemplo:\n' +
          '   ❌ TS2322: `const id: number = "123";`\n' +
          '   ✅ Tipado correcto: `const id: string = "123";`'
      },
      coverage: {
        include: [
          'src/**/*.ts',
          'src/**/*.vue',
          'scripts/**/*.ts',
          'tests/**/*.ts',
          'tsconfig*.json'
        ],
        source: 'declared-only'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    this.markRuleEvaluated('ts-compiler-error');
    recordTsConfigFiles(this.projectRoot, (p) => this.recordScanned(p));

    const { cmd, args: baseArgs } = resolveTypeCheckBinary(this.projectRoot);
    const tsBuildInfoPath = path.resolve(this.projectRoot, 'scratch/.tsbuildinfo');

    const standardArgs = [...baseArgs, '--pretty', 'false'];
    const incrementalArgs = [
      ...standardArgs,
      '--incremental',
      '--tsBuildInfoFile',
      tsBuildInfoPath
    ];

    const resolvedArgs = this.resolveCommandArgs<string[]>({
      command: 'tsc-type-check',
      defaultArgs: standardArgs,
      profiles: {
        light: incrementalArgs,
        full: standardArgs
      }
    });

    if (resolvedArgs.includes('--incremental')) {
      try {
        fsSync.mkdirSync(path.dirname(tsBuildInfoPath), { recursive: true });
      } catch {
        // catch-ok: ignore directory creation failures
      }
    } else if (fsSync.existsSync(tsBuildInfoPath)) {
      try {
        fsSync.unlinkSync(tsBuildInfoPath);
      } catch {
        // catch-ok: ignore failure deleting stale tsbuildinfo
      }
    }

    const proc = spawnSync(cmd, resolvedArgs, {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    const combinedOutput = `${proc.stdout || ''}\n${proc.stderr || ''}`;
    const findings = parseTypeScriptDiagnostics(combinedOutput, this.projectRoot);

    if (findings.length === 0 && (proc.error || proc.status !== 0)) {
      throw new Error(
        `[validate_type_check] El compilador terminó con estado ${String(proc.status)} pero no se pudo interpretar ningún diagnóstico (falso verde evitado). ` +
          `Salida: ${combinedOutput.trim().slice(0, 500)}${proc.error ? ` | error: ${proc.error.message}` : ''}`
      );
    }

    this.importAuditFindings(findings, 'ts-compiler-error', 'TS');
    this.recordExternalScanCount(1); // Project-level whole AST compilation
    this.context.setMetric('total_type_errors', findings.length);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new TypeCheckAuditor());
