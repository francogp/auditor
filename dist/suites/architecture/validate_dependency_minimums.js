import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
import { findDeclaredDependency, getAuditorMaximumVersions, getAuditorMinimumVersions } from "../../core/auditorMinimums.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import semver from "semver";
// src/suites/architecture/validate_dependency_minimums.ts
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
enableCompileCache();
const DEPENDENCY_MINIMUMS_RULES = [
	"dependency-below-minimum-range",
	"dependency-below-minimum-installed",
	"dependency-exact-version-pinned",
	"dependency-exceeds-maximum-range",
	"dependency-exceeds-maximum-installed"
];
function extractExactPinnedVersion(range) {
	if (semver.valid(range)) return range;
	if (range.startsWith("npm:")) {
		const lastAt = range.lastIndexOf("@");
		if (lastAt > 4) {
			const verPart = range.slice(lastAt + 1);
			if (semver.valid(verPart)) return verPart;
		}
	}
	return null;
}
function normalizePinnedVersionToCaret(range) {
	const exact = extractExactPinnedVersion(range);
	if (!exact) return null;
	if (range.startsWith("npm:")) {
		const lastAt = range.lastIndexOf("@");
		return `${range.slice(0, lastAt + 1)}^${exact}`;
	}
	return `^${exact}`;
}
var ValidateDependencyMinimumsAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(DEPENDENCY_MINIMUMS_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [
				"dependency-below-minimum-range",
				"dependency-exact-version-pinned",
				"dependency-exceeds-maximum-range"
			]),
			fixableRuleIds: [
				"dependency-below-minimum-range",
				"dependency-exact-version-pinned",
				"dependency-exceeds-maximum-range"
			],
			id: "validate_dependency_minimums",
			name: "Dependency Minimum Versions Validator",
			description: "Minimum and maximum versions of installed packages",
			family: "architecture",
			ruleIds: DEPENDENCY_MINIMUMS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DEPENDENCY_MINIMUMS_RULES, "setup"),
			packageName: "Dependencies",
			configKey: "environment.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📌",
			ruleDescriptions: {
				"dependency-below-minimum-range": "Declared range below minimum",
				"dependency-below-minimum-installed": "Installed version below minimum",
				"dependency-exact-version-pinned": "Exact version pinned (no range)",
				"dependency-exceeds-maximum-range": "Declared range exceeds maximum",
				"dependency-exceeds-maximum-installed": "Installed version exceeds maximum"
			},
			ruleRemediations: {
				"dependency-below-minimum-range": "1. Root Cause:\nThe version range declared in package.json (dependencies or devDependencies) has a floor lower than the minimum approved by the auditor.\nKeeping dependencies below the minimum floor introduces compiler incompatibilities, typing bugs, or security vulnerabilities already resolved in higher versions.\n\n2. Diagnosis:\nThe violation message specifies the package, the currently declared range, and the required minimum floor mandated by the framework.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" or \"auditor fix\". The auditor will automatically update the ranges in package.json to the approved minimum floor.\n2. Then run \"npm install\" to synchronize package-lock.json.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"dependency-below-minimum-installed": "1. Root Cause:\nThe version currently installed and resolved in package-lock.json (in node_modules/) is below the minimum floor required by the auditor.\nThis typically occurs when package.json was updated without running \"npm install\", or when npm reused an older lockfile resolution.\n\n2. Diagnosis:\nInspect package-lock.json to verify the exact resolved version under \"node_modules/<package>\".\n\n3. Canonical Solution:\nRun the installation command suggested in the error message (e.g., \"npm install -D <package>@<floor>\") or execute \"npm update <package>\".\n\n4. Example / Auto-fix command:\nnpm install",
				"dependency-exact-version-pinned": "1. Root Cause:\nThe version declared in package.json is pinned to an exact version (e.g. \"1.4.0\") without a semver range operator (\"^\" or \">=\").\nPinning exact versions prevents patch and minor updates, breaks peer dependency resolution, and causes fatal npm EOVERRIDE conflicts.\n\n2. Diagnosis:\nInspect package.json to identify dependencies declaring raw version numbers without \"^\".\n\n3. Canonical Solution:\nRun \"npm run auditor:fix\" or \"auditor fix\" to automatically convert exact versions to caret ranges (e.g. \"^1.4.0\").\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"dependency-exceeds-maximum-range": "1. Root Cause:\nThe version range declared in package.json allows resolving versions that exceed the safe maximum ceiling validated by the auditor.\nCritical dependencies (such as TypeScript, Vite, or UI rendering engines) can introduce breaking changes in major or minor versions that have not yet been approved.\n\n2. Diagnosis:\nCheck the range in package.json to see if it uses \"^\" across an unsupported major version or an unbounded \">=\" operator.\n\n3. Canonical Solution:\n1. Run \"npm run auditor:fix\" to automatically constrain the range to the safe ceiling.\n2. Or manually adjust the range in package.json so it does not exceed the ceiling specified in the violation message.\n\n4. Example / Auto-fix command:\nnpm run auditor:fix",
				"dependency-exceeds-maximum-installed": "1. Root Cause:\nThe version installed in package-lock.json exceeds the maximum ceiling permitted by the auditor ecosystem.\n\n2. Diagnosis:\nVerify the installed version in node_modules/<package> via package-lock.json.\n\n3. Canonical Solution:\nReinstall the dependency constrained to a version within the compatibility window: \"npm install -D <package>@<safe-version>\".\n\n4. Example / Auto-fix command:\nnpm install -D <package>@<safe-version>"
			},
			coverage: { include: ["package.json", "package-lock.json"] },
			...options
		});
	}
	readInstalledVersions() {
		const lockPath = path.resolve(this.projectRoot, "package-lock.json");
		if (!fs.existsSync(lockPath)) return null;
		try {
			return JSON.parse(fs.readFileSync(lockPath, "utf8"));
		} catch {
			return null;
		}
	}
	installCommand(name, floor, declared) {
		return `npm install ${declared.isProduction ? "" : "-D "}${name}@${floor}`;
	}
	auditDeclaredExactVersion(name, declared) {
		const exactVersion = extractExactPinnedVersion(declared.range);
		if (!exactVersion) return;
		this.addViolation({
			ruleId: "dependency-exact-version-pinned",
			file: "package.json",
			message: `"${name}" declares exact pinned version "${declared.range}". Declare a minimum semver range (e.g. "^${exactVersion}") to allow updates and prevent EOVERRIDE conflicts. Run "auditor fix" to repair automatically.`,
			severity: "error",
			fixable: true
		});
	}
	auditDeclaredRange(name, floor, declared) {
		const declaredMin = semver.validRange(declared.range) ? semver.minVersion(declared.range) : null;
		const requiredMin = semver.minVersion(floor);
		if (!declaredMin || !requiredMin) return;
		if (semver.lt(declaredMin, requiredMin)) this.addViolation({
			ruleId: "dependency-below-minimum-range",
			file: "package.json",
			message: `"${name}" declares "${declared.range}" (floor ${declaredMin.version}) below the auditor minimum "${floor}". Run "auditor fix" or: ${this.installCommand(name, floor, declared)}`,
			severity: "error",
			fixable: true
		});
	}
	auditDeclaredRangeMaximum(name, floor, declared, maxSpec) {
		if (semver.intersects(declared.range, maxSpec.prohibitedRange)) this.addViolation({
			ruleId: "dependency-exceeds-maximum-range",
			file: "package.json",
			message: `"${name}" declares "${declared.range}" which allows versions exceeding maximum "${maxSpec.ceiling}". ${maxSpec.reason} Run "auditor fix" or: ${this.installCommand(name, floor, declared)}`,
			severity: "error",
			fixable: true
		});
	}
	auditInstalledVersion(name, floor, declared, lock) {
		const installed = lock.packages?.[`node_modules/${name}`]?.version;
		const requiredMin = semver.minVersion(floor);
		if (!installed || !semver.valid(installed) || !requiredMin) return;
		if (semver.lt(installed, requiredMin)) this.addViolation({
			ruleId: "dependency-below-minimum-installed",
			file: "package-lock.json",
			message: `"${name}" installed at ${installed} (package-lock.json) below the auditor minimum "${floor}". Run: ${this.installCommand(name, floor, declared)}`,
			severity: "error",
			fixable: false
		});
	}
	auditInstalledVersionMaximum(name, floor, declared, lock, maxSpec) {
		const installed = lock.packages?.[`node_modules/${name}`]?.version;
		if (!installed || !semver.valid(installed)) return;
		if (semver.satisfies(installed, maxSpec.prohibitedRange)) this.addViolation({
			ruleId: "dependency-exceeds-maximum-installed",
			file: "package-lock.json",
			message: `"${name}" installed at ${installed} (package-lock.json) exceeds allowed maximum "${maxSpec.ceiling}". ${maxSpec.reason} Run: ${this.installCommand(name, floor, declared)}`,
			severity: "error",
			fixable: false
		});
	}
	repairDeclaredRangesInPackageJson(pkg, minimums, maximums) {
		let modified = false;
		const nextDeps = pkg.dependencies ? { ...pkg.dependencies } : void 0;
		const nextDevDeps = pkg.devDependencies ? { ...pkg.devDependencies } : void 0;
		const nextOptDeps = pkg.optionalDependencies ? { ...pkg.optionalDependencies } : void 0;
		const sectionMap = {
			dependencies: nextDeps,
			devDependencies: nextDevDeps,
			optionalDependencies: nextOptDeps
		};
		for (const [name, floor] of Object.entries(minimums)) {
			const declared = findDeclaredDependency(pkg, name);
			if (!declared) continue;
			const declaredMin = semver.validRange(declared.range) ? semver.minVersion(declared.range) : null;
			const requiredMin = semver.minVersion(floor);
			const belowMin = Boolean(declaredMin && requiredMin && semver.lt(declaredMin, requiredMin));
			const maxSpec = maximums[name];
			const exceedsMax = Boolean(maxSpec && semver.validRange(declared.range) && semver.intersects(declared.range, maxSpec.prohibitedRange));
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
		const updatedPkg = {
			...pkg,
			...nextDeps ? { dependencies: nextDeps } : {},
			...nextDevDeps ? { devDependencies: nextDevDeps } : {},
			...nextOptDeps ? { optionalDependencies: nextOptDeps } : {}
		};
		writePackageJson(this.projectRoot, updatedPkg);
		return updatedPkg;
	}
	async runAudit() {
		this.recordScanned("package.json");
		const minimums = getAuditorMinimumVersions();
		const maximums = getAuditorMaximumVersions();
		let pkg = getPackageJson(this.projectRoot, true);
		if (!pkg) {
			for (const ruleId of DEPENDENCY_MINIMUMS_RULES) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "Missing or invalid package.json");
			});
			return;
		}
		if (this.isFixActive()) pkg = this.repairDeclaredRangesInPackageJson(pkg, minimums, maximums);
		const currentPkg = pkg;
		const declaredEntries = Object.entries(minimums).flatMap(([name, floor]) => {
			const declared = findDeclaredDependency(currentPkg, name);
			return declared ? [{
				name,
				floor,
				declared
			}] : [];
		});
		this.runSubAuditorSync("dependency-below-minimum-range", () => {
			for (const { name, floor, declared } of declaredEntries) this.auditDeclaredRange(name, floor, declared);
		});
		this.runSubAuditorSync("dependency-exact-version-pinned", () => {
			for (const { name, declared } of declaredEntries) this.auditDeclaredExactVersion(name, declared);
		});
		this.runSubAuditorSync("dependency-exceeds-maximum-range", () => {
			for (const { name, floor, declared } of declaredEntries) {
				const maxSpec = maximums[name];
				if (maxSpec) this.auditDeclaredRangeMaximum(name, floor, declared, maxSpec);
			}
		});
		const lock = this.readInstalledVersions();
		this.runSubAuditorSync("dependency-below-minimum-installed", () => {
			if (!lock) {
				this.markRuleNotApplicable("dependency-below-minimum-installed", "package-lock.json ausente o ilegible");
				return;
			}
			this.recordScanned("package-lock.json");
			for (const { name, floor, declared } of declaredEntries) this.auditInstalledVersion(name, floor, declared, lock);
		});
		this.runSubAuditorSync("dependency-exceeds-maximum-installed", () => {
			if (!lock) {
				this.markRuleNotApplicable("dependency-exceeds-maximum-installed", "package-lock.json ausente o ilegible");
				return;
			}
			for (const { name, floor, declared } of declaredEntries) {
				const maxSpec = maximums[name];
				if (maxSpec) this.auditInstalledVersionMaximum(name, floor, declared, lock, maxSpec);
			}
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDependencyMinimumsAuditor());
export { DEPENDENCY_MINIMUMS_RULES, ValidateDependencyMinimumsAuditor, extractExactPinnedVersion, findDeclaredDependency, normalizePinnedVersionToCaret };
