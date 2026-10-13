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
import type { DependencyLocation } from 'fallow/types';
import { BaseAuditor, type AuditorOptions, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditorMinimumVersions } from '../../core/auditorMinimums.ts';
import { getPackageJson } from '../../core/packageJson.ts';

enableCompileCache();

export const DEPENDENCY_MINIMUMS_RULES = [
  'dependency-below-minimum-range',
  'dependency-below-minimum-installed'
] as const;

export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];

interface LockfileShape {
  readonly packages?: Readonly<Record<string, { readonly version?: string }>>; // open-record: lockfile v2/v3 package entries
}

interface DeclaredDependency {
  readonly range: string;
  readonly isProduction: boolean;
}

const DECLARATION_SECTIONS: Record<DependencyLocation, { readonly isProduction: boolean }> = {
  dependencies: { isProduction: true },
  devDependencies: { isProduction: false },
  optionalDependencies: { isProduction: true }
};

export function findDeclaredDependency(
  pkg: Readonly<Record<string, unknown>>, // open-record: parsed package.json
  name: string
): DeclaredDependency | null {
  for (const [section, { isProduction }] of Object.entries(DECLARATION_SECTIONS)) {
    const entries = pkg[section] as Record<string, string> | undefined; // open-record: dependency dictionary
    const range = entries?.[name];
    if (typeof range === 'string') {
      return { range, isProduction };
    }
  }
  return null;
}

export class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
  constructor(options: Partial<AuditorOptions<DependencyMinimumsRuleId>> = {}) {
    super({
      ruleCapabilities: createRuleCapabilities(DEPENDENCY_MINIMUMS_RULES, {
        fix: false,
        fixPriority: false,
        lint: false,
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
    const declaredMin = semver.validRange(declared.range) ? semver.minVersion(declared.range) : null;
    const requiredMin = semver.minVersion(floor);
    if (!declaredMin || !requiredMin) return; // non-registry specs (github:, file:, workspace:) are not comparable
    if (semver.lt(declaredMin, requiredMin)) {
      this.addViolation({
        ruleId: 'dependency-below-minimum-range',
        file: 'package.json',
        message:
          `"${name}" declara "${declared.range}" (piso ${declaredMin.version}) por debajo del mínimo del auditor "${floor}". ` +
          `Ejecuta: ${this.installCommand(name, floor, declared)}`,
        severity: 'error'
      });
    }
  }

  private auditInstalledVersion(name: string, floor: string, declared: DeclaredDependency, lock: LockfileShape): void {
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
        severity: 'error'
      });
    }
  }

  public override async runAudit(): Promise<void> {
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
      for (const { name, floor, declared } of declaredEntries) this.auditDeclaredRange(name, floor, declared);
    });

    const lock = this.readInstalledVersions();
    this.runSubAuditorSync('dependency-below-minimum-installed', () => {
      if (!lock) {
        this.markRuleNotApplicable('dependency-below-minimum-installed', 'package-lock.json ausente o ilegible');
        return;
      }
      this.recordScanned('package-lock.json');
      for (const { name, floor, declared } of declaredEntries) this.auditInstalledVersion(name, floor, declared, lock);
    });
  }
}

// CLI entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDependencyMinimumsAuditor());
