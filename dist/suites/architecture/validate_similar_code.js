/**
 * packages/auditor/src/suites/architecture/validate_similar_code.ts
 *
 * FALLOW SIMILAR-CODE SEMANTIC DUPLICATION AUDITOR (Node.js 26+)
 *
 * Detects semantically similar functions across the repository using Fallow's
 * local vector embeddings model (jina-embeddings-v2-base-code).
 *
 * Key Architectural Guards:
 *   1. Zero Fast-Preset Impact: Completely excluded from fast presets (preset=lint, preset=md).
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
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, isTestPath } from "../../core/auditConfig.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, DEFAULT_SUBPROCESS_TIMEOUT_MS } from "../../cli/cliUtils.js";
enableCompileCache();
export const SIMILAR_CODE_RULES = [
    'fallow-similar-code',
    'fallow-similar-code-failed'
];
export const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export function resolveFallowBinary(projectRoot = process.cwd()) {
    const candidates = [
        path.resolve(projectRoot, 'node_modules/fallow/bin/fallow'),
        path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow'),
        path.resolve(import.meta.dirname, '../../../node_modules/fallow/bin/fallow')
    ];
    return candidates.find(c => fs.existsSync(c)) ?? null;
}
export function isFastPresetActive() {
    const args = process.argv.join(' ');
    return (args.includes('--preset=lint') ||
        args.includes('--preset=md'));
}
export function isSimilarCodeSkipped() {
    return (process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === 'true' ||
        process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === '1' ||
        process.env.AUDIT_SKIP_SIMILAR === 'true' ||
        process.env.AUDIT_SKIP_SIMILAR === '1');
}
import { sanitizePath } from "../../core/safePath.js";
export function resolveFallowUserCacheDir() {
    if (process.platform === 'win32') {
        const rawLocal = process.env.LOCALAPPDATA;
        const localAppData = rawLocal ? sanitizePath(rawLocal) : path.join(os.homedir(), 'AppData', 'Local');
        return path.join(localAppData, 'fallow', 'similar-code');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Caches', 'fallow', 'similar-code');
    }
    const rawXdg = process.env.XDG_CACHE_HOME;
    const xdg = rawXdg ? sanitizePath(rawXdg) : path.join(os.homedir(), '.cache');
    return path.join(xdg, 'fallow', 'similar-code');
}
export function ensureSimilarCodeCacheDir(_projectRoot) {
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
export function checkOrInitializeModel(fallowBin, projectRoot) {
    ensureSimilarCodeCacheDir(projectRoot);
    try {
        const statusOut = childProcess.execSync(`node "${fallowBin}" similar-code status --format json`, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: DEFAULT_SUBPROCESS_TIMEOUT_MS
        });
        const parsed = JSON.parse(statusOut);
        if (parsed.model_ready === true) {
            return true;
        }
    }
    catch {
        // catch-ok: Model status query failed, attempt setup below
    }
    process.stdout.write(styleText('cyan', '📦 El modelo de embeddings local para Fallow similar-code no está inicializado. Descargando e inicializando automáticamente...\n'));
    try {
        childProcess.execSync(`node "${fallowBin}" similar-code setup --local --yes`, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'inherit'],
            timeout: 0
        });
        return true;
    }
    catch (err) {
        process.stderr.write(styleText('yellow', `⚠️ No se pudo inicializar el modelo de similar-code: ${err.message}. Se omitirá el análisis vectorial.\n`));
        return false;
    }
}
function normalizeRelativeCandidatePath(rawPath, projectRoot) {
    const normalized = (rawPath || '').replace(/\\/g, '/');
    if (path.isAbsolute(normalized)) {
        return path.relative(projectRoot, normalized).replace(/\\/g, '/');
    }
    return normalized;
}
function isCandidatePairIgnored(leftPath, rightPath, ignoreSameFile, auditor, includeTests) {
    if (ignoreSameFile && leftPath === rightPath)
        return true;
    if (auditor.isPathIgnored(leftPath) || auditor.isPathIgnored(rightPath))
        return true;
    if (!includeTests && (isTestPath(leftPath) || isTestPath(rightPath)))
        return true;
    return false;
}
function reportSingleCandidateViolation(c, leftPath, rightPath, auditor) {
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
export function evaluateSimilarCodeCandidates(candidates, options, auditor) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return 0;
    }
    const ignoreSameFile = options.ignoreSameFile ?? true;
    const config = getAuditConfig(auditor.projectRoot);
    let reportedCount = 0;
    for (const c of candidates) {
        const leftPath = normalizeRelativeCandidatePath(c.left?.path, auditor.projectRoot);
        const rightPath = normalizeRelativeCandidatePath(c.right?.path, auditor.projectRoot);
        if (isCandidatePairIgnored(leftPath, rightPath, ignoreSameFile, auditor, Boolean(config.paths?.includeTestsInCodeAudit))) {
            continue;
        }
        reportSingleCandidateViolation(c, leftPath, rightPath, auditor);
        reportedCount++;
    }
    return reportedCount;
}
export class ValidateSimilarCodeAuditor extends BaseAuditor {
    constructor(targetPath) {
        const projectRoot = targetPath || process.cwd();
        super({
            capabilities: { heavy: true },
            id: 'validate_similar_code',
            name: 'Fallow Similar Code Semantics Validator',
            description: 'Detecta duplicados semánticos de funciones',
            family: 'architecture',
            ruleIds: SIMILAR_CODE_RULES,
            packageName: 'Fallow',
            configKey: 'fallow.similarCode.enabled',
            defaultConfig: { enabled: true, threshold: DEFAULT_SIMILAR_CODE_THRESHOLD, ignoreSameFile: true },
            icon: '🔍',
            ruleDescriptions: {
                'fallow-similar-code': 'Duplicado semántico',
                'fallow-similar-code-failed': 'Salud del motor similar-code'
            },
            coverage: {
                include: ['src/**/*.ts', 'src/**/*.vue', 'scripts/**/*.ts'],
                source: 'declared-only'
            },
            projectRoot
        });
    }
    ensureFallowBinaryAndModel() {
        const fallowBin = resolveFallowBinary(this.projectRoot);
        if (!fallowBin) {
            this.addViolation({
                ruleId: 'fallow-similar-code-failed',
                severity: 'error',
                file: '.fallowrc.json',
                line: 1,
                message: 'Binario de Fallow no encontrado en dependencias locales para ejecutar similar-code.',
                context: 'binary-missing'
            });
            return null;
        }
        const modelReady = checkOrInitializeModel(fallowBin, this.projectRoot);
        if (!modelReady) {
            this.context.setMetric('Similar-Code', 'Instalación manual');
            this.addViolation({
                ruleId: 'fallow-similar-code-failed',
                severity: 'warning',
                file: '.fallowrc.json',
                line: 1,
                message: 'No se pudo inicializar o descargar automáticamente el modelo de embeddings para fallow similar-code. Se requiere instalación manual.',
                context: 'manual-setup-required'
            });
            return null;
        }
        return fallowBin;
    }
    executeAnalysis(fallowBin, similarCfg) {
        const threshold = similarCfg.threshold ?? DEFAULT_SIMILAR_CODE_THRESHOLD;
        const minLines = similarCfg.minLines ?? 3;
        const ignoreSameFile = similarCfg.ignoreSameFile ?? true;
        const rawOutputFile = path.resolve(this.projectRoot, 'scratch/audits/architecture/similar-code-raw.json');
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
        }
        catch (err) {
            // catch-ok: Capturar errores de timeout o ejecución y reportar como error crítico bloqueante
            const errorMsg = err.message || String(err);
            this.addViolation({
                ruleId: 'fallow-similar-code-failed',
                severity: 'error',
                file: '.fallowrc.json',
                line: 1,
                message: `Fallo al ejecutar fallow similar-code: ${errorMsg}`,
                context: errorMsg
            });
        }
    }
    processRawOutputFile(rawOutputFile, ignoreSameFile) {
        if (!fs.existsSync(rawOutputFile)) {
            this.addViolation({
                ruleId: 'fallow-similar-code-failed',
                severity: 'error',
                file: '.fallowrc.json',
                line: 1,
                message: 'fallow similar-code finalizó pero no generó el archivo de reporte esperado en scratch.',
                context: 'missing-output-file'
            });
            return;
        }
        const fileContent = fs.readFileSync(rawOutputFile, 'utf8');
        const jsonStart = fileContent.indexOf('{');
        if (jsonStart !== -1) {
            const parsed = JSON.parse(fileContent.substring(jsonStart));
            const totalCandidates = parsed.candidates?.length ?? 0;
            const reported = evaluateSimilarCodeCandidates(parsed.candidates, { ignoreSameFile }, this);
            this.context.setMetric('Candidatos Totales', totalCandidates);
            this.context.setMetric('Pares Reportados', reported);
        }
    }
    async runAudit() {
        this.markRuleEvaluated('fallow-similar-code');
        this.markRuleEvaluated('fallow-similar-code-failed');
        this.recordExternalScanCount(1);
        const config = getAuditConfig(this.projectRoot);
        const similarCfg = config.fallow?.similarCode;
        if (!similarCfg?.enabled) {
            this.markSkipped('Deshabilitado en audit.config.ts (fallow.similarCode.enabled: false)');
            return;
        }
        if (isSimilarCodeSkipped()) {
            this.markSkipped('Omitido por variable de entorno (AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS)');
            return;
        }
        if (isFastPresetActive()) {
            this.markSkipped('Omitido en preset rápido');
            return;
        }
        const fallowBin = this.ensureFallowBinaryAndModel();
        if (!fallowBin) {
            return;
        }
        this.executeAnalysis(fallowBin, similarCfg);
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSimilarCodeAuditor());
//# sourceMappingURL=validate_similar_code.js.map