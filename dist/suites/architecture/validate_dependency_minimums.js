/**
 * src/suites/architecture/validate_dependency_minimums.ts
 *
 * CONDITIONAL MINIMUM LIBRARY VERSION AUDITOR (Node.js 26+ Native)
 *
 * For every library listed in the `peerDependencies` of @francogp/auditor, if the host
 * project declares it (dependencies / devDependencies / optionalDependencies), both the
 * declared range floor and the version locked in package-lock.json must be >= the
 * auditor floor. Libraries the host does not declare are ignored. Lint-only: never mutates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import semver from 'semver';
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { getAuditorMinimumVersions } from "../../core/auditorMinimums.js";
import { getPackageJson } from "../../core/packageJson.js";
enableCompileCache();
export const DEPENDENCY_MINIMUMS_RULES = [
    'dependency-below-minimum-range',
    'dependency-below-minimum-installed'
];
const DECLARATION_SECTIONS = {
    dependencies: { isProduction: true },
    devDependencies: { isProduction: false },
    optionalDependencies: { isProduction: true }
};
export function findDeclaredDependency(pkg, // open-record: parsed package.json
name) {
    for (const [section, { isProduction }] of Object.entries(DECLARATION_SECTIONS)) {
        const entries = pkg[section]; // open-record: dependency dictionary
        const range = entries?.[name];
        if (typeof range === 'string') {
            return { range, isProduction };
        }
    }
    return null;
}
export class ValidateDependencyMinimumsAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            usesThirdPartyTool: false,
            ruleCapabilities: createRuleCapabilities(DEPENDENCY_MINIMUMS_RULES, {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            }),
            id: 'validate_dependency_minimums',
            name: 'Dependency Minimum Versions Validator',
            description: 'Versión mínima de librerías instaladas',
            family: 'architecture',
            ruleIds: DEPENDENCY_MINIMUMS_RULES,
            packageName: 'Dependencias',
            configKey: 'environment.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            icon: '📌',
            ruleDescriptions: {
                'dependency-below-minimum-range': 'Rango declarado inferior al mínimo',
                'dependency-below-minimum-installed': 'Versión instalada inferior al mínimo'
            },
            ruleRemediations: {
                'dependency-below-minimum-range': 'Guía de diagnóstico y remediación para dependency-below-minimum-range. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'dependency-below-minimum-installed': 'Guía de diagnóstico y remediación para dependency-below-minimum-installed. Revisa la incidencia detectada y ajusta el código correspondiente.',
            },
            coverage: { include: ['package.json', 'package-lock.json'] },
            ...options
        });
    }
    readInstalledVersions() {
        const lockPath = path.resolve(this.projectRoot, 'package-lock.json');
        if (!fs.existsSync(lockPath))
            return null;
        try {
            return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        }
        catch {
            // catch-ok: unreadable lockfile is reported as not applicable, never crashes the audit
            return null;
        }
    }
    installCommand(name, floor, declared) {
        return `npm install ${declared.isProduction ? '' : '-D '}${name}@${floor}`;
    }
    auditDeclaredRange(name, floor, declared) {
        const declaredMin = semver.validRange(declared.range) ? semver.minVersion(declared.range) : null;
        const requiredMin = semver.minVersion(floor);
        if (!declaredMin || !requiredMin)
            return; // non-registry specs (github:, file:, workspace:) are not comparable
        if (semver.lt(declaredMin, requiredMin)) {
            this.addViolation({
                ruleId: 'dependency-below-minimum-range',
                file: 'package.json',
                message: `"${name}" declara "${declared.range}" (piso ${declaredMin.version}) por debajo del mínimo del auditor "${floor}". ` +
                    `Ejecuta: ${this.installCommand(name, floor, declared)}`,
                severity: 'error'
            });
        }
    }
    auditInstalledVersion(name, floor, declared, lock) {
        const installed = lock.packages?.[`node_modules/${name}`]?.version;
        const requiredMin = semver.minVersion(floor);
        if (!installed || !semver.valid(installed) || !requiredMin)
            return;
        if (semver.lt(installed, requiredMin)) {
            this.addViolation({
                ruleId: 'dependency-below-minimum-installed',
                file: 'package-lock.json',
                message: `"${name}" instalada en ${installed} (package-lock.json) por debajo del mínimo del auditor "${floor}". ` +
                    `Ejecuta: ${this.installCommand(name, floor, declared)}`,
                severity: 'error'
            });
        }
    }
    async runAudit() {
        this.recordScanned('package.json');
        const minimums = getAuditorMinimumVersions();
        const pkg = getPackageJson(this.projectRoot, true);
        if (!pkg) {
            this.runSubAuditorSync('dependency-below-minimum-range', () => {
                this.markRuleNotApplicable('dependency-below-minimum-range', 'package.json ausente o inválido');
            });
            this.runSubAuditorSync('dependency-below-minimum-installed', () => {
                this.markRuleNotApplicable('dependency-below-minimum-installed', 'package.json ausente o inválido');
            });
            return;
        }
        const declaredEntries = Object.entries(minimums).flatMap(([name, floor]) => {
            const declared = findDeclaredDependency(pkg, name);
            return declared ? [{ name, floor, declared }] : [];
        });
        this.runSubAuditorSync('dependency-below-minimum-range', () => {
            for (const { name, floor, declared } of declaredEntries)
                this.auditDeclaredRange(name, floor, declared);
        });
        const lock = this.readInstalledVersions();
        this.runSubAuditorSync('dependency-below-minimum-installed', () => {
            if (!lock) {
                this.markRuleNotApplicable('dependency-below-minimum-installed', 'package-lock.json ausente o ilegible');
                return;
            }
            this.recordScanned('package-lock.json');
            for (const { name, floor, declared } of declaredEntries)
                this.auditInstalledVersion(name, floor, declared, lock);
        });
    }
}
// CLI entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDependencyMinimumsAuditor());
//# sourceMappingURL=validate_dependency_minimums.js.map