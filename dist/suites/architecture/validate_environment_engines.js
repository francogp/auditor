/**
 * src/suites/architecture/validate_environment_engines.ts
 *
 * SSoT ENVIRONMENT ENGINES & RUNTIME AUDITOR (Node.js 26+ Native)
 *
 * Verifies that package.json declares engines.node and engines.npm satisfying or
 * exceeding the @francogp/auditor engine floor, and that the active runtime matches.
 * In --fix mode, automatically repairs package.json engines or invokes the canonical
 * setup script (setup-windows.ps1 / setup-linux.sh) to align the environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { spawnSync } from 'node:child_process';
import { BaseAuditor } from "../../core/auditorBase.js";
import { parseSemver, compareVersions, getAuditorEngines } from "../../cli/check_environment.js";
import { runSetup } from "../../cli/setup_env.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
enableCompileCache();
export const ENVIRONMENT_ENGINES_RULES = [
    'environment-engines-missing',
    'environment-engines-below-floor',
    'environment-runtime-mismatch'
];
export function detectNpmVersion() {
    const npmUserAgent = process.env.npm_config_user_agent || '';
    const match = npmUserAgent.match(/npm\/([0-9.]+)/);
    if (match?.[1]) {
        return match[1];
    }
    try {
        const res = spawnSync('npm', ['--version'], { encoding: 'utf8', shell: true });
        if (res.status === 0 && res.stdout) {
            return res.stdout.trim();
        }
    }
    catch {
        // catch-ok: fallback when npm CLI is inaccessible directly
    }
    return '0.0.0';
}
export class ValidateEnvironmentEnginesAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            capabilities: { lint: true, fix: true, fixPriority: true },
            id: 'validate_environment_engines',
            name: 'Environment Engines & Runtime Validator',
            description: 'Valida versiones de Node.js y npm en package.json',
            family: 'architecture',
            ruleIds: ENVIRONMENT_ENGINES_RULES,
            packageName: 'Entorno',
            configKey: 'environment.enabled',
            defaultConfig: { enabled: true },
            icon: '⚡',
            ruleDescriptions: {
                'environment-engines-missing': 'Falta engines en package.json',
                'environment-engines-below-floor': 'Motores inferiores al piso auditor',
                'environment-runtime-mismatch': 'Versión activa no coincide con engines'
            },
            coverage: { include: ['package.json'] },
            ...options
        });
    }
    validatePackageJson(pkgPath) {
        if (!fs.existsSync(pkgPath)) {
            this.addViolation({
                ruleId: 'environment-engines-missing',
                file: 'package.json',
                message: `package.json no encontrado en ${this.projectRoot}.`,
                severity: 'error'
            });
            return null;
        }
        const pkg = getPackageJson(this.projectRoot, true);
        if (!pkg) {
            this.addViolation({
                ruleId: 'environment-engines-missing',
                file: 'package.json',
                message: 'package.json no contiene un JSON válido.',
                severity: 'error'
            });
            return null;
        }
        return pkg;
    }
    auditMissingEngines(hasNodeEngine, hasNpmEngine, activeEngines, auditorEngines) {
        if (!hasNodeEngine || !hasNpmEngine) {
            if (this.isFixActive()) {
                activeEngines.node = hasNodeEngine ? activeEngines.node : auditorEngines.node;
                activeEngines.npm = hasNpmEngine ? activeEngines.npm : auditorEngines.npm;
                return true;
            }
            this.addViolation({
                ruleId: 'environment-engines-missing',
                file: 'package.json',
                message: 'package.json debe declarar explícitamente "engines.node" y "engines.npm".',
                severity: 'error'
            });
        }
        return false;
    }
    auditEnginesBelowFloor(currentNodeEngine, currentNpmEngine, activeEngines, auditorEngines, minNodeReq, minNpmReq) {
        let nodeEngineReq = { major: 0, minor: 0, patch: 0 };
        let npmEngineReq = { major: 0, minor: 0, patch: 0 };
        let modified = false;
        if (currentNodeEngine && currentNpmEngine) {
            nodeEngineReq = parseSemver(currentNodeEngine);
            npmEngineReq = parseSemver(currentNpmEngine);
            const isNodeAdequate = compareVersions(nodeEngineReq, minNodeReq);
            const isNpmAdequate = compareVersions(npmEngineReq, minNpmReq);
            if (!isNodeAdequate || !isNpmAdequate) {
                if (this.isFixActive()) {
                    activeEngines.node = isNodeAdequate ? currentNodeEngine : auditorEngines.node;
                    activeEngines.npm = isNpmAdequate ? currentNpmEngine : auditorEngines.npm;
                    modified = true;
                    nodeEngineReq = parseSemver(activeEngines.node);
                    npmEngineReq = parseSemver(activeEngines.npm);
                }
                else {
                    this.addViolation({
                        ruleId: 'environment-engines-below-floor',
                        file: 'package.json',
                        message: `Versiones de motores en package.json inferiores al piso del auditor ` +
                            `(Node: ${auditorEngines.node}, npm: ${auditorEngines.npm}).`,
                        severity: 'error'
                    });
                }
            }
        }
        return { modified, nodeReq: nodeEngineReq, npmReq: npmEngineReq };
    }
    auditRuntimeMismatch(pkg, auditorEngines, nodeEngineReq, npmEngineReq, minNodeReq, minNpmReq) {
        const runtimeNode = parseSemver(process.versions.node);
        const rawNpmVer = detectNpmVersion();
        const runtimeNpm = parseSemver(rawNpmVer);
        const targetNodeReq = nodeEngineReq.major > 0 ? nodeEngineReq : minNodeReq;
        const targetNpmReq = npmEngineReq.major > 0 ? npmEngineReq : minNpmReq;
        const isNodeMatch = compareVersions(runtimeNode, targetNodeReq);
        const isNpmMatch = runtimeNpm.major === 0 || compareVersions(runtimeNpm, targetNpmReq);
        if (!isNodeMatch || !isNpmMatch) {
            if (this.isFixActive()) {
                const isWindows = process.platform === 'win32';
                const setupScript = isWindows ? 'setup-windows.ps1' : 'setup-linux.sh';
                const setupPath = path.resolve(this.projectRoot, setupScript);
                if (fs.existsSync(setupPath)) {
                    runSetup([], this.projectRoot);
                }
            }
            this.addViolation({
                ruleId: 'environment-runtime-mismatch',
                file: 'package.json',
                message: `Entorno de ejecución desalineado. ` +
                    `Detectado Node v${process.versions.node} / npm ${rawNpmVer}, ` +
                    `requerido Node ${pkg.engines?.node ?? auditorEngines.node} / npm ${pkg.engines?.npm ?? auditorEngines.npm}.`,
                severity: 'error'
            });
        }
    }
    async runAudit() {
        const pkgPath = path.resolve(this.projectRoot, 'package.json');
        this.recordScanned('package.json');
        const auditorEngines = getAuditorEngines();
        const minNodeReq = parseSemver(auditorEngines.node);
        const minNpmReq = parseSemver(auditorEngines.npm);
        const pkg = this.validatePackageJson(pkgPath);
        if (!pkg) {
            this.markRuleEvaluated('environment-engines-missing');
            this.markRuleEvaluated('environment-engines-below-floor');
            this.markRuleEvaluated('environment-runtime-mismatch');
            return;
        }
        const hasNodeEngine = typeof pkg.engines?.node === 'string' && pkg.engines.node.trim().length > 0;
        const hasNpmEngine = typeof pkg.engines?.npm === 'string' && pkg.engines.npm.trim().length > 0;
        const activeEngines = { ...(pkg.engines ?? {}) };
        let modifiedPkg = this.auditMissingEngines(hasNodeEngine, hasNpmEngine, activeEngines, auditorEngines);
        this.markRuleEvaluated('environment-engines-missing');
        const belowFloorResult = this.auditEnginesBelowFloor(pkg.engines?.node ?? '', pkg.engines?.npm ?? '', activeEngines, auditorEngines, minNodeReq, minNpmReq);
        if (belowFloorResult.modified) {
            modifiedPkg = true;
        }
        this.markRuleEvaluated('environment-engines-below-floor');
        if (modifiedPkg) {
            writePackageJson(this.projectRoot, { ...pkg, engines: activeEngines });
        }
        this.auditRuntimeMismatch(pkg, auditorEngines, belowFloorResult.nodeReq, belowFloorResult.npmReq, minNodeReq, minNpmReq);
        this.markRuleEvaluated('environment-runtime-mismatch');
    }
}
// CLI entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateEnvironmentEnginesAuditor());
//# sourceMappingURL=validate_environment_engines.js.map