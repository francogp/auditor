#!/usr/bin/env -S node --experimental-strip-types
import { isSelfProviderProject } from "../core/auditProjectIdentity.js";
import "../core/auditConfig.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { bootstrapCliProject, isMainModule } from "./cliUtils.js";
import { initAgentSkill } from "./init_agent.js";
import { syncEnvScripts } from "./sync_env_scripts.js";
import { ensureNpmrcAllowGit } from "../core/npmrcAllowGit.js";
import { runNpmCommandSync } from "../core/npmCommandUtils.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import childProcess from "node:child_process";
//#region src/cli/update_package.ts
/**
* src/cli/update_package.ts
*
* Dedicated CLI updater for @francogp/auditor across host repositories.
* Performs a standard, hermetic npm update without ad-hoc scripts or git cloning.
*/
function findHostProjectRoot(startDir = process.cwd(), stopAt) {
	let current = path.resolve(startDir);
	const boundary = stopAt ? path.resolve(stopAt) : void 0;
	while (true) {
		const pkgPath = path.join(current, "package.json");
		if (fs.existsSync(pkgPath)) return current;
		if (boundary && current === boundary) break;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return path.resolve(startDir);
}
function readInstalledAuditorVersion(projectRoot) {
	try {
		const pkgJsonPath = path.join(projectRoot, "node_modules/@francogp/auditor/package.json");
		if (fs.existsSync(pkgJsonPath)) return JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")).version || "(desconocida)";
	} catch {}
	return "(no instalada)";
}
function updateAuditorPackage(options = {}) {
	const projectRoot = findHostProjectRoot(options.cwd ?? process.cwd(), options.stopAt);
	const hostPkgJsonPath = path.join(projectRoot, "package.json");
	if (!fs.existsSync(hostPkgJsonPath)) return {
		success: false,
		projectRoot,
		previousVersion: "(no disponible)",
		newVersion: "(no disponible)",
		updated: false,
		error: `No se encontró package.json en ${projectRoot}`
	};
	let hostPkg;
	try {
		hostPkg = JSON.parse(fs.readFileSync(hostPkgJsonPath, "utf-8"));
	} catch (err) {
		return {
			success: false,
			projectRoot,
			previousVersion: "(no disponible)",
			newVersion: "(no disponible)",
			updated: false,
			error: `Error al leer package.json: ${err.message}`
		};
	}
	const deps = hostPkg.dependencies || {};
	const devDeps = hostPkg.devDependencies || {};
	if (!Boolean(devDeps["@francogp/auditor"] || deps["@francogp/auditor"])) return {
		success: false,
		projectRoot,
		previousVersion: "(no declarada)",
		newVersion: "(no declarada)",
		updated: false,
		error: "El paquete @francogp/auditor no está declarado en dependencies ni devDependencies."
	};
	const npmArgs = [
		"install",
		"-D",
		"github:francogp/auditor#semver:*"
	];
	ensureNpmrcAllowGit(projectRoot);
	const previousVersion = readInstalledAuditorVersion(projectRoot);
	if (!options.silent) {
		console.log(renderBanner("@FRANCOGP/AUDITOR - ACTUALIZADOR NATIVO DE PAQUETE", `Directorio: ${projectRoot}  |  Versión Actual: ${previousVersion}`));
		console.log(styleText("cyan", `📦 Ejecutando actualización nativa vía npm ${npmArgs.join(" ")}...\n`));
	}
	const proc = runNpmCommandSync(npmArgs, {
		cwd: projectRoot,
		stdio: options.silent ? "pipe" : "inherit",
		encoding: "utf-8"
	});
	if (proc.error || proc.status !== 0) return {
		success: false,
		projectRoot,
		previousVersion,
		newVersion: previousVersion,
		updated: false,
		error: proc.error?.message || proc.stderr?.toString() || `npm ${npmArgs[0]} falló con código de salida ${proc.status}`
	};
	const newVersion = readInstalledAuditorVersion(projectRoot);
	const updated = previousVersion !== newVersion;
	const agentInitResult = initAgentSkill({ targetDir: projectRoot });
	if (!options.silent && agentInitResult.created) console.log(styleText("green", `🤖 ${agentInitResult.message}\n`));
	const envSyncResult = syncEnvScripts({ targetDir: projectRoot });
	if (!options.silent && envSyncResult.filesUpdated.length > 0) console.log(styleText("green", `📜 ${envSyncResult.message}\n`));
	runAuditorFixAutoRemediation(projectRoot, options.silent);
	return {
		success: true,
		projectRoot,
		previousVersion,
		newVersion,
		updated
	};
}
function runAuditorFixAutoRemediation(projectRoot, silent) {
	try {
		const isSelf = isSelfProviderProject(projectRoot);
		if (!silent) console.log(styleText("cyan", "🛠️ Ejecutando auditor fix automáticamente para sincronizar scripts y configuraciones...\n"));
		const hostAuditorPkg = path.join(projectRoot, "node_modules/@francogp/auditor/dist/cli/audit_full.js");
		let cmd = process.platform === "win32" ? "npm.cmd" : "npm";
		let args = ["run", "auditor:fix"];
		if (!isSelf && fs.existsSync(hostAuditorPkg)) {
			cmd = "node";
			args = [
				"--permission",
				"--allow-fs-read=*",
				"--allow-fs-write=*",
				"--allow-child-process",
				"--allow-addons",
				hostAuditorPkg,
				"fix"
			];
		}
		const isWindows = process.platform === "win32";
		return childProcess.spawnSync(cmd, args, {
			cwd: projectRoot,
			stdio: silent ? "pipe" : "inherit",
			encoding: "utf-8",
			shell: cmd === "npm.cmd" && isWindows
		}).status === 0;
	} catch {
		return false;
	}
}
function runCli() {
	const result = updateAuditorPackage();
	if (!result.success) {
		console.error(styleText("red", `\n❌ Falló la actualización de @francogp/auditor: ${result.error}`));
		process.exit(1);
	}
	const columns = [{
		header: "PARÁMETRO",
		width: 26,
		render: (r) => r.param
	}, {
		header: "VALOR / ESTADO",
		width: 48,
		render: (r) => r.val
	}];
	const statusVal = result.updated ? "ACTUALIZADO EXITOSAMENTE ✅" : "YA EN LA ÚLTIMA VERSIÓN (SIN CAMBIOS) ℹ️";
	const rows = [
		{
			param: "Paquete",
			val: "@francogp/auditor"
		},
		{
			param: "Versión Anterior",
			val: result.previousVersion
		},
		{
			param: "Versión Instalada",
			val: result.newVersion
		},
		{
			param: "Estado",
			val: statusVal
		}
	];
	console.log("\n" + renderBoxTable(columns, rows));
	if (result.updated) console.log(styleText("green", `\n✔ @francogp/auditor se actualizó correctamente de v${result.previousVersion} a v${result.newVersion}.\n`));
	else console.log(styleText("cyan", `\nℹ @francogp/auditor ya se encuentra en la última versión disponible (v${result.newVersion}).\n`));
	process.exit(0);
}
if (isMainModule(import.meta.url)) {
	bootstrapCliProject();
	runCli();
}
//#endregion
export { findHostProjectRoot, readInstalledAuditorVersion, runAuditorFixAutoRemediation, runCli, updateAuditorPackage };
