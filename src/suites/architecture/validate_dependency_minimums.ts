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
import {
  BaseAuditor,
  type AuditorOptions,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import {
  getAuditorMinimumVersions,
  getAuditorMaximumVersions,
  type DependencyMaximumSpec,
  findDeclaredDependency,
  type DeclaredDependency
} from '../../core/auditorMinimums.ts';
export { findDeclaredDependency, type DeclaredDependency } from '../../core/auditorMinimums.ts';
import { getPackageJson, writePackageJson, type PackageJsonDTO } from '../../core/packageJson.ts';

enableCompileCache();

export const DEPENDENCY_MINIMUMS_RULES = [
  'dependency-below-minimum-range',
  'dependency-below-minimum-installed',
  'dependency-exceeds-maximum-range',
  'dependency-exceeds-maximum-installed'
] as const;

export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];

interface LockfileShape {
  readonly packages?: Readonly<Record<string, { readonly version?: string }>>; // open-record: lockfile v2/v3 package entries
}

export class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
  constructor(options: Partial<AuditorOptions<DependencyMinimumsRuleId>> = {}) {
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(
        DEPENDENCY_MINIMUMS_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['dependency-below-minimum-range', 'dependency-exceeds-maximum-range']
      ),
      fixableRuleIds: ['dependency-below-minimum-range', 'dependency-exceeds-maximum-range'],
      id: 'validate_dependency_minimums',
      name: 'Dependency Minimum Versions Validator',
      description: 'Versión mínima y máxima de librerías instaladas',
      family: 'architecture',
      ruleIds: DEPENDENCY_MINIMUMS_RULES,
      packageName: 'Dependencias',
      configKey: 'environment.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📌',
      ruleDescriptions: {
        'dependency-below-minimum-range': 'Rango declarado inferior al mínimo',
        'dependency-below-minimum-installed': 'Versión instalada inferior al mínimo',
        'dependency-exceeds-maximum-range': 'Rango declarado excede el máximo',
        'dependency-exceeds-maximum-installed': 'Versión instalada excede el máximo'
      },
      ruleRemediations: {
        'dependency-below-minimum-range':
          'Guía de diagnóstico y remediación para dependency-below-minimum-range. Actualiza el rango declarado en package.json al piso mínimo del auditor.',
        'dependency-below-minimum-installed':
          'Guía de diagnóstico y remediación para dependency-below-minimum-installed. Reinstala la dependencia para actualizar package-lock.json al piso mínimo.',
        'dependency-exceeds-maximum-range':
          'Guía de diagnóstico y remediación para dependency-exceeds-maximum-range. Reduce el rango declarado en package.json para no exceder el tope máximo permitido por el auditor.',
        'dependency-exceeds-maximum-installed':
          'Guía de diagnóstico y remediación para dependency-exceeds-maximum-installed. Reinstala la dependencia con una versión inferior al tope máximo permitido en package-lock.json.'
      },
      coverage: { include: ['package.json', 'package-lock.json'] },
      ...options
    });
  }

  private readInstalledVersions(): LockfileShape | null {
    const lockPath = path.resolve(this.projectRoot, 'package-lock.json');
    if (!fs.existsSync(lockPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(lockPath, 'utf8')) as LockfileShape;
    } catch {
      // catch-ok: unreadable lockfile is reported as not applicable, never crashes the audit
      return null;
    }
  }

  private installCommand(name: string, floor: string, declared: DeclaredDependency): string {
    return `npm install ${declared.isProduction ? '' : '-D '}${name}@${floor}`;
  }

  private auditDeclaredRange(name: string, floor: string, declared: DeclaredDependency): void {
    const declaredMin = semver.validRange(declared.range)
      ? semver.minVersion(declared.range)
      : null;
    const requiredMin = semver.minVersion(floor);
    if (!declaredMin || !requiredMin) return; // non-registry specs (github:, file:, workspace:) are not comparable
    if (semver.lt(declaredMin, requiredMin)) {
      this.addViolation({
        ruleId: 'dependency-below-minimum-range',
        file: 'package.json',
        message:
          `"${name}" declara "${declared.range}" (piso ${declaredMin.version}) por debajo del mínimo del auditor "${floor}". ` +
          `Ejecuta "auditor fix" o: ${this.installCommand(name, floor, declared)}`,
        severity: 'error',
        fixable: true
      });
    }
  }

  private auditDeclaredRangeMaximum(
    name: string,
    floor: string,
    declared: DeclaredDependency,
    maxSpec: DependencyMaximumSpec
  ): void {
    if (semver.intersects(declared.range, maxSpec.prohibitedRange)) {
      this.addViolation({
        ruleId: 'dependency-exceeds-maximum-range',
        file: 'package.json',
        message:
          `"${name}" declara "${declared.range}" que permite versiones superiores al máximo "${maxSpec.ceiling}". ` +
          `${maxSpec.reason} Ejecuta "auditor fix" o: ${this.installCommand(name, floor, declared)}`,
        severity: 'error',
        fixable: true
      });
    }
  }

  private auditInstalledVersion(
    name: string,
    floor: string,
    declared: DeclaredDependency,
    lock: LockfileShape
  ): void {
    const installed = lock.packages?.[`node_modules/${name}`]?.version;
    const requiredMin = semver.minVersion(floor);
    if (!installed || !semver.valid(installed) || !requiredMin) return;
    if (semver.lt(installed, requiredMin)) {
      this.addViolation({
        ruleId: 'dependency-below-minimum-installed',
        file: 'package-lock.json',
        message:
          `"${name}" instalada en ${installed} (package-lock.json) por debajo del mínimo del auditor "${floor}". ` +
          `Ejecuta: ${this.installCommand(name, floor, declared)}`,
        severity: 'error',
        fixable: false
      });
    }
  }

  private auditInstalledVersionMaximum(
    name: string,
    floor: string,
    declared: DeclaredDependency,
    lock: LockfileShape,
    maxSpec: DependencyMaximumSpec
  ): void {
    const installed = lock.packages?.[`node_modules/${name}`]?.version;
    if (!installed || !semver.valid(installed)) return;
    if (semver.satisfies(installed, maxSpec.prohibitedRange)) {
      this.addViolation({
        ruleId: 'dependency-exceeds-maximum-installed',
        file: 'package-lock.json',
        message:
          `"${name}" instalada en ${installed} (package-lock.json) excede el máximo permitido "${maxSpec.ceiling}". ` +
          `${maxSpec.reason} Ejecuta: ${this.installCommand(name, floor, declared)}`,
        severity: 'error',
        fixable: false
      });
    }
  }

  private repairDeclaredRangesInPackageJson(
    pkg: PackageJsonDTO,
    minimums: Readonly<Record<string, string>>,
    maximums: Readonly<Record<string, DependencyMaximumSpec>>
  ): PackageJsonDTO {
    let modified = false;
    const nextDeps = pkg.dependencies ? { ...pkg.dependencies } : undefined;
    const nextDevDeps = pkg.devDependencies ? { ...pkg.devDependencies } : undefined;
    const nextOptDeps = pkg.optionalDependencies ? { ...pkg.optionalDependencies } : undefined;

    const sectionMap: Record<string, Record<string, string> | undefined> = {
      dependencies: nextDeps,
      devDependencies: nextDevDeps,
      optionalDependencies: nextOptDeps
    };

    for (const [name, floor] of Object.entries(minimums)) {
      const declared = findDeclaredDependency(pkg, name);
      if (!declared) continue;
      const declaredMin = semver.validRange(declared.range)
        ? semver.minVersion(declared.range)
        : null;
      const requiredMin = semver.minVersion(floor);
      const belowMin = Boolean(declaredMin && requiredMin && semver.lt(declaredMin, requiredMin));
      const maxSpec = maximums[name];
      const exceedsMax = Boolean(
        maxSpec &&
          semver.validRange(declared.range) &&
          semver.intersects(declared.range, maxSpec.prohibitedRange)
      );

      if (belowMin || exceedsMax) {
        const targetSection = sectionMap[declared.section];
        if (targetSection) {
          targetSection[name] = floor;
          modified = true;
        }
      }
    }

    if (!modified) return pkg;

    const updatedPkg: PackageJsonDTO = {
      ...pkg,
      ...(nextDeps ? { dependencies: nextDeps } : {}),
      ...(nextDevDeps ? { devDependencies: nextDevDeps } : {}),
      ...(nextOptDeps ? { optionalDependencies: nextOptDeps } : {})
    };
    writePackageJson(this.projectRoot, updatedPkg);
    return updatedPkg;
  }

  public override async runAudit(): Promise<void> {
    this.recordScanned('package.json');
    const minimums = getAuditorMinimumVersions();
    const maximums = getAuditorMaximumVersions();
    let pkg = getPackageJson(this.projectRoot, true);

    if (!pkg) {
      for (const ruleId of DEPENDENCY_MINIMUMS_RULES) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(ruleId, 'package.json ausente o inválido');
        });
      }
      return;
    }

    if (this.isFixActive()) {
      pkg = this.repairDeclaredRangesInPackageJson(pkg, minimums, maximums);
    }

    const currentPkg = pkg;
    const declaredEntries = Object.entries(minimums).flatMap(([name, floor]) => {
      const declared = findDeclaredDependency(currentPkg, name);
      return declared ? [{ name, floor, declared }] : [];
    });

    this.runSubAuditorSync('dependency-below-minimum-range', () => {
      for (const { name, floor, declared } of declaredEntries) {
        this.auditDeclaredRange(name, floor, declared);
      }
    });

    this.runSubAuditorSync('dependency-exceeds-maximum-range', () => {
      for (const { name, floor, declared } of declaredEntries) {
        const maxSpec = maximums[name];
        if (maxSpec) {
          this.auditDeclaredRangeMaximum(name, floor, declared, maxSpec);
        }
      }
    });

    const lock = this.readInstalledVersions();
    this.runSubAuditorSync('dependency-below-minimum-installed', () => {
      if (!lock) {
        this.markRuleNotApplicable(
          'dependency-below-minimum-installed',
          'package-lock.json ausente o ilegible'
        );
        return;
      }
      this.recordScanned('package-lock.json');
      for (const { name, floor, declared } of declaredEntries) {
        this.auditInstalledVersion(name, floor, declared, lock);
      }
    });

    this.runSubAuditorSync('dependency-exceeds-maximum-installed', () => {
      if (!lock) {
        this.markRuleNotApplicable(
          'dependency-exceeds-maximum-installed',
          'package-lock.json ausente o ilegible'
        );
        return;
      }
      for (const { name, floor, declared } of declaredEntries) {
        const maxSpec = maximums[name];
        if (maxSpec) {
          this.auditInstalledVersionMaximum(name, floor, declared, lock, maxSpec);
        }
      }
    });
  }
}

// CLI entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDependencyMinimumsAuditor());
