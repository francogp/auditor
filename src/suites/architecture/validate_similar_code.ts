/**
 * packages/auditor/src/suites/architecture/validate_similar_code.ts
 *
 * FALLOW SIMILAR-CODE SEMANTIC DUPLICATION AUDITOR (Node.js 26+)
 *
 * Detects semantically similar functions across the repository using Fallow's
 * local vector embeddings model (jina-embeddings-v2-base-code).
 *
 * Key Architectural Guards:
 *   1. Zero Fast-Preset Impact: Completely excluded from fast presets (speed=light, preset=md).
 *   2. Strict High Threshold: Defaults to 0.95 threshold to eliminate cognitive noise and false positives.
 *   3. Intra-File Filtering: Skips pairs within the same file (e.g. sync/async pairs like safeWriteFileSync/safeWriteFile).
 *   4. Auto-Initialization: If the companion model is not ready, automatically downloads and sets up the local model with clear console notification.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import childProcess from 'node:child_process';
import { styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases } from '../../core/auditorBase.ts';
import type { AuditorCapabilities } from '../../core/auditContract.ts';
import { isProductionEnvironment } from '../../core/auditorEnvironment.ts';
import {
  getAuditConfig,
  isTestPath,
  AUDIT_CONFIG_FILE,
  type AuditFallowSimilarCodeConfig
} from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import {
  DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
  DEFAULT_SUBPROCESS_TIMEOUT_MS,
  resolvePackageBin
} from '../../cli/cliUtils.ts';

enableCompileCache();

export const SIMILAR_CODE_RULES = ['fallow-similar-code', 'fallow-similar-code-failed'] as const;

export type SimilarCodeRuleId = (typeof SIMILAR_CODE_RULES)[number];

export const SIMILAR_CODE_RULE_CAPABILITIES: Record<SimilarCodeRuleId, AuditorCapabilities> = {
  'fallow-similar-code': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: false,
    critical: false
  },
  'fallow-similar-code-failed': {
    speed: 'heavy',
    phase: 'normal',
    fix: 'none',
    md: false,
    ast: false,
    changedOnly: false,
    critical: false
  }
};

export const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export const WINDOWS_UNBLOCK_TIMEOUT_MS = 5000;

export interface SimilarCodeCandidateLocation {
  path: string;
  name: string;
  start_line: number;
  start_column?: number;
  end_line?: number;
  end_column?: number;
}

export interface SimilarCodeCandidate {
  candidate_id?: string;
  left: SimilarCodeCandidateLocation;
  right: SimilarCodeCandidateLocation;
  similarity: number;
  similarity_band?: string;
}

export interface SimilarCodeOutput {
  kind?: string;
  candidates?: SimilarCodeCandidate[];
}

export interface SimilarCodeStatusOutput {
  kind?: string;
  model_ready?: boolean;
}

export function resolveFallowBinary(projectRoot: string = process.cwd()): string | null {
  return resolvePackageBin('fallow', { projectRoot, fallbackRelativeBin: 'bin/fallow' });
}

export function isFastPresetActive(): boolean {
  const args = process.argv.join(' ');
  return args.includes('--preset=lint') || args.includes('--preset=md');
}

export function isSimilarCodeSkipped(): boolean {
  return (
    isProductionEnvironment() ||
    process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === 'true' ||
    process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === '1' ||
    process.env.AUDIT_SKIP_SIMILAR === 'true' ||
    process.env.AUDIT_SKIP_SIMILAR === '1'
  );
}

export function resolveFallowUserCacheDir(): string {
  if (process.platform === 'win32') {
    const rawLocal = process.env.LOCALAPPDATA;
    const localAppData = rawLocal
      ? path.resolve(rawLocal)
      : path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'fallow', 'similar-code');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'fallow', 'similar-code');
  }
  const rawXdg = process.env.XDG_CACHE_HOME;
  const xdg = rawXdg ? path.resolve(rawXdg) : path.join(os.homedir(), '.cache');
  return path.join(xdg, 'fallow', 'similar-code');
}

export function ensureSimilarCodeCacheDir(_projectRoot?: string): string {
  const cacheDir = resolveFallowUserCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const modelsDir = path.join(cacheDir, 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  const vectorsDir = path.join(cacheDir, 'vectors');
  if (!fs.existsSync(vectorsDir)) {
    fs.mkdirSync(vectorsDir, { recursive: true });
  }
  return cacheDir;
}

export function checkOrInitializeModel(
  fallowBin: string,
  projectRoot: string,
  isFix: boolean = false
): boolean {
  ensureSimilarCodeCacheDir(projectRoot);

  if (isFix && process.platform === 'win32') {
    try {
      const candidates = [
        path.resolve(projectRoot, 'node_modules/@fallow-cli'),
        path.resolve(process.cwd(), 'node_modules/@fallow-cli')
      ];
      for (const dir of candidates) {
        if (fs.existsSync(dir)) {
          childProcess.execSync(
            `powershell.exe -NoProfile -Command "Get-ChildItem -Path '${dir}' -Recurse -Filter '*.exe' -ErrorAction SilentlyContinue | Unblock-File"`,
            { stdio: 'ignore', timeout: WINDOWS_UNBLOCK_TIMEOUT_MS }
          );
        }
      }
    } catch {
      // catch-ok: non-fatal unblock attempt on Windows binaries
    }
  }

  try {
    const statusOut = childProcess.execSync(
      `node "${fallowBin}" similar-code status --format json`,
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: DEFAULT_SUBPROCESS_TIMEOUT_MS
      }
    );
    const parsed = JSON.parse(statusOut) as SimilarCodeStatusOutput;
    if (parsed.model_ready === true) {
      return true;
    }
  } catch {
    // catch-ok: Model status query failed, attempt setup below
  }

  process.stdout.write(
    styleText(
      'cyan',
      '📦 El modelo de embeddings local para Fallow similar-code no está inicializado. Descargando e inicializando automáticamente...\n'
    )
  );

  try {
    childProcess.execSync(`node "${fallowBin}" similar-code setup --local --yes`, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
      timeout: 0
    });
    return true;
  } catch (err) {
    process.stderr.write(
      styleText(
        'yellow',
        `⚠️ No se pudo inicializar el modelo de similar-code: ${(err as Error).message}. Se omitirá el análisis vectorial.\n`
      )
    );
    return false;
  }
}

function normalizeRelativeCandidatePath(rawPath: string | undefined, projectRoot: string): string {
  if (!rawPath) return '';
  return toPosixRelative(projectRoot, rawPath);
}

interface CandidatePairIgnoreOptions {
  leftPath: string;
  rightPath: string;
  ignoreSameFile: boolean;
  auditor: ValidateSimilarCodeAuditor;
  includeTests: boolean;
}

function isCandidatePairIgnored(options: CandidatePairIgnoreOptions): boolean {
  if (options.ignoreSameFile && options.leftPath === options.rightPath) return true;
  if (
    options.auditor.isPathIgnored(options.leftPath) ||
    options.auditor.isPathExempt(options.leftPath) ||
    options.auditor.isPathIgnored(options.rightPath) ||
    options.auditor.isPathExempt(options.rightPath)
  )
    return true;
  if (!options.includeTests && (isTestPath(options.leftPath) || isTestPath(options.rightPath)))
    return true;
  return false;
}

function reportSingleCandidateViolation(
  c: SimilarCodeCandidate,
  leftPath: string,
  rightPath: string,
  auditor: ValidateSimilarCodeAuditor
): void {
  const similarityPct = (c.similarity * 100).toFixed(1);
  const leftDesc = `${c.left.name} (${leftPath}:${c.left.start_line})`;
  const rightDesc = `${c.right.name} (${rightPath}:${c.right.start_line})`;

  auditor.addViolation({
    ruleId: 'fallow-similar-code',
    severity: 'error',
    file: leftPath,
    line: c.left.start_line || 1,
    message: `Similitud semántica crítica (${similarityPct}%) entre '${c.left.name}' y '${c.right.name}'. Candidatos: ${leftDesc} ~ ${rightDesc}`,
    context: `${c.left.name} ~ ${c.right.name}`
  });
}

export function evaluateSimilarCodeCandidates(
  candidates: readonly SimilarCodeCandidate[] | undefined,
  options: { ignoreSameFile?: boolean },
  auditor: ValidateSimilarCodeAuditor
): number {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return 0;
  }

  const ignoreSameFile = options.ignoreSameFile ?? true;
  const config = getAuditConfig(auditor.projectRoot);
  let reportedCount = 0;

  for (const c of candidates) {
    const leftPath = normalizeRelativeCandidatePath(c.left?.path, auditor.projectRoot);
    const rightPath = normalizeRelativeCandidatePath(c.right?.path, auditor.projectRoot);

    if (
      isCandidatePairIgnored({
        leftPath,
        rightPath,
        ignoreSameFile,
        auditor,
        includeTests: Boolean(config.paths?.includeTestsInCodeAudit)
      })
    ) {
      continue;
    }

    reportSingleCandidateViolation(c, leftPath, rightPath, auditor);
    reportedCount++;
  }

  return reportedCount;
}

export class ValidateSimilarCodeAuditor extends BaseAuditor<SimilarCodeRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    const projectRoot = options.projectRoot || process.cwd();

    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'Fallow',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'fallow-similar-code-failed'
      },
      ruleCapabilities: SIMILAR_CODE_RULE_CAPABILITIES,
      id: 'validate_similar_code',
      name: 'Fallow Similar Code Semantics Validator',
      description: 'Detecta duplicados semánticos de funciones',
      family: 'architecture',
      ruleIds: SIMILAR_CODE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SIMILAR_CODE_RULES, 'dedup'),
      packageName: 'Fallow',
      configKey: 'fallow.similarCode.enabled',
      defaultConfig: {
        enabled: true,
        threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
        ignoreSameFile: true
      },
      criticalConfig: {},
      icon: '🔍',
      ruleDescriptions: {
        'fallow-similar-code': 'Duplicado semántico',
        'fallow-similar-code-failed': 'Salud del motor similar-code'
      },
      ruleRemediations: {
        'fallow-similar-code':
          '📖 GUÍA DE REMEDIACIÓN: fallow-similar-code\n' +
          '1. Causa Raíz: El motor de embeddings vectoriales de Fallow detectó dos funciones con una similitud semántica superior al umbral configurado (≥ 0.95). Ambas funciones implementan el mismo propósito conceptual con sintaxis o nombres de variables divergentes.\n' +
          '2. Diagnóstico: Inspecciona las dos funciones reportadas (lado izquierdo y lado derecho) en los archivos y líneas señaladas.\n' +
          '3. Solución Canónica:\n' +
          '   a) Extrae la lógica común a una función de utilidad compartida en `src/utils/` o en el servicio de dominio correspondiente.\n' +
          '   b) Refactoriza ambas ubicaciones para llamar a la función canónica unificada.\n' +
          '   c) Si las funciones resuelven problemas de dominios estrictamente disjuntos con semántica coincidente por pura casualidad, anota `// similar-code-ok: <justificación>` sobre la cabecera de la función.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Duplicado semántico: `formatUserDate()` y `parseDisplayTimestamp()` haciendo idéntica transformación.\n' +
          '   ✅ Unificado:          `formatDate()` canónica compartida.',
        'fallow-similar-code-failed':
          '📖 GUÍA DE REMEDIACIÓN: fallow-similar-code-failed\n' +
          '1. Causa Raíz: El motor de análisis vectorial Fallow no pudo inicializarse, el binario nativo no fue encontrado, o falló la descarga/ejecución del modelo Candle en CPU.\n' +
          '2. Diagnóstico: Revisa el mensaje de error emitido en la consola para determinar si falta el binario o si se produjo un error de permisos/red.\n' +
          '3. Solución Canónica:\n' +
          '   a) En Windows, ejecuta el comando canónico `npm run setup:windows` (o `npm run setup:linux` en Linux) para pre-crear directorios de caché y verificar binarios.\n' +
          '   b) Verifica que `fallow` esté instalado correctamente en `node_modules/.bin/fallow`.\n' +
          '   c) Si estás ejecutando en un entorno de integración continua sin acceso a internet o en compilación de producción, asegura la variable de entorno `AUDITOR_ENV=production`.\n' +
          '4. Ejemplo:\n' +
          '   - Ejecutar `npm run setup:windows` o `npm run setup:linux`.'
      },
      coverage: {
        include: ['src/**/*.ts', 'src/**/*.vue', 'scripts/**/*.ts'],
        source: 'declared-only'
      },
      projectRoot
    });
  }

  private ensureFallowBinaryAndModel(): string | null {
    const fallowBin = resolveFallowBinary(this.projectRoot);
    if (!fallowBin) {
      this.addViolation({
        ruleId: 'fallow-similar-code-failed',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message:
          'Binario de Fallow no encontrado en dependencias locales para ejecutar similar-code.',
        context: 'binary-missing'
      });
      return null;
    }

    const modelReady = checkOrInitializeModel(fallowBin, this.projectRoot, this.isFixActive());
    if (!modelReady) {
      this.context.setMetric('Similar-Code', 'Instalación manual');
      this.addViolation({
        ruleId: 'fallow-similar-code-failed',
        severity: 'warning',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message:
          'No se pudo inicializar o descargar automáticamente el modelo de embeddings para fallow similar-code. Se requiere instalación manual.',
        context: 'manual-setup-required'
      });
      return null;
    }

    return fallowBin;
  }

  private executeAnalysis(fallowBin: string, similarCfg: AuditFallowSimilarCodeConfig): void {
    const threshold = similarCfg.threshold ?? DEFAULT_SIMILAR_CODE_THRESHOLD;
    const minLines = similarCfg.minLines ?? 3;
    const ignoreSameFile = similarCfg.ignoreSameFile ?? true;

    const rawOutputFile = path.resolve(
      this.projectRoot,
      'scratch/audits/architecture/similar-code-raw.json'
    );
    if (!fs.existsSync(path.dirname(rawOutputFile))) {
      fs.mkdirSync(path.dirname(rawOutputFile), { recursive: true });
    }

    ensureSimilarCodeCacheDir(this.projectRoot);
    const threads = os.availableParallelism?.() ?? os.cpus().length ?? 4;

    try {
      const cmd = `node "${fallowBin}" similar-code --format json --threshold ${threshold} --min-lines ${minLines} --threads ${threads} --output-file "${rawOutputFile}"`;
      childProcess.execSync(cmd, {
        cwd: this.projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
        timeout: DEFAULT_SUBPROCESS_TIMEOUT_MS
      });

      this.processRawOutputFile(rawOutputFile, ignoreSameFile);
    } catch (err) {
      // catch-ok: Capturar errores de timeout o ejecución y reportar como error crítico bloqueante
      const errorMsg = (err as Error).message || String(err);
      this.addViolation({
        ruleId: 'fallow-similar-code-failed',
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message: `Fallo al ejecutar fallow similar-code: ${errorMsg}`,
        context: errorMsg
      });
    }
  }

  private processRawOutputFile(rawOutputFile: string, ignoreSameFile: boolean): void {
    if (!fs.existsSync(rawOutputFile)) {
      this.addViolation({
        ruleId: 'fallow-similar-code-failed',
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message:
          'fallow similar-code finalizó pero no generó el archivo de reporte esperado en scratch.',
        context: 'missing-output-file'
      });
      return;
    }

    const fileContent = fs.readFileSync(rawOutputFile, 'utf8');
    const jsonStart = fileContent.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(fileContent.substring(jsonStart)) as SimilarCodeOutput;
        const totalCandidates = parsed.candidates?.length ?? 0;
        const reported = evaluateSimilarCodeCandidates(parsed.candidates, { ignoreSameFile }, this);

        this.context.setMetric('Candidatos Totales', totalCandidates);
        this.context.setMetric('Pares Reportados', reported);
        return;
      } catch (err) {
        this.addViolation({
          ruleId: 'fallow-similar-code-failed',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `El archivo de salida de fallow similar-code contiene JSON malformado: ${(err as Error).message}`,
          context: 'malformed-json'
        });
        return;
      }
    }

    this.addViolation({
      ruleId: 'fallow-similar-code-failed',
      severity: 'error',
      file: AUDIT_CONFIG_FILE,
      line: 1,
      message: 'fallow similar-code no generó contenido JSON en el archivo de salida.',
      context: 'empty-or-non-json'
    });
  }

  public override async runAudit(): Promise<void> {
    this.recordExternalScanCount(1);

    const config = getAuditConfig(this.projectRoot);
    const similarCfg = config.fallow?.similarCode;

    if (!similarCfg?.enabled) {
      this.markSkipped('Deshabilitado en audit.config.ts (fallow.similarCode.enabled: false)');
      return;
    }

    if (isProductionEnvironment()) {
      this.markSkipped('Omitido en entorno de producción (AUDITOR_ENV=production)');
      return;
    }

    if (isSimilarCodeSkipped()) {
      this.markSkipped(
        'Omitido por variable de entorno (AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS)'
      );
      return;
    }

    if (isFastPresetActive()) {
      this.markSkipped('Omitido en preset rápido');
      return;
    }

    let fallowBin: string | null = null;
    this.runSubAuditorSync('fallow-similar-code-failed', () => {
      fallowBin = this.ensureFallowBinaryAndModel();
    });
    if (!fallowBin) {
      this.runSubAuditorSync('fallow-similar-code', () => {
        this.markRuleNotApplicable(
          'fallow-similar-code',
          'Binario o modelo de Fallow no disponible'
        );
      });
      return;
    }

    this.runSubAuditorSync('fallow-similar-code', () => {
      this.executeAnalysis(fallowBin!, similarCfg);
    });
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSimilarCodeAuditor());
