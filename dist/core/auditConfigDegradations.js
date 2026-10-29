import { AUDIT_CONFIG_FILE } from "./auditConfigTypes.js";
import { tryCatchSync } from "./safeUtils.js";
import { normalizePosixPath } from "./reportUtils.js";
import "./safePath.js";
import "./auditConfig.js";
import { dtoValueToTsExpression, extractExportedConfigObjectLiteral, formatTsNodeTwoSpaceIndent } from "./astContext.js";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/auditConfigDegradations.ts
/**
* src/core/auditConfigDegradations.ts
*
* UNACKNOWLEDGED DEGRADATIONS DETECTOR & AUTO-FIX (Node.js 26+ Native)
* Scans configured exemption roots (scripts, data, cli, demo, exemptFiles) and ensures
* that any path containing code files is registered under coverage.acknowledgedDegradations.
*/
function insertBeforeClosingToken(code, endPos, closingChar, hasExistingItems, snippet) {
	const closePos = code.lastIndexOf(closingChar, endPos - 1);
	if (closePos === -1) return null;
	const beforeClose = code.slice(0, closePos).trimEnd();
	const needsComma = hasExistingItems && !beforeClose.endsWith(",");
	const commaPos = beforeClose.length;
	return (needsComma ? code.slice(0, commaPos) + "," + code.slice(commaPos, closePos) : code.slice(0, closePos)) + snippet + code.slice(closePos);
}
function parseAuditConfigFileAst(configFilePath) {
	try {
		const code = fs.readFileSync(configFilePath, "utf8");
		const source = ts.createSourceFile(configFilePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		return {
			code,
			source,
			configObj: extractExportedConfigObjectLiteral(source)
		};
	} catch {
		return null;
	}
}
const POLICY_DEFINITIONS = [
	{
		policy: "scripts",
		getRoots: (config, projectRoot) => config.paths?.scriptsRoots ?? (fs.existsSync(path.resolve(projectRoot, "scripts")) ? ["scripts"] : []),
		reason: "Build scripts, development tooling, and maintenance",
		isRoot: true
	},
	{
		policy: "data",
		getRoots: (config, projectRoot) => config.paths?.dataRoots ?? (fs.existsSync(path.resolve(projectRoot, "src/data")) ? ["src/data"] : []),
		reason: "Static data tables, fixtures, and domain catalogs",
		isRoot: true
	},
	{
		policy: "cli",
		getRoots: (config, projectRoot) => config.paths?.cliRoots ?? (fs.existsSync(path.resolve(projectRoot, "src/cli")) ? ["src/cli"] : []),
		reason: "Entry points and CLI terminal execution commands",
		isRoot: true
	},
	{
		policy: "demo",
		getRoots: (config) => config.paths?.demoRoots ?? [],
		reason: "Interactive demonstrations and visual test playgrounds",
		isRoot: true
	},
	{
		policy: "exemptFiles",
		getRoots: (config) => config.paths?.exemptFiles ?? [],
		reason: "Files exempt from domain architecture rules",
		isRoot: false
	}
];
function collectRelativeCodeFiles(projectRoot, rootRelPath, maxFiles = 20) {
	const dirAbs = path.resolve(projectRoot, rootRelPath);
	if (!fs.existsSync(dirAbs)) return [];
	try {
		if (!fs.statSync(dirAbs).isDirectory()) return [];
	} catch {
		return [];
	}
	const found = [];
	const queue = [dirAbs];
	while (queue.length > 0 && found.length < maxFiles) {
		const current = queue.pop();
		let entries;
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) queue.push(fullPath);
			else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs|vue)$/i.test(entry.name)) {
				const rel = normalizePosixPath(path.relative(projectRoot, fullPath));
				found.push(rel);
				if (found.length >= maxFiles) break;
			}
		}
	}
	return found;
}
function detectUnacknowledgedDegradations(config, projectRoot) {
	if (config.coverage?.enabled === false) return [];
	const acknowledged = config.coverage?.acknowledgedDegradations ?? [];
	const missing = [];
	for (const def of POLICY_DEFINITIONS) {
		const targets = def.getRoots(config, projectRoot);
		for (const target of targets) if (def.isRoot) {
			const codeFiles = collectRelativeCodeFiles(projectRoot, target);
			if (codeFiles.length === 0) continue;
			const uncovered = codeFiles.filter((f) => !acknowledged.some((ack) => ack.policy === def.policy && path.posix.matchesGlob(f, ack.glob)));
			if (uncovered.length > 0) missing.push({
				policy: def.policy,
				rootOrFile: target,
				suggestedGlob: `${normalizePosixPath(target)}/**`,
				reason: def.reason,
				filesCount: uncovered.length
			});
		} else {
			const absPath = path.resolve(projectRoot, target);
			if (!fs.existsSync(absPath)) continue;
			const relPosix = normalizePosixPath(target);
			if (!acknowledged.some((ack) => ack.policy === def.policy && (ack.glob === relPosix || path.posix.matchesGlob(relPosix, ack.glob)))) missing.push({
				policy: def.policy,
				rootOrFile: target,
				suggestedGlob: relPosix,
				reason: def.reason,
				filesCount: 1
			});
		}
	}
	return missing;
}
function applyAcknowledgedDegradationsFix(projectRoot, missing) {
	const tsPath = path.resolve(projectRoot, AUDIT_CONFIG_FILE);
	const jsonPath = path.resolve(projectRoot, ".auditor/audit.config.json");
	const configFilePath = fs.existsSync(tsPath) ? tsPath : fs.existsSync(jsonPath) ? jsonPath : null;
	if (!configFilePath) return;
	const newEntries = missing.map((m) => ({
		glob: m.suggestedGlob,
		policy: m.policy,
		reason: m.reason
	}));
	if (configFilePath.endsWith(".json")) {
		tryCatchSync(() => {
			const code = fs.readFileSync(configFilePath, "utf8");
			const json = JSON.parse(code);
			const coverage = json.coverage && typeof json.coverage === "object" ? json.coverage : {};
			coverage.acknowledgedDegradations = [...Array.isArray(coverage.acknowledgedDegradations) ? coverage.acknowledgedDegradations : [], ...newEntries];
			json.coverage = coverage;
			fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
		});
		return;
	}
	const parsed = parseAuditConfigFileAst(configFilePath);
	if (!parsed || !parsed.configObj) return;
	const { code, source, configObj } = parsed;
	const coverageProp = configObj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/^['"]|['"]$/g, "") === "coverage");
	const formatIndented = (val, extraIndent = "  ") => formatTsNodeTwoSpaceIndent(dtoValueToTsExpression(val), ts.EmitHint.Expression).split("\n").map((line, idx) => idx === 0 ? line : `${extraIndent}${line}`).join("\n");
	if (!coverageProp || !ts.isObjectLiteralExpression(coverageProp.initializer)) {
		const covStr = formatIndented({ acknowledgedDegradations: newEntries }, "  ");
		const updated = insertBeforeClosingToken(code, configObj.getEnd(), "}", configObj.properties.length > 0, `\n  coverage: ${covStr}\n`);
		if (updated) fs.writeFileSync(configFilePath, updated, "utf8");
		return;
	}
	const coverageObj = coverageProp.initializer;
	const ackProp = coverageObj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/^['"]|['"]$/g, "") === "acknowledgedDegradations");
	if (!ackProp || !ts.isArrayLiteralExpression(ackProp.initializer)) {
		const formattedArray = formatIndented(newEntries, "      ");
		const updated = insertBeforeClosingToken(code, coverageObj.getEnd(), "}", coverageObj.properties.length > 0, `\n    acknowledgedDegradations: ${formattedArray}\n  `);
		if (updated) fs.writeFileSync(configFilePath, updated, "utf8");
		return;
	}
	const ackArray = ackProp.initializer;
	const formattedItems = newEntries.map((entry) => formatIndented(entry, "  ").split("\n").map((l) => `      ${l}`).join("\n")).join(",\n");
	const updated = insertBeforeClosingToken(code, ackArray.getEnd(), "]", ackArray.elements.length > 0, `\n${formattedItems}\n    `);
	if (updated) fs.writeFileSync(configFilePath, updated, "utf8");
}
export { applyAcknowledgedDegradationsFix, collectRelativeCodeFiles, detectUnacknowledgedDegradations };
