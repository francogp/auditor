/**
 * packages/auditor/src/suites/architecture/validate_fallow.ts
 *
 * OFFICIAL FALLOW STATIC INTELLIGENCE & REFACTORING TARGETS AUDITOR
 *
 * Dedicated standalone auditor for Fallow intelligence engine:
 *   1. Duplicate and triplicate code detection.
 *   2. Static security vulnerability analysis (CWE sinks).
 *   3. Dead code, unused exports, files, dependencies, and circular dependencies.
 *   4. Structural complexity and refactoring targets enforcement.
 */
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, isCliPath } from "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/safePath.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from "../../cli/cliUtils.js";
import { resolveFallowBinary } from "./validate_similar_code.js";
export const FALLOW_RULES = [
    'fallow-refactoring-targets',
    'fallow-duplicate-code',
    'fallow-triplicate-code',
    'fallow-unused-exports',
    'fallow-unused-files',
    'fallow-unused-dependencies',
    'fallow-circular-dependencies',
    'fallow-boundary-violations',
    'fallow-stale-suppressions',
    'fallow-workspace-diagnostic',
    'fallow-security-cwe'
];
export const FALLOW_RULE_DESCRIPTIONS = {
    'fallow-refactoring-targets': 'Objetivo refactor Fallow',
    'fallow-duplicate-code': 'Código duplicado detectado',
    'fallow-triplicate-code': 'Código triplicado crítico',
    'fallow-unused-exports': 'Export no utilizado en código',
    'fallow-unused-files': 'Archivo muerto sin uso',
    'fallow-unused-dependencies': 'Dependencia no utilizada',
    'fallow-circular-dependencies': 'Dependencia circular',
    'fallow-boundary-violations': 'Límite arquitectónico',
    'fallow-stale-suppressions': 'Supresión obsoleta',
    'fallow-workspace-diagnostic': 'Diagnóstico de workspace',
    'fallow-security-cwe': 'Vulnerabilidad CWE detectada'
};
export const FALLOW_CRITICAL_PRIORITY_THRESHOLD = 30;
export const FALLOW_HIGH_PRIORITY_THRESHOLD = 20;
export const FALLOW_MEDIUM_PRIORITY_THRESHOLD = 10;
export const FALLOW_MODERATE_PRIORITY_THRESHOLD = 10;
export const FALLOW_LOW_PRIORITY_THRESHOLD = 5;
export const FALLOW_ALL_PRIORITY_THRESHOLD = 1;
export const FALLOW_PRIORITY_MIN_THRESHOLDS = {
    critical: FALLOW_CRITICAL_PRIORITY_THRESHOLD,
    high: FALLOW_HIGH_PRIORITY_THRESHOLD,
    medium: FALLOW_MEDIUM_PRIORITY_THRESHOLD,
    moderate: FALLOW_MODERATE_PRIORITY_THRESHOLD,
    low: FALLOW_LOW_PRIORITY_THRESHOLD,
    all: FALLOW_ALL_PRIORITY_THRESHOLD
};
export function resolveFallowTargetMinThreshold(priority) {
    if (typeof priority === 'number') {
        return Number.isFinite(priority) ? Math.max(0, priority) : FALLOW_HIGH_PRIORITY_THRESHOLD;
    }
    if (typeof priority === 'string' && priority in FALLOW_PRIORITY_MIN_THRESHOLDS) {
        return FALLOW_PRIORITY_MIN_THRESHOLDS[priority];
    }
    return FALLOW_HIGH_PRIORITY_THRESHOLD;
}
const FALLOW_DUPES_CONFIG = ['--min-occurrences', '2'];
const FALLOW_TRIPLETS_CONFIG = ['--min-occurrences', '3', '--min-lines', '10', '--min-tokens', '60'];
function mapCloneFindings(cloneGroups, isTriplets, projectRoot) {
    const findings = [];
    const ruleId = isTriplets ? 'fallow-triplicate-code' : 'fallow-duplicate-code';
    const label = isTriplets ? 'Código triplicado crítico detectado por Fallow' : 'Código duplicado detectado por Fallow';
    const context = isTriplets ? 'fallow-triplets' : 'fallow-dupes';
    for (const group of cloneGroups || []) {
        const tokens = group.token_count ?? group.duplicated_tokens ?? 0;
        for (const inst of group.instances || []) {
            findings.push({
                file: path.resolve(projectRoot, inst.file),
                line: inst.start_line,
                message: `${label} (${tokens} tokens)`,
                context,
                ruleId,
                severity: 'error'
            });
        }
    }
    return findings;
}
function mapSecurityFindings(findings, projectRoot) {
    const res = [];
    for (const f of findings || []) {
        if (isCliPath(f.path))
            continue;
        res.push({
            file: path.resolve(projectRoot, f.path),
            line: f.line || 1,
            message: `Vulnerabilidad de seguridad Fallow: ${f.message || f.rule_id || 'CWE Sink'}`,
            context: f.rule_id || 'cwe',
            ruleId: 'fallow-security-cwe',
            severity: 'error'
        });
    }
    return res;
}
function mapUnusedFileFindings(files, projectRoot) {
    return (files || []).map(f => ({
        file: path.resolve(projectRoot, f.path),
        line: 1,
        message: `Archivo huérfano sin uso (Dead Code Fallow): '${f.path}'`,
        context: f.path,
        ruleId: 'fallow-unused-files',
        severity: 'error'
    }));
}
function mapUnusedExportFindings(exports, projectRoot) {
    return (exports || []).map(x => ({
        file: path.resolve(projectRoot, x.path),
        line: x.line || 1,
        message: `Export no utilizado (Fallow): '${x.export_name}'`,
        context: x.export_name,
        ruleId: 'fallow-unused-exports',
        severity: 'error'
    }));
}
function mapUnusedDepFindings(deps, projectRoot) {
    return (deps || []).map(d => ({
        file: path.resolve(projectRoot, d.path || 'package.json'),
        line: d.line || 1,
        message: `Dependencia no utilizada en package.json (Fallow): '${d.package_name}'`,
        context: d.package_name,
        ruleId: 'fallow-unused-dependencies',
        severity: 'error'
    }));
}
function mapCircularDepFindings(circulars, projectRoot) {
    return (circulars || []).map(c => {
        const filesList = c.files || c.cycle || [];
        const filePath = c.path || filesList[0] || 'src';
        return {
            file: path.resolve(projectRoot, filePath),
            line: c.line || 1,
            message: `Dependencia circular crítica (Fallow): ${filesList.join(' → ') || c.message || filePath}`,
            context: filePath,
            ruleId: 'fallow-circular-dependencies',
            severity: 'error'
        };
    });
}
function mapBoundaryFindings(boundaries, projectRoot) {
    return (boundaries || []).map(b => ({
        file: path.resolve(projectRoot, b.path),
        line: b.line || 1,
        message: `Violación de límite arquitectónico (Fallow): ${b.message}`,
        context: b.message,
        ruleId: 'fallow-boundary-violations',
        severity: 'error'
    }));
}
function mapStaleSuppressions(suppressions, projectRoot) {
    const findings = [];
    for (const s of suppressions || []) {
        if (s.origin?.issue_kind?.startsWith('cwe-') || s.origin?.kind_known === false)
            continue;
        findings.push({
            file: path.resolve(projectRoot, s.path || s.file || 'src'),
            line: s.line || 1,
            message: `Supresión obsoleta de Fallow: ${s.message || s.kind || ''}`,
            context: s.path || s.file || '',
            ruleId: 'fallow-stale-suppressions',
            severity: 'error'
        });
    }
    return findings;
}
function mapWorkspaceDiagFindings(diagnostics, projectRoot) {
    const findings = [];
    for (const diag of diagnostics || []) {
        if (diag.kind === 'boundaries-not-configured' || diag.kind === 'rule-packs-not-configured')
            continue;
        findings.push({
            file: path.resolve(projectRoot, diag.path || 'package.json'),
            line: 1,
            message: `Diagnóstico de workspace (Fallow): [${diag.kind || 'diagnostic'}] ${diag.message || ''}`,
            context: diag.kind || 'diagnostic',
            ruleId: 'fallow-workspace-diagnostic',
            severity: 'error'
        });
    }
    return findings;
}
function mapDeadCodeFindings(data, projectRoot) {
    const dc = data.dead_code || data;
    const allDeps = [...(dc.unused_dependencies || []), ...(dc.unused_dev_dependencies || [])];
    return [
        ...mapUnusedFileFindings(dc.unused_files, projectRoot),
        ...mapUnusedExportFindings(dc.unused_exports, projectRoot),
        ...mapUnusedDepFindings(allDeps, projectRoot),
        ...mapCircularDepFindings(dc.circular_dependencies, projectRoot),
        ...mapBoundaryFindings(data.boundary_violations, projectRoot),
        ...mapStaleSuppressions(dc.stale_suppressions, projectRoot),
        ...mapWorkspaceDiagFindings(dc.workspace_diagnostics, projectRoot)
    ];
}
function mapHealthFindings(data, projectRoot) {
    const findings = [];
    const cfg = getAuditConfig(projectRoot);
    if (cfg.fallow?.enforceTargets) {
        const minThreshold = resolveFallowTargetMinThreshold(cfg.fallow.maxTargetPriority);
        for (const t of data.targets || []) {
            const priority = t.priority ?? 0;
            if (priority < minThreshold)
                continue;
            findings.push({
                file: path.resolve(projectRoot, t.path),
                line: 1,
                message: `Objetivo de refactorización crítico (Fallow [prioridad: ${priority}]): ${t.recommendation || t.category || 'Mantenimiento crítico'}`,
                context: t.category || 'refactoring-target',
                ruleId: 'fallow-refactoring-targets',
                severity: 'error'
            });
        }
    }
    return findings;
}
export function mapFallowJson(command, data, projectRoot = process.cwd()) {
    if (command === 'dupes')
        return mapCloneFindings(data.clone_groups, false, projectRoot);
    if (command === 'triplets')
        return mapCloneFindings(data.clone_groups, true, projectRoot);
    if (command === 'security')
        return mapSecurityFindings(data.findings, projectRoot);
    if (command === 'dead-code')
        return mapDeadCodeFindings(data, projectRoot);
    if (command === 'health')
        return mapHealthFindings(data, projectRoot);
    if (command === 'audit') {
        return [
            ...mapDeadCodeFindings(data, projectRoot),
            ...mapHealthFindings(data, projectRoot)
        ];
    }
    return [];
}
function tryParseFallowJson(raw) {
    if (!raw)
        return null;
    const str = typeof raw === 'string' ? raw : raw.toString('utf8');
    const start = str.indexOf('{');
    if (start === -1)
        return null;
    try {
        return JSON.parse(str.substring(start));
    }
    catch {
        // catch-ok: fallback error handled by caller
        return null;
    }
}
export class FallowArchitectureAuditor extends BaseAuditor {
    constructor(projectRoot = process.cwd()) {
        super({
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: true,
                heavy: true,
                requiresBuild: false,
                postRun: false
            },
            id: 'validate_fallow',
            name: 'Fallow Architecture & Refactoring Targets',
            description: 'Audita código muerto, targets y CWE con Fallow',
            family: 'architecture',
            packageName: 'Fallow',
            configKey: 'fallow.enabled',
            defaultConfig: { enabled: true },
            icon: '🌾',
            ruleIds: FALLOW_RULES,
            ruleDescriptions: FALLOW_RULE_DESCRIPTIONS,
            coverage: {
                include: ['src/**/*.{ts,js,vue}'],
                source: 'declared-only'
            },
            projectRoot
        });
    }
    runFallowSubCommand(command, extraArgs = []) {
        const fallowBin = resolveFallowBinary(this.projectRoot);
        if (!fallowBin)
            return [];
        const args = ['--format', 'json', ...extraArgs];
        const cliSubCommand = command === 'triplets' ? 'dupes' : command;
        const cmd = `node "${fallowBin}" ${cliSubCommand} ${args.join(' ')}`;
        try {
            const stdout = execSync(cmd, {
                cwd: this.projectRoot,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
            });
            const parsed = tryParseFallowJson(stdout);
            if (parsed)
                return mapFallowJson(command, parsed, this.projectRoot);
        }
        catch (e) {
            const err = e;
            const parsed = tryParseFallowJson(err.stdout);
            if (parsed)
                return mapFallowJson(command, parsed, this.projectRoot);
            this.addViolation({
                ruleId: 'fallow-workspace-diagnostic',
                severity: 'error',
                file: 'fallow',
                line: 1,
                message: `Error ejecutando fallow ${command}: ${err.message || String(e)}`,
                context: `fallow ${command}`
            });
        }
        return [];
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Fallow deshabilitado en configuración'))
            return;
        // Mark all rules evaluated for audit coverage
        for (const rule of FALLOW_RULES) {
            this.markRuleEvaluated(rule);
        }
        this.recordExternalScanCount(1);
        const config = getAuditConfig(this.projectRoot);
        const fallowSecActive = config.fallow?.security?.enabled ?? config.security?.enabled ?? true;
        const isSecurityActive = fallowSecActive !== false;
        // Collect all findings in memory before emitting
        const allFindings = [];
        // 1. Duplicates
        const dupes = this.runFallowSubCommand('dupes', FALLOW_DUPES_CONFIG);
        allFindings.push(...dupes);
        // 2. Triplets
        const triplets = this.runFallowSubCommand('triplets', FALLOW_TRIPLETS_CONFIG);
        allFindings.push(...triplets);
        // 3. Security
        if (isSecurityActive) {
            const security = this.runFallowSubCommand('security');
            allFindings.push(...security);
        }
        // 4. Dead Code
        const deadCode = this.runFallowSubCommand('dead-code');
        allFindings.push(...deadCode);
        // 5. Health & Targets
        const health = this.runFallowSubCommand('health', ['--targets']);
        allFindings.push(...health);
        for (const f of allFindings) {
            const relPath = toPosixRelative(this.projectRoot, f.file);
            this.recordScanned(relPath);
            this.addViolation({
                ruleId: f.ruleId,
                ruleDescription: FALLOW_RULE_DESCRIPTIONS[f.ruleId],
                severity: f.severity,
                file: relPath,
                line: f.line,
                message: f.message,
                context: f.context
            });
        }
        // Ensure atomic sub-auditor step logging at completion
        this.ensureSubAuditorsLogged();
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new FallowArchitectureAuditor());
//# sourceMappingURL=validate_fallow.js.map