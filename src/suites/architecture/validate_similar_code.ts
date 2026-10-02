/**
 * packages/auditor/src/suites/architecture/validate_similar_code.ts
 *
 * FALLOW SIMILAR-CODE SEMANTIC DUPLICATION AUDITOR (Node.js 26+)
 *
 * Detects semantically similar functions across the repository using Fallow's
 * local vector embeddings model (jina-embeddings-v2-base-code).
 *
 * Key Architectural Guards:
 *   1. Zero Fast-Preset Impact: Completely excluded from fast presets (preset=lint, preset=md, audit_for_commit).
 *   2. Strict High Threshold: Defaults to 0.95 threshold to eliminate cognitive noise and false positives.
 *   3. Intra-File Filtering: Skips pairs within the same file (e.g. sync/async pairs like safeWriteFileSync/safeWriteFile).
 *   4. Auto-Initialization: If the companion model is not ready, automatically downloads and sets up the local model with clear console notification.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type SimilarCodeRuleId = 'fallow-similar-code';

export const SIMILAR_CODE_RULES: readonly SimilarCodeRuleId[] = [
  'fallow-similar-code'
] as const;

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
  const candidates = [
    path.resolve(projectRoot, 'node_modules/fallow/bin/fallow'),
    path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow'),
    path.resolve(import.meta.dirname, '../../../node_modules/fallow/bin/fallow')
  ];
  return candidates.find(c => fs.existsSync(c)) ?? null;
}

export function isFastPresetActive(): boolean {
  const args = process.argv.join(' ');
  return (
    args.includes('--preset=lint') ||
    args.includes('--preset=md') ||
    args.includes('--preset=quick') ||
    args.includes('audit_for_commit')
  );
}

export function checkOrInitializeModel(fallowBin: string, projectRoot: string): boolean {
  try {
    const statusOut = execSync(`node "${fallowBin}" similar-code status --format json`, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10000
    });
    const parsed = JSON.parse(statusOut) as SimilarCodeStatusOutput;
    if (parsed.model_ready === true) {
      return true;
    }
  } catch {
    // catch-ok: Model status query failed, attempt setup below
  }

  process.stdout.write(
    styleText('cyan', '📦 El modelo de embeddings local para Fallow similar-code no está inicializado. Descargando e inicializando automáticamente...\n')
  );

  try {
    execSync(`node "${fallowBin}" similar-code setup --local --yes`, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
      timeout: 180000
    });
    return true;
  } catch (err) {
    process.stderr.write(
      styleText('yellow', `⚠️ No se pudo inicializar el modelo de similar-code: ${(err as Error).message}. Se omitirá el análisis vectorial.\n`)
    );
    return false;
  }
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
  let reportedCount = 0;

  for (const c of candidates) {
    const leftPath = (c.left?.path || '').replace(/\\/g, '/');
    const rightPath = (c.right?.path || '').replace(/\\/g, '/');

    if (ignoreSameFile && leftPath === rightPath) {
      continue;
    }

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
    reportedCount++;
  }

  return reportedCount;
}

export class ValidateSimilarCodeAuditor extends BaseAuditor<SimilarCodeRuleId> {
  constructor(targetPath?: string) {
    const projectRoot = targetPath || process.cwd();

    super({
      id: 'validate_similar_code',
      name: 'Fallow Similar Code Semantics Validator',
      description: 'Detecta duplicados semánticos de funciones',
      family: 'architecture',
      ruleIds: SIMILAR_CODE_RULES,
      packageName: 'Fallow',
      ruleDescriptions: {
        'fallow-similar-code': 'Duplicado semántico'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const similarCfg = config.fallow?.similarCode;

    if (!similarCfg?.enabled) {
      this.context.logStep(1, 1, 'Similar-code desactivado en audit.config.ts (fallow.similarCode.enabled: false). Omitiendo.');
      return;
    }

    if (isFastPresetActive()) {
      this.context.logStep(1, 1, 'Preset rápido activo (lint/md/commit). Omitiendo similar-code vectorial.');
      return;
    }

    const fallowBin = resolveFallowBinary(this.projectRoot);
    if (!fallowBin) {
      this.context.logStep(1, 1, 'Binario de Fallow no encontrado. Omitiendo similar-code.');
      return;
    }

    this.context.logStep(1, 2, 'Verificando estado del modelo de embeddings local...');
    const modelReady = checkOrInitializeModel(fallowBin, this.projectRoot);
    if (!modelReady) {
      this.context.logStep(2, 2, 'Modelo no disponible. Omitiendo análisis.');
      return;
    }

    const threshold = similarCfg.threshold ?? 0.95;
    const minLines = similarCfg.minLines ?? 3;
    const ignoreSameFile = similarCfg.ignoreSameFile ?? true;

    this.context.logStep(2, 2, `Ejecutando fallow similar-code (umbral: ${threshold}, min-lines: ${minLines})...`);

    try {
      const cmd = `node "${fallowBin}" similar-code --format json --threshold ${threshold} --min-lines ${minLines}`;
      const stdout = execSync(cmd, {
        cwd: this.projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000
      });

      const jsonStart = stdout.indexOf('{');
      if (jsonStart !== -1) {
        const parsed = JSON.parse(stdout.substring(jsonStart)) as SimilarCodeOutput;
        const totalCandidates = parsed.candidates?.length ?? 0;
        const reported = evaluateSimilarCodeCandidates(parsed.candidates, { ignoreSameFile }, this);

        this.context.setMetric('Candidatos Totales', totalCandidates);
        this.context.setMetric('Pares Reportados', reported);
      }
    } catch (err) {
      // catch-ok: Capturar errores de timeout o ejecución sin crash fatal
      process.stderr.write(styleText('yellow', `⚠️ Advertencia al ejecutar similar-code: ${(err as Error).message}\n`));
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSimilarCodeAuditor());
