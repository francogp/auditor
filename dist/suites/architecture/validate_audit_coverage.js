/**
 * src/suites/architecture/validate_audit_coverage.ts
 *
 * AUDIT COVERAGE & BLIND-SPOT AUDITOR (Node.js 26+ Native)
 * Post-run suite that consumes every coverage ledger written during a full orchestrated run and
 * reports blind spots that would otherwise produce false-clean results:
 *   - tracked files that no suite analyzed (uncovered),
 *   - files whose rules are silenced by configured exemption policies (degraded),
 *   - drift between a suite's static declaration and what it actually scanned,
 *   - rules evaluated zero times without an explicit non-applicability justification (dormant),
 *   - exemptions that match nothing (dead), and executed suites that left no ledger.
 */
import { execFileSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, isPathIgnored, createRuleCapabilities } from "../../core/auditorBase.js";
import { getAuditConfig, AUDIT_CONFIG_FILE } from "../../core/auditConfig.js";
import { COVERAGE_EXPECTED_SUITES_ENV, COVERAGE_RUN_MODE_ENV, isAuditableCodebaseFile, isDeclaredByCoverage, readCoverageLedgers, resolveActiveCoverageRunId } from "../../core/auditCoverage.js";
import { getMatchingExemptionPolicies } from "../../core/exemptionPolicies.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from "../../cli/cliUtils.js";
enableCompileCache();
export const AUDIT_COVERAGE_SUITE_ID = 'validate_audit_coverage';
export const AUDIT_COVERAGE_RULES = [
    'coverage-uncovered-file',
    'coverage-degraded-file',
    'coverage-declared-not-scanned',
    'coverage-scanned-undeclared',
    'coverage-dormant-rule',
    'coverage-invalid-exemption',
    'coverage-missing-ledger'
];
/** Groups files by parent directory so one finding lists every affected file of a directory. */
function groupByDirectory(files) {
    const groups = new Map();
    for (const file of [...files].sort()) {
        const dir = path.posix.dirname(file);
        groups.getOrInsert(dir, []).push(path.posix.basename(file));
    }
    return groups;
}
function directoryFindings(ruleId, files, describe, context) {
    return Array.from(groupByDirectory(files), ([dir, names]) => ({
        ruleId,
        file: dir === '.' ? '' : dir,
        message: `${describe(names.length, dir)}: ${names.join(', ')}`,
        context
    }));
}
export function isCoveredBy(file, ledger, scannedSets) {
    if (ledger.skipped)
        return false;
    if (ledger.source === 'declared-only')
        return isDeclaredByCoverage(file, ledger.declared);
    return scannedSets.get(ledger.suiteId)?.has(file) ?? false;
}
function recordDegradedPolicyViolations(file, config, acknowledged, degradedByPolicy) {
    for (const policy of getMatchingExemptionPolicies(file, config)) {
        if (policy.kind !== 'configured')
            continue;
        const isAcknowledged = acknowledged.some(a => a.policy === policy.id && path.posix.matchesGlob(file, a.glob));
        if (!isAcknowledged) {
            const existing = degradedByPolicy.get(policy.id);
            if (existing) {
                existing.push(file);
            }
            else {
                degradedByPolicy.set(policy.id, [file]);
            }
        }
    }
}
function buildDegradedPolicyFindings(degradedByPolicy, config) {
    const findings = [];
    for (const [policyId, files] of degradedByPolicy) {
        const policy = getMatchingExemptionPolicies(files[0], config).find(p => p.id === policyId);
        findings.push(...directoryFindings('coverage-degraded-file', files, count => `${count} archivo(s) con reglas silenciadas por '${policy.configKey}' (${policy.silences})`, `Corrige '${policy.configKey}' o declara coverage.acknowledgedDegradations (policy: '${policyId}')`));
    }
    return findings;
}
function getAuditableCandidates(input) {
    if (input.auditableFiles)
        return input.auditableFiles;
    const customExemptGlobs = (input.config.coverage?.exemptGlobs ?? []).map(e => e.glob);
    return input.trackedFiles.filter(f => !input.isGloballyIgnored(f) && isAuditableCodebaseFile(f, customExemptGlobs));
}
function analyzeUncoveredFiles(input, ledgers, scannedSets) {
    const candidates = getAuditableCandidates(input);
    const uncovered = []; // domain-ok: Non-domain relative file path strings collection
    for (const file of candidates) {
        if (!ledgers.some(l => isCoveredBy(file, l, scannedSets))) {
            uncovered.push(file);
        }
    }
    return directoryFindings('coverage-uncovered-file', uncovered, count => `${count} archivo(s) versionado(s) que ninguna suite analiza (falso limpio)`, 'Agrega una suite que los cubra o declara coverage.exemptGlobs con reason');
}
function analyzeDegradedFiles(input, ledgers, scannedSets) {
    const candidates = getAuditableCandidates(input);
    const acknowledged = input.config.coverage?.acknowledgedDegradations ?? [];
    const degradedByPolicy = new Map();
    for (const file of candidates) {
        if (ledgers.some(l => isCoveredBy(file, l, scannedSets))) {
            recordDegradedPolicyViolations(file, input.config, acknowledged, degradedByPolicy);
        }
    }
    return buildDegradedPolicyFindings(degradedByPolicy, input.config);
}
function analyzeDeclaredNotScanned(input, ledgers, scannedSets) {
    const findings = [];
    const candidates = getAuditableCandidates(input);
    for (const ledger of ledgers) {
        if (ledger.skipped || ledger.source !== 'runtime')
            continue;
        const scanned = scannedSets.get(ledger.suiteId);
        const notScanned = candidates.filter(f => !scanned.has(f) &&
            isDeclaredByCoverage(f, ledger.declared));
        findings.push(...directoryFindings('coverage-declared-not-scanned', notScanned, count => `[${ledger.suiteId}] declara ${count} archivo(s) que no escaneó`, `${ledger.suiteId}: alinea coverage.include/exclude con lo que realmente analiza`));
    }
    return findings;
}
function analyzeScannedNotDeclared(input, ledgers, scannedSets) {
    const findings = [];
    const tracked = new Set(input.trackedFiles);
    for (const ledger of ledgers) {
        if (ledger.skipped || ledger.source !== 'runtime')
            continue;
        const scanned = scannedSets.get(ledger.suiteId);
        const undeclared = [...scanned].filter(f => tracked.has(f) && !isDeclaredByCoverage(f, ledger.declared));
        findings.push(...directoryFindings('coverage-scanned-undeclared', undeclared, count => `[${ledger.suiteId}] escaneó ${count} archivo(s) fuera de su declaración`, `${ledger.suiteId}: amplía coverage.include o deja de escanearlos`));
    }
    return findings;
}
function analyzeDormantRules(ledgers) {
    const findings = [];
    for (const ledger of ledgers) {
        if (ledger.skipped)
            continue;
        for (const ruleId of ledger.ruleIds) {
            if ((ledger.ruleEvaluations[ruleId] ?? 0) > 0 || ledger.notApplicable[ruleId])
                continue;
            findings.push({
                ruleId: 'coverage-dormant-rule',
                file: '',
                message: `[${ledger.suiteId}] la regla '${ruleId}' se evaluó 0 veces: su resultado limpio no es confiable (condición de activación rota o sin instrumentar)`,
                context: `${ledger.suiteId}/${ruleId}`
            });
        }
    }
    return findings;
}
function analyzeInvalidExemptions(input) {
    const findings = [];
    const configFile = AUDIT_CONFIG_FILE;
    for (const exemption of input.config.coverage?.exemptGlobs ?? []) {
        if (!input.trackedFiles.some(f => path.posix.matchesGlob(f, exemption.glob))) {
            findings.push({
                ruleId: 'coverage-invalid-exemption',
                file: configFile,
                message: `coverage.exemptGlobs '${exemption.glob}' no coincide con ningún archivo versionado (exención muerta)`,
                context: exemption.glob
            });
        }
    }
    for (const ack of input.config.coverage?.acknowledgedDegradations ?? []) {
        const used = input.trackedFiles.some(f => path.posix.matchesGlob(f, ack.glob) && getMatchingExemptionPolicies(f, input.config).some(p => p.id === ack.policy));
        if (!used) {
            findings.push({
                ruleId: 'coverage-invalid-exemption',
                file: configFile,
                message: `coverage.acknowledgedDegradations '${ack.glob}' (policy '${ack.policy}') no reconoce ningún archivo degradado (exención muerta)`,
                context: `${ack.policy}:${ack.glob}`
            });
        }
    }
    return findings;
}
function analyzeMissingLedgers(input, ledgers) {
    const findings = [];
    const ledgerIds = new Set(ledgers.map(l => l.suiteId));
    for (const suiteId of input.expectedSuites) {
        if (!ledgerIds.has(suiteId)) {
            findings.push({
                ruleId: 'coverage-missing-ledger',
                file: '',
                message: `La suite '${suiteId}' se planificó pero su subproceso terminó sin emitir su ledger en scratch/audits/coverage/${suiteId}.json ` +
                    `(abortó con error, excepción no capturada o fallo de ciclo ESM). Ejecuta 'npm run auditor suite=${suiteId}' para ver la traza directa.`,
                context: suiteId
            });
        }
    }
    return findings;
}
/**
 * Pure blind-spot analysis over the ledgers of one run.
 */
export function analyzeAuditCoverage(input) {
    const ledgers = input.ledgers.filter(l => l.suiteId !== AUDIT_COVERAGE_SUITE_ID);
    const scannedSets = new Map(ledgers.map(l => [l.suiteId, new Set(l.scanned)]));
    return [
        ...analyzeUncoveredFiles(input, ledgers, scannedSets),
        ...analyzeDegradedFiles(input, ledgers, scannedSets),
        ...analyzeDeclaredNotScanned(input, ledgers, scannedSets),
        ...analyzeScannedNotDeclared(input, ledgers, scannedSets),
        ...analyzeDormantRules(ledgers),
        ...analyzeInvalidExemptions(input),
        ...analyzeMissingLedgers(input, ledgers)
    ];
}
/** Tracked files (git index) that still exist on disk, as POSIX relative paths. */
export function listTrackedFiles(projectRoot) {
    const output = execFileSync('git', ['ls-files', '-z'], {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
    });
    return output
        .split('\0')
        .filter(f => f.length > 0 && nodeFs.existsSync(path.join(projectRoot, f)));
}
export class AuditCoverageAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            usesThirdPartyTool: false,
            ruleCapabilities: createRuleCapabilities(AUDIT_COVERAGE_RULES, {
                speed: 'light',
                phase: 'post-run',
                fix: 'none',
                md: false,
                ast: false,
                changedSince: false
            }),
            id: AUDIT_COVERAGE_SUITE_ID,
            name: 'Audit Coverage & Blind Spots',
            description: 'Detecta puntos ciegos: archivos, reglas y exenciones',
            family: 'architecture',
            packageName: 'Cobertura',
            configKey: 'coverage.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            icon: '🗺️',
            ruleIds: AUDIT_COVERAGE_RULES,
            ruleDescriptions: {
                'coverage-uncovered-file': 'Archivo versionado sin ninguna suite',
                'coverage-degraded-file': 'Reglas silenciadas por configuración',
                'coverage-declared-not-scanned': 'Declarado pero no escaneado',
                'coverage-scanned-undeclared': 'Escaneado fuera de lo declarado',
                'coverage-dormant-rule': 'Regla dormida: 0 evaluaciones',
                'coverage-invalid-exemption': 'Exención sin archivos que la usen',
                'coverage-missing-ledger': 'Suite sin ledger de cobertura'
            },
            ruleRemediations: {
                'coverage-uncovered-file': 'El archivo versionado no es cubierto por ninguna suite de auditoría activa. ' +
                    'Posibles causas y soluciones:\n' +
                    '1. Si es un archivo de código fuente (.ts, .js, .vue, .scss), asócialo al include de la suite correspondiente o amplía sus raíces de escaneo.\n' +
                    '2. Si es un artefacto generado, temporal o de fixture, agrégalo a .gitignore o a coverage.exemptGlobs en .auditor/audit.config.ts indicando el motivo.',
                'coverage-degraded-file': 'El archivo contiene reglas de auditoría o linters silenciadas mediante configuración local o excepciones no declaradas. ' +
                    'Posibles causas y soluciones:\n' +
                    '1. Elimina la excepción y corrige el código fuente subyacente para cumplir los estándares de higiene.\n' +
                    '2. Si la degradación es legítima y está autorizada, documéntala en coverage.acknowledgedDegradations en .auditor/audit.config.ts.',
                'coverage-declared-not-scanned': 'La suite declaró en su coverage.include que analizaría este archivo, pero durante la corrida nunca lo escaneó. ' +
                    'Posibles causas y soluciones:\n' +
                    '1. Ajusta la declaración coverage.include o exclude de la suite para reflejar únicamente los archivos que realmente procesa.\n' +
                    '2. Si la suite omitió el archivo por un filtro prematuro o un return temprano, revisa la lógica de escaneo para que procese todos los archivos que declaró.',
                'coverage-scanned-undeclared': 'La suite escaneó un archivo que no formaba parte de su coverage.include declarado. ' +
                    'Posibles causas y soluciones:\n' +
                    '1. Agrega el patrón del archivo al coverage.include de la suite para hacer explícita su responsabilidad.\n' +
                    '2. O bien, excluye el archivo del escaneo interno si pertenece a otra familia o subsistema.',
                'coverage-dormant-rule': 'La regla fue declarada por la suite pero se evaluó 0 veces durante toda la auditoría. ' +
                    'Un resultado limpio con 0 evaluaciones es un falso positivo peligroso porque la verificación nunca se ejecutó. ' +
                    'Posibles causas y soluciones:\n' +
                    '1. Instrumenta la regla llamando a this.runSubAuditorSync(ruleId, () => ...) o this.markRuleEvaluated(ruleId) dentro del flujo de auditoría.\n' +
                    '2. Si la regla no aplica en este proyecto (por ejemplo, falta una tecnología o carpeta), márcala explícitamente como no aplicable usando this.markRuleNotApplicable(ruleId, "Motivo").',
                'coverage-invalid-exemption': 'Se declaró una exención en coverage.exemptGlobs o coverage.acknowledgedDegradations en .auditor/audit.config.ts que ya no coincide con ningún archivo del repositorio. ' +
                    'Posibles causas y soluciones:\n' +
                    '1. El archivo exento fue renombrado, movido o eliminado. Remueve la exención muerta de .auditor/audit.config.ts para mantener limpia la configuración.',
                'coverage-missing-ledger': 'La suite fue planificada y ejecutada por el orquestador, pero su proceso terminó sin emitir el archivo de ledger en scratch/audits/coverage/<suiteId>.json. ' +
                    'Esto ocurre cuando el subproceso del sub-auditor crashea, aborta con código de salida no-cero o sufre un bloqueo asíncrono (como un ciclo de top-level await en ESM). ' +
                    'Pasos para diagnosticar y solucionar:\n' +
                    '1. Ejecuta la suite de forma aislada en tu terminal: npm run auditor suite=<nombre_suite>\n' +
                    '2. Observa la salida y traza de error completa del proceso en la consola.\n' +
                    '3. Verifica que la clase del sub-auditor herede correctamente de BaseAuditor o FileScanAuditor y finalice con await BaseAuditor.runCliIfMain(import.meta.url, new TuAuditor()).'
            },
            coverage: { include: [AUDIT_CONFIG_FILE] },
            projectRoot: options.projectRoot
        });
    }
    async runAudit() {
        const config = getAuditConfig(this.projectRoot);
        const runId = resolveActiveCoverageRunId();
        if (config.coverage?.enabled === false) {
            this.markSkipped("Cobertura desactivada explícitamente (coverage.enabled: false)");
            return;
        }
        if (!runId || process.env[COVERAGE_RUN_MODE_ENV] !== 'full') {
            this.markSkipped('Requiere una corrida completa (npm run auditor) para verificar cobertura');
            return;
        }
        const configPath = path.join(this.projectRoot, AUDIT_CONFIG_FILE);
        if (nodeFs.existsSync(configPath))
            this.recordScanned(configPath);
        const expectedSuites = (process.env[COVERAGE_EXPECTED_SUITES_ENV] ?? '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0 && s !== AUDIT_COVERAGE_SUITE_ID);
        const trackedFiles = listTrackedFiles(this.projectRoot);
        const rawLedgers = await readCoverageLedgers(this.projectRoot, runId);
        const ledgers = rawLedgers.filter(l => l.suiteId !== AUDIT_COVERAGE_SUITE_ID);
        const scannedSets = new Map(ledgers.map(l => [l.suiteId, new Set(l.scanned)]));
        const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map(e => e.glob);
        const auditableFiles = trackedFiles.filter(f => !isPathIgnored(f) && isAuditableCodebaseFile(f, customExemptGlobs));
        const input = {
            trackedFiles,
            auditableFiles,
            ledgers: rawLedgers,
            expectedSuites,
            config,
            isGloballyIgnored: rel => isPathIgnored(rel)
        };
        const findings = [];
        this.runSubAuditorSync('coverage-uncovered-file', () => {
            findings.push(...analyzeUncoveredFiles(input, ledgers, scannedSets));
        });
        this.runSubAuditorSync('coverage-degraded-file', () => {
            findings.push(...analyzeDegradedFiles(input, ledgers, scannedSets));
        });
        this.runSubAuditorSync('coverage-declared-not-scanned', () => {
            findings.push(...analyzeDeclaredNotScanned(input, ledgers, scannedSets));
        });
        this.runSubAuditorSync('coverage-scanned-undeclared', () => {
            findings.push(...analyzeScannedNotDeclared(input, ledgers, scannedSets));
        });
        this.runSubAuditorSync('coverage-dormant-rule', () => {
            findings.push(...analyzeDormantRules(ledgers));
        });
        this.runSubAuditorSync('coverage-invalid-exemption', () => {
            findings.push(...analyzeInvalidExemptions(input));
        });
        this.runSubAuditorSync('coverage-missing-ledger', () => {
            findings.push(...analyzeMissingLedgers(input, ledgers));
        });
        for (const finding of findings) {
            this.addViolation({ ...finding, severity: 'error', line: 1 });
        }
        this.context.setMetric('Ledgers', expectedSuites.length);
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new AuditCoverageAuditor());
//# sourceMappingURL=validate_audit_coverage.js.map