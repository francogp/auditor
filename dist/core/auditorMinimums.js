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
function getAuditorMinimumVersions() {
	const auditorPackageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
	if (fs.existsSync(auditorPackageJsonPath)) {
		const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, "utf8"));
		if (data.peerDependencies && Object.keys(data.peerDependencies).length > 0) return data.peerDependencies;
	}
	throw new Error(`[getAuditorMinimumVersions] Could not read peerDependencies from @francogp/auditor package.json (${auditorPackageJsonPath}). Hardcoded fallbacks are strictly prohibited.`);
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
function evaluateProjectDependencies(projectRoot = process.cwd()) {
	const root = path.resolve(projectRoot);
	const minimums = getAuditorMinimumVersions();
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
		let status = "satisfied";
		if (declaredMin && requiredMin && semver.lt(declaredMin, requiredMin)) status = "outdated_range";
		else if (installedVersion && semver.valid(installedVersion) && requiredMin && semver.lt(installedVersion, requiredMin)) status = "outdated_installed";
		const installCommand = status !== "satisfied" ? `npm install ${isProd ? "" : "-D "}${name}@${floor}` : void 0;
		if (status !== "satisfied") {
			if (isProd) prodUpdates.push(`${name}@${floor}`);
			else devUpdates.push(`${name}@${floor}`);
		}
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
	const prodInstallCommand = prodUpdates.length > 0 ? `npm install ${prodUpdates.join(" ")}` : void 0;
	const devInstallCommand = devUpdates.length > 0 ? `npm install -D ${devUpdates.join(" ")}` : void 0;
	return {
		projectRoot: root,
		evaluated,
		totalGoverned: Object.keys(minimums).length,
		declaredCount: declaredItems.length,
		satisfiedCount,
		outdatedCount,
		undeclaredCount,
		prodInstallCommand,
		devInstallCommand
	};
}
//#endregion
export { evaluateProjectDependencies, findDeclaredDependency, getAuditorMinimumVersions };
