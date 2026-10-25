import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { getEffectiveIgnoreGlobs } from "../../core/canonicalIgnoreRegistry.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_file_encoding.ts
/**
* src/suites/architecture/validate_file_encoding.ts
*
* FILE ENCODING & CHARSET AUDITOR (Node.js 26+ Native)
*
* Enforces standardized file encoding across the entire repository:
*   1. Guarantees all text files are strictly encoded in valid UTF-8.
*   2. Prohibits Byte Order Mark (BOM) markers (UTF-8 BOM 0xEF, 0xBB, 0xBF or UTF-16 BOM).
*   3. Detects corrupted double-encoded mojibake artifacts (e.g. broken UTF-8 in Latin-1).
*   4. Provides auto-fix (--fix / auditor fix) to strip BOM and auto-transcode legacy
*      UTF-16LE or Windows-1252 files into clean UTF-8.
*/
enableCompileCache();
const FILE_ENCODING_RULES = [
	"file-encoding-invalid-charset",
	"file-encoding-unwanted-bom",
	"file-encoding-mojibake-detected"
];
const FILE_ENCODING_RULE_DESCRIPTIONS = {
	"file-encoding-invalid-charset": "Clean UTF-8 encoding required",
	"file-encoding-unwanted-bom": "Byte Order Mark (BOM) prohibited",
	"file-encoding-mojibake-detected": "Corrupt mojibake detected"
};
const FILE_ENCODING_RULE_REMEDIATIONS = {
	"file-encoding-invalid-charset": "📖 REMEDIATION GUIDE: file-encoding-invalid-charset\n1. Root Cause: The file contains bytes that do not form a valid UTF-8 sequence, or was saved with UTF-16LE / Windows-1252 / ISO-8859-1 encoding (commonly caused by PowerShell redirection or Out-File without -Encoding utf8).\n2. Diagnosis: Inspect the reported file. If null characters (\\0) or corrupted symbols appear when opened in an editor, the encoding is not standard UTF-8.\n3. Canonical Solution:\n   - Run \"npm run auditor:fix\" or \"auditor fix\" to automatically transcode the file to clean UTF-8.\n   - In editors (VS Code, IntelliJ), select \"Save with Encoding -> UTF-8\".\n4. Example / Auto-fix command:\n   npm run auditor:fix",
	"file-encoding-unwanted-bom": "📖 REMEDIATION GUIDE: file-encoding-unwanted-bom\n1. Root Cause: The file begins with Byte Order Mark bytes (BOM: 0xEF, 0xBB, 0xBF in UTF-8, or 0xFF, 0xFE in UTF-16). While tolerated by Unicode, in modern Node.js and web tooling it breaks CSS/SCSS selectors, shebangs (#!/usr/bin/env), bundle concatenations, and AST parsers.\n2. Diagnosis: Run \"git diff\" on the file; if the first line shows changes without visible text differences, or charCodeAt(0) === 65279, the file has a BOM.\n3. Canonical Solution:\n   - Run \"npm run auditor:fix\" or \"auditor fix\" to automatically strip BOM bytes while preserving content intact.\n   - In VS Code, select \"UTF-8\" in the status bar instead of \"UTF-8 with BOM\".\n4. Example / Auto-fix command:\n   npm run auditor:fix",
	"file-encoding-mojibake-detected": "📖 REMEDIATION GUIDE: file-encoding-mojibake-detected\n1. Root Cause: Typical mojibake sequences were detected (UTF-8 double-encoding interpreted as Latin-1/Windows-1252), producing corrupted characters.\n2. Diagnosis: Inspect the reported line and check whether accented or multi-byte characters are displayed incorrectly.\n3. Canonical Solution:\n   - Manually fix corrupted text or restore original clean UTF-8 characters.\n   - If the line contains intentional test fixtures or legacy migrations, add the file path to `paths.exemptPaths` in `.auditor/audit.config.ts`.\n4. Example:\n   ❌ Incorrect: Corrupted text from double-encoding\n   ✅ Canonical: const msg = \"User configuration\";"
};
const FILE_ENCODING_RULE_REMEDIATION_PHASES = {
	"file-encoding-invalid-charset": "hygiene",
	"file-encoding-unwanted-bom": "hygiene",
	"file-encoding-mojibake-detected": "polish"
};
const DEFAULT_TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".vue",
	".json",
	".jsonc",
	".md",
	".markdown",
	".scss",
	".sass",
	".css",
	".html",
	".svg",
	".yaml",
	".yml",
	".toml",
	".xml",
	".txt",
	".sh",
	".bash",
	".ps1",
	".bat",
	".cmd",
	".sql"
]);
const KNOWN_BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".ico",
	".webp",
	".avif",
	".pdf",
	".zip",
	".gz",
	".tar",
	".7z",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".otf",
	".wasm",
	".db",
	".sqlite",
	".sqlite3",
	".bin",
	".exe",
	".dll",
	".so",
	".dylib"
]);
const MOJIBAKE_REGEX = /(?:\u00C3[\u00A1-\u00BA]|\u00C3\u00B1|\u00C3\u0091|\u00C2[\u00A1\u00BF\u00B0\u00B1]|\u00E2\u20AC[\u201C\u201D\u2014\u2019\u2018\u2122\u2022]|\u00E2\u20AC\u00A6)/;
const MIN_UTF16LE_NULL_ODD_THRESHOLD = 8;
const BINARY_SUSPICIOUS_BYTE_RATIO_THRESHOLD = .15;
function isLikelyUtf16LeWithoutBom(buffer) {
	if (buffer.length < 4) return false;
	const sample = Math.min(buffer.length, 256);
	let nullEven = 0;
	let nullOdd = 0;
	for (let i = 0; i < sample; i++) if (buffer[i] === 0) {
		if (i % 2 === 1) nullOdd++;
		else nullEven++;
	}
	return nullOdd > MIN_UTF16LE_NULL_ODD_THRESHOLD && nullEven === 0;
}
function isBinaryBuffer(buffer) {
	const sampleLength = Math.min(buffer.length, 1024);
	if (sampleLength === 0) return false;
	if (buffer.length >= 2 && (buffer[0] === 255 && buffer[1] === 254 || buffer[0] === 254 && buffer[1] === 255)) return false;
	if (isLikelyUtf16LeWithoutBom(buffer)) return false;
	let controlChars = 0;
	for (let i = 0; i < sampleLength; i++) {
		const byte = buffer[i];
		if (byte === 0) return true;
		if (byte < 9 && byte !== 7 && byte !== 8 || byte > 14 && byte < 32 && byte !== 27) controlChars++;
	}
	return controlChars / sampleLength > BINARY_SUSPICIOUS_BYTE_RATIO_THRESHOLD;
}
function inspectBufferEncoding(buffer, options = {}) {
	const prohibitBom = options.prohibitBom ?? true;
	const detectMojibake = options.detectMojibake ?? true;
	if (buffer.length >= 3 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) {
		if (prohibitBom) return {
			ruleId: "file-encoding-unwanted-bom",
			severity: "error",
			message: "The file contains a UTF-8 Byte Order Mark (BOM) (0xEF, 0xBB, 0xBF). Clean UTF-8 without BOM is required.",
			context: "BOM: UTF-8",
			line: 1,
			col: 1,
			repairAction: "strip-utf8-bom"
		};
	}
	if (buffer.length >= 2 && buffer[0] === 255 && buffer[1] === 254) return {
		ruleId: "file-encoding-invalid-charset",
		severity: "error",
		message: "The file is encoded in UTF-16LE with BOM. Standard UTF-8 without BOM is required.",
		context: "Charset: UTF-16LE with BOM",
		line: 1,
		col: 1,
		repairAction: "transcode-utf16le"
	};
	if (buffer.length >= 2 && buffer[0] === 254 && buffer[1] === 255) return {
		ruleId: "file-encoding-invalid-charset",
		severity: "error",
		message: "The file is encoded in UTF-16BE with BOM. Standard UTF-8 without BOM is required.",
		context: "Charset: UTF-16BE with BOM",
		line: 1,
		col: 1,
		repairAction: "transcode-utf16be"
	};
	if (isLikelyUtf16LeWithoutBom(buffer)) return {
		ruleId: "file-encoding-invalid-charset",
		severity: "error",
		message: "The file contains alternating null bytes (UTF-16LE without BOM). Standard UTF-8 is required.",
		context: "Charset: UTF-16LE without BOM",
		line: 1,
		col: 1,
		repairAction: "transcode-utf16le"
	};
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let decodedText;
	try {
		decodedText = decoder.decode(buffer);
	} catch {
		return {
			ruleId: "file-encoding-invalid-charset",
			severity: "error",
			message: "The file contains byte sequences invalid for UTF-8 (likely Windows-1252 / ISO-8859-1).",
			context: "Charset: Invalid Non-UTF8",
			line: 1,
			col: 1,
			repairAction: "transcode-win1252"
		};
	}
	if (detectMojibake) {
		const lines = decodedText.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = MOJIBAKE_REGEX.exec(line);
			if (match && typeof match.index === "number") {
				const lineNum = i + 1;
				const colNum = match.index + 1;
				const snippet = line.slice(Math.max(0, match.index - 10), match.index + 20).trim();
				return {
					ruleId: "file-encoding-mojibake-detected",
					severity: "warning",
					message: `Possible double encoding (mojibake) detected: "${match[0]}" in "${snippet}".`,
					context: snippet,
					line: lineNum,
					col: colNum
				};
			}
		}
	}
	return null;
}
var ValidateFileEncodingAuditor = class extends FileScanAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const config = getAuditConfig(projectRoot);
		const roots = optionsObj?.roots ?? (Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0) ?? [
			...config.paths.codeRoots,
			...config.paths.testRoots,
			...config.paths.scriptsRoots,
			...config.paths.stylesRoots ?? [],
			".auditor"
		];
		const allowedExtensions = config.encoding?.allowedExtensions !== void 0 && config.encoding.allowedExtensions.length > 0 ? new Set(config.encoding.allowedExtensions) : DEFAULT_TEXT_EXTENSIONS;
		const exemptPaths = [...config.encoding?.exemptPaths ?? [], ...config.encoding?.exemptFiles ?? []];
		const encodingExcludes = [
			...config.encoding?.exemptGlobs ?? [],
			...config.encoding?.exemptPaths ?? [],
			...config.encoding?.exemptFiles ?? []
		];
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			id: "validate_file_encoding",
			name: "File Encoding & Charset Validator",
			description: "Ensures UTF-8 encoding without BOM and transcodings",
			family: "architecture",
			packageName: "Encoding",
			icon: "🔤",
			configKey: "encoding",
			defaultConfig: {
				enabled: true,
				defaultEncoding: "utf-8",
				prohibitBom: true,
				detectMojibake: true
			},
			criticalConfig: {},
			ruleCapabilities: createRuleCapabilities(FILE_ENCODING_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: true,
				ast: false,
				changedOnly: true,
				critical: true
			}),
			ruleIds: FILE_ENCODING_RULES,
			fixableRuleIds: ["file-encoding-unwanted-bom", "file-encoding-invalid-charset"],
			ruleDescriptions: FILE_ENCODING_RULE_DESCRIPTIONS,
			ruleRemediations: FILE_ENCODING_RULE_REMEDIATIONS,
			ruleRemediationPhases: FILE_ENCODING_RULE_REMEDIATION_PHASES,
			roots,
			allowedExtensions,
			exemptPaths,
			extraIgnorePatterns: Array.from(getEffectiveIgnoreGlobs(projectRoot, { extraGlobs: config.encoding?.exemptGlobs ?? [] })),
			coverage: {
				...deriveCoverageFromRoots(roots, allowedExtensions, projectRoot),
				exclude: encodingExcludes
			},
			projectRoot,
			fix: optionsObj?.fix
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Validación de codificación desactivada en config")) return;
		const encodingConfig = getAuditConfig(this.projectRoot).encoding;
		const prohibitBom = encodingConfig?.prohibitBom ?? true;
		const detectMojibake = encodingConfig?.detectMojibake ?? true;
		const encodingExcludes = [
			...encodingConfig?.exemptGlobs ?? [],
			...encodingConfig?.exemptPaths ?? [],
			...encodingConfig?.exemptFiles ?? []
		];
		this.redeclareCoverage({
			...deriveCoverageFromRoots(this.roots, this.allowedExtensions, this.projectRoot),
			exclude: encodingExcludes
		});
		const candidateFiles = this.getScannableFiles();
		let scannedCount = 0;
		let repairedCount = 0;
		for (const relPath of candidateFiles) {
			const filePath = path.resolve(this.projectRoot, relPath);
			const ext = path.extname(filePath).toLowerCase();
			if (KNOWN_BINARY_EXTENSIONS.has(ext)) continue;
			let buffer;
			try {
				buffer = fs.readFileSync(filePath);
			} catch {
				continue;
			}
			if (isBinaryBuffer(buffer)) continue;
			scannedCount++;
			this.recordScanned(relPath);
			const issue = inspectBufferEncoding(buffer, {
				prohibitBom,
				detectMojibake
			});
			if (!issue) continue;
			if (this.isFixActive() && issue.repairAction) {
				if (this.applyRepair(filePath, buffer, issue.repairAction)) {
					repairedCount++;
					continue;
				}
			}
			this.addViolation({
				ruleId: issue.ruleId,
				severity: issue.severity,
				file: relPath,
				line: issue.line ?? 1,
				col: issue.col ?? 1,
				message: issue.message,
				context: issue.context
			});
		}
		this.context.setMetric("Archivos analizados", scannedCount);
		if (repairedCount > 0) this.context.setMetric("Archivos corregidos", repairedCount);
		for (const ruleId of FILE_ENCODING_RULES) this.markRuleEvaluated(ruleId);
	}
	applyRepair(filePath, buffer, action) {
		try {
			if (action === "strip-utf8-bom") {
				const cleanBuffer = buffer.subarray(3);
				fs.writeFileSync(filePath, cleanBuffer);
				return true;
			}
			if (action === "transcode-utf16le") {
				const offset = buffer.length >= 2 && buffer[0] === 255 && buffer[1] === 254 ? 2 : 0;
				const text = new TextDecoder("utf-16le").decode(buffer.subarray(offset));
				fs.writeFileSync(filePath, text, "utf8");
				return true;
			}
			if (action === "transcode-utf16be") {
				const offset = buffer.length >= 2 && buffer[0] === 254 && buffer[1] === 255 ? 2 : 0;
				const text = new TextDecoder("utf-16be").decode(buffer.subarray(offset));
				fs.writeFileSync(filePath, text, "utf8");
				return true;
			}
			if (action === "transcode-win1252") {
				const text = new TextDecoder("windows-1252").decode(buffer);
				fs.writeFileSync(filePath, text, "utf8");
				return true;
			}
		} catch {
			return false;
		}
		return false;
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateFileEncodingAuditor());
export { DEFAULT_TEXT_EXTENSIONS, FILE_ENCODING_RULES, FILE_ENCODING_RULE_DESCRIPTIONS, FILE_ENCODING_RULE_REMEDIATIONS, FILE_ENCODING_RULE_REMEDIATION_PHASES, KNOWN_BINARY_EXTENSIONS, ValidateFileEncodingAuditor, inspectBufferEncoding, isBinaryBuffer, isLikelyUtf16LeWithoutBom };
