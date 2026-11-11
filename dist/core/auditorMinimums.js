import { getPackageJson, writePackageJson } from "./packageJson.js";
import { safeJsonParse, safeReadFileSync } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import semver from "semver";
// src/core/auditorMinimums.ts
/**
* src/core/auditorMinimums.ts
*
* SSoT for mandatory minimum library versions exposed to host projects.
* The floor of every library is the range declared in the `peerDependencies`
* of `@francogp/auditor/package.json`. Zero hardcoded versions in code.
*/
const AUDITOR_MAXIMUM_VERSIONS = Object.freeze({ typescript: {
	ceiling: "<7.0.0",
	prohibitedRange: ">=7.0.0",
	reason: "TypeScript 7+ is not permitted due to incompatibilities with the Vue component compiler."
} });
function getAuditorMaximumVersions() {
	return AUDITOR_MAXIMUM_VERSIONS;
}
function normalizeToCaretRange(range) {
	const trimmed = range.trim();
	if (trimmed.startsWith(">=")) {
		const versionPart = trimmed.slice(2).trim();
		if (semver.valid(versionPart)) return `^${versionPart}`;
	}
	return trimmed;
}
function readAuditorPackageJsonSection(sectionKey) {
	const auditorPackageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
	if (!fs.existsSync(auditorPackageJsonPath)) return null;
	const section = JSON.parse(fs.readFileSync(auditorPackageJsonPath, "utf8"))[sectionKey];
	return section && Object.keys(section).length > 0 ? section : null;
}
function getAuditorMinimumVersions() {
	const peers = readAuditorPackageJsonSection("peerDependencies");
	if (peers) return peers;
	throw new Error("[getAuditorMinimumVersions] Could not read peerDependencies from @francogp/auditor package.json. Hardcoded fallbacks are strictly prohibited.");
}
function getAuditorCanonicalOverrides() {
	return readAuditorPackageJsonSection("overrides") ?? {};
}
function readHostInstalledAuditorMinimums(projectRoot) {
	const hostAuditorPkgPath = path.join(path.resolve(projectRoot), "node_modules/@francogp/auditor/package.json");
	if (!fs.existsSync(hostAuditorPkgPath)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(hostAuditorPkgPath, "utf8"));
		return data.peerDependencies && Object.keys(data.peerDependencies).length > 0 ? data.peerDependencies : null;
	} catch {
		return null;
	}
}
function splitNpmAliasRange(range) {
	if (!range.startsWith("npm:")) return null;
	const lastAt = range.lastIndexOf("@");
	if (lastAt <= 4) return null;
	return {
		prefix: range.slice(0, lastAt + 1),
		versionPart: range.slice(lastAt + 1)
	};
}
function extractExactPinnedVersion(range) {
	if (semver.valid(range)) return range;
	const alias = splitNpmAliasRange(range);
	if (alias && semver.valid(alias.versionPart)) return alias.versionPart;
	return null;
}
function normalizePinnedVersionToCaret(range) {
	const exact = extractExactPinnedVersion(range);
	if (!exact) return null;
	const alias = splitNpmAliasRange(range);
	return alias ? `${alias.prefix}^${exact}` : `^${exact}`;
}
const DECLARATION_SECTIONS = {
	dependencies: { isProduction: true },
	devDependencies: { isProduction: false },
	optionalDependencies: { isProduction: true }
};
function findDeclaredDependency(pkg, name) {
	for (const [section, { isProduction }] of Object.entries(DECLARATION_SECTIONS)) {
		const range = pkg[section]?.[name];
		if (typeof range === "string") return {
			range,
			isProduction,
			section
		};
	}
	return null;
}
function readLockfileInstalledVersion(projectRoot, name) {
	const lockPath = path.resolve(projectRoot, "package-lock.json");
	if (!fs.existsSync(lockPath)) return null;
	const raw = safeReadFileSync(lockPath);
	if (!raw) return null;
	const lock = safeJsonParse(raw);
	if (!lock) return null;
	const pkgVersion = lock.packages?.[`node_modules/${name}`]?.version;
	if (pkgVersion) return pkgVersion;
	const legacyDepVersion = lock.dependencies?.[name]?.version;
	if (legacyDepVersion) return legacyDepVersion;
	return null;
}
function repairPackageJsonMinimumRanges(projectRoot, pkg, minimums = getAuditorMinimumVersions(), maximums = getAuditorMaximumVersions()) {
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
		const targetSection = sectionMap[declared.section];
		if (!targetSection) continue;
		const declaredMin = semver.validRange(declared.range) ? semver.minVersion(declared.range) : null;
		const requiredMin = semver.minVersion(floor);
		const belowMin = Boolean(declaredMin && requiredMin && semver.lt(declaredMin, requiredMin));
		const maxSpec = maximums[name];
		const exceedsMax = Boolean(maxSpec && semver.validRange(declared.range) && semver.intersects(declared.range, maxSpec.prohibitedRange));
		if (belowMin || exceedsMax) {
			targetSection[name] = normalizeToCaretRange(floor);
			modified = true;
		} else {
			const normalizedCaret = normalizePinnedVersionToCaret(declared.range);
			if (normalizedCaret) {
				targetSection[name] = normalizedCaret;
				modified = true;
			}
		}
	}
	if (!modified) return {
		modified: false,
		pkg
	};
	const updatedPkg = {
		...pkg,
		...nextDeps ? { dependencies: nextDeps } : {},
		...nextDevDeps ? { devDependencies: nextDevDeps } : {},
		...nextOptDeps ? { optionalDependencies: nextOptDeps } : {}
	};
	writePackageJson(projectRoot, updatedPkg);
	return {
		modified: true,
		pkg: updatedPkg
	};
}
function isLockedVersionBelowRange(lockedVersion, declaredRange) {
	if (!lockedVersion || !declaredRange || !semver.valid(lockedVersion)) return false;
	if (!semver.validRange(declaredRange)) return false;
	const minRequired = semver.minVersion(declaredRange);
	return Boolean(minRequired && semver.lt(lockedVersion, minRequired));
}
function isVitestClusterPackageName(pkgName) {
	const cleanName = pkgName.replace(/\/$/, "");
	return cleanName === "vite-plus" || cleanName.startsWith("vite-plus/") || cleanName === "vitest" || cleanName.startsWith("vitest/") || cleanName.startsWith("@vitest/");
}
function isVitestClusterLockKey(lockKey) {
	return lockKey.replaceAll("\\", "/").split("node_modules/").slice(1).some((seg) => isVitestClusterPackageName(seg));
}
/**
* Prunes coupled vite-plus / vitest / @vitest/* entries from package-lock.json when
* their locked versions fall below the floors declared in package.json, preventing
* npm Arborist ERESOLVE peer conflicts caused by exact peerDependencies across @vitest/*.
*/
function pruneStaleVitestClusterFromLockfile(projectRoot) {
	const root = path.resolve(projectRoot);
	const lockPath = path.join(root, "package-lock.json");
	if (!fs.existsSync(lockPath)) return false;
	const pkg = getPackageJson(root, true);
	if (!pkg) return false;
	const rawText = safeReadFileSync(lockPath);
	if (!rawText) return false;
	const rawLock = safeJsonParse(rawText);
	if (!rawLock) return false;
	const packages = rawLock.packages;
	const legacyDeps = rawLock.dependencies;
	if (!packages && !legacyDeps) return false;
	const vitePlusRange = findDeclaredDependency(pkg, "vite-plus")?.range;
	const coverageRange = findDeclaredDependency(pkg, "@vitest/coverage-v8")?.range;
	const vitestRange = findDeclaredDependency(pkg, "vitest")?.range;
	const lockedVitePlus = packages?.["node_modules/vite-plus"]?.version ?? legacyDeps?.["vite-plus"]?.version;
	const lockedVitest = packages?.["node_modules/vitest"]?.version ?? legacyDeps?.vitest?.version;
	const lockedCoverage = packages?.["node_modules/@vitest/coverage-v8"]?.version ?? legacyDeps?.["@vitest/coverage-v8"]?.version;
	if (!(isLockedVersionBelowRange(lockedVitePlus, vitePlusRange) || isLockedVersionBelowRange(lockedCoverage, coverageRange) || isLockedVersionBelowRange(lockedVitest, coverageRange) || isLockedVersionBelowRange(lockedVitest, vitestRange))) return false;
	let removed = false;
	if (packages && typeof packages === "object") {
		const nextPackages = {};
		for (const [key, val] of Object.entries(packages)) if (isVitestClusterLockKey(key)) removed = true;
		else nextPackages[key] = val;
		rawLock.packages = nextPackages;
	}
	if (legacyDeps && typeof legacyDeps === "object") {
		const nextDeps = {};
		for (const [key, val] of Object.entries(legacyDeps)) if (isVitestClusterPackageName(key)) removed = true;
		else nextDeps[key] = val;
		rawLock.dependencies = nextDeps;
	}
	if (!removed) return false;
	fs.writeFileSync(lockPath, JSON.stringify(rawLock, null, 2) + "\n", "utf8");
	return true;
}
function classifyDependencyStatus(declaredRange, declaredMin, requiredMin, installedVersion, maxSpec) {
	if (maxSpec && semver.intersects(declaredRange, maxSpec.prohibitedRange)) return "exceeds_max_range";
	if (maxSpec && installedVersion && semver.valid(installedVersion) && semver.satisfies(installedVersion, maxSpec.prohibitedRange)) return "exceeds_max_installed";
	if (declaredMin && requiredMin && semver.lt(declaredMin, requiredMin)) return "outdated_range";
	if (installedVersion && semver.valid(installedVersion) && requiredMin && semver.lt(installedVersion, requiredMin)) return "outdated_installed";
	return "satisfied";
}
function evaluateProjectDependencies(projectRoot = process.cwd(), minimumsOverride) {
	const root = path.resolve(projectRoot);
	const minimums = minimumsOverride ?? getAuditorMinimumVersions();
	const maximums = getAuditorMaximumVersions();
	const pkg = getPackageJson(root, true);
	const evaluated = [];
	const prodUpdates = [];
	const devUpdates = [];
	for (const [name, floor] of Object.entries(minimums)) {
		const declared = pkg ? findDeclaredDependency(pkg, name) : null;
		const requiredMin = semver.minVersion(floor);
		const installedVersion = readLockfileInstalledVersion(root, name);
		if (!declared) {
			evaluated.push({
				name,
				requiredFloor: floor,
				declaredRange: null,
				declaredFloor: null,
				installedVersion,
				isProduction: false,
				section: null,
				status: "undeclared"
			});
			continue;
		}
		const declaredMin = semver.validRange(declared.range) ? semver.minVersion(declared.range) : null;
		const declaredFloor = declaredMin ? declaredMin.version : null;
		const isProd = declared.isProduction;
		const status = classifyDependencyStatus(declared.range, declaredMin, requiredMin, installedVersion, maximums[name]);
		const installCommand = status !== "satisfied" ? `npm install ${isProd ? "" : "-D "}${name}@${floor}` : void 0;
		if (status !== "satisfied") (isProd ? prodUpdates : devUpdates).push(`${name}@${floor}`);
		evaluated.push({
			name,
			requiredFloor: floor,
			declaredRange: declared.range,
			declaredFloor,
			installedVersion,
			isProduction: isProd,
			section: declared.section,
			status,
			installCommand
		});
	}
	const declaredItems = evaluated.filter((e) => e.status !== "undeclared");
	const satisfiedCount = declaredItems.filter((e) => e.status === "satisfied").length;
	const outdatedCount = declaredItems.filter((e) => e.status !== "satisfied").length;
	const undeclaredCount = evaluated.filter((e) => e.status === "undeclared").length;
	return {
		projectRoot: root,
		evaluated,
		totalGoverned: Object.keys(minimums).length,
		declaredCount: declaredItems.length,
		satisfiedCount,
		outdatedCount,
		undeclaredCount,
		prodUpdates,
		devUpdates,
		prodInstallCommand: prodUpdates.length > 0 ? `npm install ${prodUpdates.join(" ")}` : void 0,
		devInstallCommand: devUpdates.length > 0 ? `npm install -D ${devUpdates.join(" ")}` : void 0
	};
}
export { AUDITOR_MAXIMUM_VERSIONS, evaluateProjectDependencies, extractExactPinnedVersion, findDeclaredDependency, getAuditorCanonicalOverrides, getAuditorMaximumVersions, getAuditorMinimumVersions, normalizeToCaretRange, pruneStaleVitestClusterFromLockfile, readHostInstalledAuditorMinimums, repairPackageJsonMinimumRanges };
