/**
 * src/suites/architecture/validate_package_types.ts
 *
 * PACKAGE TYPES RESOLUTION AUDITOR (Node.js 26+ Native)
 * Validates TypeScript declaration (.d.ts) resolution and dual ESM/CJS compatibility
 * for compiled packages in dist/ via @arethetypeswrong/core (ATTW).
 *
 * Capabilities: requiresBuild (executed exclusively post-build via preset=build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { checkPackage, Package } from '@arethetypeswrong/core';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const PACKAGE_TYPES_RULES = [
    'pkg-types-resolution',
    'pkg-types-dual-hazard',
    'pkg-types-missing-dts'
];
const MAX_SCAN_DEPTH = 10;
/**
 * Builds an in-memory Package representation for @arethetypeswrong/core from a disk directory.
 */
export function createPackageFromDirectory(pkgDir) {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
        throw new Error(`[validate_package_types]: No package.json found at ${pkgDir}`);
    }
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const name = pkgJson.name ?? 'unknown-package';
    const version = pkgJson.version ?? '0.0.0';
    const files = {};
    function readDirectoryRecursive(dir, baseDir, depth = 0) {
        if (depth > MAX_SCAN_DEPTH)
            return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = toPosixRelative(baseDir, fullPath);
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'scratch') {
                continue;
            }
            if (entry.isDirectory()) {
                readDirectoryRecursive(fullPath, baseDir, depth + 1);
            }
            else if (entry.isFile()) {
                files[`/node_modules/${name}/${relPath}`] = fs.readFileSync(fullPath);
            }
        }
    }
    readDirectoryRecursive(pkgDir, pkgDir);
    return new Package(files, name, version);
}
function classifyAttwProblem(p) {
    switch (p.kind) {
        case 'UntypedResolution':
            return {
                ruleId: 'pkg-types-missing-dts',
                severity: 'error',
                message: `Entrypoint '${p.entrypoint}' sin tipos en resolución ${p.resolutionKind}`,
                context: `${p.entrypoint} (${p.resolutionKind})`
            };
        case 'NoResolution':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'error',
                message: `Entrypoint '${p.entrypoint}' no resuelve tipos en resolución ${p.resolutionKind}`,
                context: `${p.entrypoint} (${p.resolutionKind})`
            };
        case 'FalseESM':
            return {
                ruleId: 'pkg-types-dual-hazard',
                severity: 'error',
                message: `Incompatibilidad ESM en tipos vs impl: ${p.typesFileName} vs ${p.implementationFileName}`,
                context: p.typesFileName
            };
        case 'FalseCJS':
            return {
                ruleId: 'pkg-types-dual-hazard',
                severity: 'error',
                message: `Incompatibilidad CJS en tipos vs impl: ${p.typesFileName} vs ${p.implementationFileName}`,
                context: p.typesFileName
            };
        case 'CJSResolvesToESM':
            return {
                ruleId: 'pkg-types-dual-hazard',
                severity: 'warning',
                message: `Entrypoint '${p.entrypoint}' resuelve a ESM cuando se requiere desde CJS`,
                context: `${p.entrypoint} (${p.resolutionKind})`
            };
        case 'NamedExports':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'error',
                message: `Faltan exportaciones nombradas en la implementación: ${p.missing.join(', ')}`,
                context: p.typesFileName
            };
        case 'InternalResolutionError':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'error',
                message: `Error interno de resolución en ${p.fileName}: ${p.moduleSpecifier}`,
                context: p.fileName
            };
        case 'UnexpectedModuleSyntax':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'error',
                message: `Sintaxis de módulo inesperada en ${p.fileName}`,
                context: p.fileName
            };
        case 'FallbackCondition':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'warning',
                message: `Condición fallback de export detectada para entrypoint '${p.entrypoint}'`,
                context: p.entrypoint
            };
        case 'FalseExportDefault':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'error',
                message: 'Discrepancia en export default entre tipos e implementación',
                context: p.typesFileName
            };
        case 'MissingExportEquals':
            return {
                ruleId: 'pkg-types-resolution',
                severity: 'error',
                message: `Falta export = para compatibilidad CJS en ${p.typesFileName}`,
                context: p.typesFileName
            };
        case 'CJSOnlyExportsDefault':
            return {
                ruleId: 'pkg-types-dual-hazard',
                severity: 'warning',
                message: `Módulo CJS solo exporta default en ${p.fileName}`,
                context: p.fileName
            };
    }
}
/**
 * Parses @arethetypeswrong/core problems into canonical AuditFindings.
 */
export function parseAttwProblems(problems, pkgJson) {
    const findings = [];
    const isPureEsm = pkgJson.type === 'module';
    for (const p of problems) {
        if ('resolutionKind' in p && p.resolutionKind === 'node10') {
            continue;
        }
        if (p.kind === 'CJSResolvesToESM' && isPureEsm) {
            continue;
        }
        const { ruleId, severity, message, context } = classifyAttwProblem(p);
        findings.push({
            suiteId: 'validate_package_types',
            suiteName: 'Package Types Resolution Validator',
            ruleId,
            ruleDescription: 'Distribución: Resolución de tipos inválida',
            severity,
            file: 'package.json',
            line: 1,
            context,
            message
        });
    }
    return findings;
}
export class ValidatePackageTypesAuditor extends BaseAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: false,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: true,
                postRun: false
            },
            id: 'validate_package_types',
            name: 'Package Types Resolution Validator',
            description: 'Valida resolución de tipos .d.ts en dist con ATTW',
            family: 'architecture',
            packageName: 'Distribución',
            icon: '🏷️',
            ruleIds: PACKAGE_TYPES_RULES,
            ruleDescriptions: {
                'pkg-types-resolution': 'Resolución de tipos inválida',
                'pkg-types-dual-hazard': 'Incompatibilidad dual ESM y CJS',
                'pkg-types-missing-dts': 'Entrypoint sin tipos declarados'
            },
            coverage: {
                include: ['package.json', 'dist/**']
            },
            projectRoot: effectiveRoot,
            configKey: 'packageDistribution.enabled',
            defaultConfig: { enabled: true },
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Package distribution auditing is disabled')) {
            return;
        }
        PACKAGE_TYPES_RULES.forEach((r) => this.markRuleEvaluated(r));
        this.recordScanned('package.json');
        const pkgJsonPath = path.resolve(this.projectRoot, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) {
            return;
        }
        let pkgJson;
        try {
            pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')); // open-record: Generic key-value data dictionary container
        }
        catch {
            // catch-ok: Handled by syntax validator
            return;
        }
        const config = getAuditConfig(this.projectRoot);
        const configuredLevel = config.packageDistribution?.level ?? 'warning';
        const pkg = createPackageFromDirectory(this.projectRoot);
        const checkResult = await checkPackage(pkg);
        const problems = checkResult.types ? checkResult.problems : [];
        const findings = parseAttwProblems(problems, pkgJson);
        for (const f of findings) {
            const finalSeverity = configuredLevel === 'warning' ? 'warning' : f.severity;
            this.addViolation({
                ruleId: f.ruleId,
                severity: finalSeverity,
                file: f.file,
                line: f.line,
                context: f.context,
                message: f.message
            });
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageTypesAuditor());
//# sourceMappingURL=validate_package_types.js.map