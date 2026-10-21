import { getPackageJson } from "./packageJson.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import semver from "semver";
//#region src/core/auditorMinimums.ts
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
	try {
		const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
		const pkgVersion = lock.packages?.[`node_modules/${name}`]?.version;
		if (pkgVersion) return pkgVersion;
		const legacyDepVersion = lock.dependencies?.[name]?.version;
		if (legacyDepVersion) return legacyDepVersion;
		return null;
	} catch {
		return null;
	}
}
function classifyDependencyStatus(declaredRange, declaredMin, requiredMin, installedVersion, maxSpec) {
	if (maxSpec && semver.intersects(declaredRange, maxSpec.prohibitedRange)) return "exceeds_max_range";
	if (maxSpec && installedVersion && semver.valid(installedVersion) && semver.satisfies(installedVersion, maxSpec.prohibitedRange)) return "exceeds_max_installed";
	if (declaredMin && requiredMin && semver.lt(declaredMin, requiredMin)) return "outdated_range";
	if (installedVersion && semver.valid(installedVersion) && requiredMin && semver.lt(installedVersion, requiredMin)) return "outdated_installed";
	return "satisfied";
}
function evaluateProjectDependencies(projectRoot = process.cwd()) {
	const root = path.resolve(projectRoot);
	const minimums = getAuditorMinimumVersions();
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
		prodInstallCommand: prodUpdates.length > 0 ? `npm install ${prodUpdates.join(" ")}` : void 0,
		devInstallCommand: devUpdates.length > 0 ? `npm install -D ${devUpdates.join(" ")}` : void 0
	};
}
//#endregion
export { AUDITOR_MAXIMUM_VERSIONS, evaluateProjectDependencies, findDeclaredDependency, getAuditorCanonicalOverrides, getAuditorMaximumVersions, getAuditorMinimumVersions, normalizeToCaretRange };
