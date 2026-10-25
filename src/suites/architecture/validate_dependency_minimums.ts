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
  createUniformRemediationPhases,
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
  'dependency-exact-version-pinned',
  'dependency-exceeds-maximum-range',
  'dependency-exceeds-maximum-installed'
] as const;

export type DependencyMinimumsRuleId = (typeof DEPENDENCY_MINIMUMS_RULES)[number];

interface LockfileShape {
  readonly packages?: Readonly<Record<string, { readonly version?: string }>>; // open-record: lockfile v2/v3 package entries
}

export function extractExactPinnedVersion(range: string): string | null {
  if (semver.valid(range)) {
    return range;
  }
  if (range.startsWith('npm:')) {
    const lastAt = range.lastIndexOf('@');
    if (lastAt > 4) {
      const verPart = range.slice(lastAt + 1);
      if (semver.valid(verPart)) {
        return verPart;
      }
    }
  }
  return null;
}

export function normalizePinnedVersionToCaret(range: string): string | null {
  const exact = extractExactPinnedVersion(range);
  if (!exact) return null;
  if (range.startsWith('npm:')) {
    const lastAt = range.lastIndexOf('@');
    return `${range.slice(0, lastAt + 1)}^${exact}`;
  }
  return `^${exact}`;
}

export class ValidateDependencyMinimumsAuditor extends BaseAuditor<DependencyMinimumsRuleId> {
  constructor(options: Partial<AuditorOptions<DependencyMinimumsRuleId>> = {}) {
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
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
        ['dependency-below-minimum-range', 'dependency-exact-version-pinned', 'dependency-exceeds-maximum-range']
      ),
      fixableRuleIds: [
        'dependency-below-minimum-range',
        'dependency-exact-version-pinned',
        'dependency-exceeds-maximum-range'
      ],
      id: 'validate_dependency_minimums',
      name: 'Dependency Minimum Versions Validator',
      description: 'Minimum and maximum versions of installed packages',
      family: 'architecture',
      ruleIds: DEPENDENCY_MINIMUMS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DEPENDENCY_MINIMUMS_RULES, 'setup'),
      packageName: 'Dependencies',
      configKey: 'environment.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📌',
      ruleDescriptions: {
        'dependency-below-minimum-range': 'Declared range below minimum',
        'dependency-below-minimum-installed': 'Installed version below minimum',
        'dependency-exact-version-pinned': 'Exact version pinned (no range)',
        'dependency-exceeds-maximum-range': 'Declared range exceeds maximum',
        'dependency-exceeds-maximum-installed': 'Installed version exceeds maximum'
      },
      ruleRemediations: {
        'dependency-below-minimum-range':
          '1. Root Cause:\n' +
          'The version range declared in package.json (dependencies or devDependencies) has a floor lower than the minimum approved by the auditor.\n' +
          'Keeping dependencies below the minimum floor introduces compiler incompatibilities, typing bugs, or security vulnerabilities already resolved in higher versions.\n\n' +
          '2. Diagnosis:\n' +
          'The violation message specifies the package, the currently declared range, and the required minimum floor mandated by the framework.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm run auditor:fix" or "auditor fix". The auditor will automatically update the ranges in package.json to the approved minimum floor.\n' +
          '2. Then run "npm install" to synchronize package-lock.json.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix',
        'dependency-below-minimum-installed':
          '1. Root Cause:\n' +
          'The version currently installed and resolved in package-lock.json (in node_modules/) is below the minimum floor required by the auditor.\n' +
          'This typically occurs when package.json was updated without running "npm install", or when npm reused an older lockfile resolution.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect package-lock.json to verify the exact resolved version under "node_modules/<package>".\n\n' +
          '3. Canonical Solution:\n' +
          'Run the installation command suggested in the error message (e.g., "npm install -D <package>@<floor>") or execute "npm update <package>".\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm install',
        'dependency-exact-version-pinned':
          '1. Root Cause:\n' +
          'The version declared in package.json is pinned to an exact version (e.g. "1.4.0") without a semver range operator ("^" or ">=").\n' +
          'Pinning exact versions prevents patch and minor updates, breaks peer dependency resolution, and causes fatal npm EOVERRIDE conflicts.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect package.json to identify dependencies declaring raw version numbers without "^".\n\n' +
          '3. Canonical Solution:\n' +
          'Run "npm run auditor:fix" or "auditor fix" to automatically convert exact versions to caret ranges (e.g. "^1.4.0").\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix',
        'dependency-exceeds-maximum-range':
          '1. Root Cause:\n' +
          'The version range declared in package.json allows resolving versions that exceed the safe maximum ceiling validated by the auditor.\n' +
          'Critical dependencies (such as TypeScript, Vite, or UI rendering engines) can introduce breaking changes in major or minor versions that have not yet been approved.\n\n' +
          '2. Diagnosis:\n' +
          'Check the range in package.json to see if it uses "^" across an unsupported major version or an unbounded ">=" operator.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm run auditor:fix" to automatically constrain the range to the safe ceiling.\n' +
          '2. Or manually adjust the range in package.json so it does not exceed the ceiling specified in the violation message.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm run auditor:fix',
        'dependency-exceeds-maximum-installed':
          '1. Root Cause:\n' +
          'The version installed in package-lock.json exceeds the maximum ceiling permitted by the auditor ecosystem.\n\n' +
          '2. Diagnosis:\n' +
          'Verify the installed version in node_modules/<package> via package-lock.json.\n\n' +
          '3. Canonical Solution:\n' +
          'Reinstall the dependency constrained to a version within the compatibility window: "npm install -D <package>@<safe-version>".\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm install -D <package>@<safe-version>'
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
      // unreadable lockfile is reported as not applicable, never crashes the audit
      return null;
    }
  }

  private installCommand(name: string, floor: string, declared: DeclaredDependency): string {
    return `npm install ${declared.isProduction ? '' : '-D '}${name}@${floor}`;
  }

  private auditDeclaredExactVersion(name: string, declared: DeclaredDependency): void {
    const exactVersion = extractExactPinnedVersion(declared.range);
    if (!exactVersion) return;

    this.addViolation({
      ruleId: 'dependency-exact-version-pinned',
      file: 'package.json',
      message:
        `"${name}" declares exact pinned version "${declared.range}". ` +
        `Declare a minimum semver range (e.g. "^${exactVersion}") to allow updates and prevent EOVERRIDE conflicts. ` +
        `Run "auditor fix" to repair automatically.`,
      severity: 'error',
      fixable: true
    });
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
          `"${name}" declares "${declared.range}" (floor ${declaredMin.version}) below the auditor minimum "${floor}". ` +
          `Run "auditor fix" or: ${this.installCommand(name, floor, declared)}`,
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
          `"${name}" declares "${declared.range}" which allows versions exceeding maximum "${maxSpec.ceiling}". ` +
          `${maxSpec.reason} Run "auditor fix" or: ${this.installCommand(name, floor, declared)}`,
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
          `"${name}" installed at ${installed} (package-lock.json) below the auditor minimum "${floor}". ` +
          `Run: ${this.installCommand(name, floor, declared)}`,
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
          `"${name}" installed at ${installed} (package-lock.json) exceeds allowed maximum "${maxSpec.ceiling}". ` +
          `${maxSpec.reason} Run: ${this.installCommand(name, floor, declared)}`,
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

      const targetSection = sectionMap[declared.section];
      if (!targetSection) continue;

      if (belowMin || exceedsMax) {
        targetSection[name] = floor;
        modified = true;
      } else {
        const normalizedCaret = normalizePinnedVersionToCaret(declared.range);
        if (normalizedCaret) {
          targetSection[name] = normalizedCaret;
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
          this.markRuleNotApplicable(ruleId, 'Missing or invalid package.json');
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

    this.runSubAuditorSync('dependency-exact-version-pinned', () => {
      for (const { name, declared } of declaredEntries) {
        this.auditDeclaredExactVersion(name, declared);
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
