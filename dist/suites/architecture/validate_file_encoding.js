import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_file_encoding.ts
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
	"file-encoding-invalid-charset": "Exige codificación UTF-8 limpia",
	"file-encoding-unwanted-bom": "Prohíbe Byte Order Mark (BOM)",
	"file-encoding-mojibake-detected": "Detección de mojibake corrupto"
};
const FILE_ENCODING_RULE_REMEDIATIONS = {
	"file-encoding-invalid-charset": "📖 GUÍA DE REMEDIACIÓN: file-encoding-invalid-charset\n1. Causa Raíz: El archivo contiene bytes que no forman una secuencia UTF-8 válida, o fue guardado con codificación UTF-16LE / Windows-1252 / ISO-8859-1 (muy común al usar scripts de PowerShell o utilidades de Windows con redirección \">\" o Out-File sin -Encoding utf8).\n2. Diagnóstico: Revisa el archivo reportado. Si al abrirlo en un editor se ven caracteres nulos (\\0) o símbolos extraños (ej: ), la codificación no es UTF-8 estándar.\n3. Solución Canónica:\n   - Ejecuta \"npm run auditor:fix\" o \"auditor fix\" para que el auditor transcodifique automáticamente el archivo a UTF-8 limpio.\n   - En editores (VS Code, IntelliJ), usa \"Guardar con codificación -> UTF-8\".\n4. Ejemplo / Comando de auto-fix:\n   npm run auditor:fix",
	"file-encoding-unwanted-bom": "📖 GUÍA DE REMEDIACIÓN: file-encoding-unwanted-bom\n1. Causa Raíz: El archivo comienza con los bytes de firma Byte Order Mark (BOM: 0xEF, 0xBB, 0xBF en UTF-8, o 0xFF, 0xFE en UTF-16). Aunque el estándar Unicode lo tolera, en el ecosistema web moderno y Node.js rompe selectores CSS/SCSS estrictos, shebangs (#!/usr/bin/env), concatenaciones de empaquetadores y análisis de sintaxis.\n2. Diagnóstico: Ejecuta \"git diff\" en el archivo; si la primera línea muestra caracteres modificados sin cambio visible, o Node.js lee charCodeAt(0) === 65279, el archivo tiene BOM.\n3. Solución Canónica:\n   - Ejecuta \"npm run auditor:fix\" o \"auditor fix\" para remover automáticamente los bytes de BOM preservando el contenido intacto.\n   - En VS Code, selecciona \"UTF-8\" en la barra de estado en vez de \"UTF-8 with BOM\".\n4. Ejemplo / Comando de auto-fix:\n   npm run auditor:fix",
	"file-encoding-mojibake-detected": "📖 GUÍA DE REMEDIACIÓN: file-encoding-mojibake-detected\n1. Causa Raíz: Se detectaron secuencias típicas de mojibake (doble codificación UTF-8 interpretada como Latin-1/Windows-1252), produciendo caracteres corruptos.\n2. Diagnóstico: Busca la línea indicada en el archivo y verifica si los acentos o caracteres especiales se ven corruptos.\n3. Solución Canónica: Corrige manualmente el texto o restaura los caracteres originales en español / Unicode limpio.\n4. Ejemplo:\n   ❌ Incorrecto: Archivo con acentos rotos por doble codificación.\n   ✅ Correcto:   const msg = \"Configuración de sesión\";"
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
const MOJIBAKE_REGEX = /(?:Ã[¡-º]|Ã±|Ã‘|Â[¡¿°±]|â€[“”—’‘™•]|â€¦)/;
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
			message: "El archivo contiene un Byte Order Mark (BOM) UTF-8 (0xEF, 0xBB, 0xBF). Se exige UTF-8 limpio sin BOM.",
			context: "BOM: UTF-8",
			line: 1,
			col: 1,
			repairAction: "strip-utf8-bom"
		};
	}
	if (buffer.length >= 2 && buffer[0] === 255 && buffer[1] === 254) return {
		ruleId: "file-encoding-invalid-charset",
		severity: "error",
		message: "El archivo está codificado en UTF-16LE con BOM. Se exige codificación estándar UTF-8 sin BOM.",
		context: "Charset: UTF-16LE con BOM",
		line: 1,
		col: 1,
		repairAction: "transcode-utf16le"
	};
	if (buffer.length >= 2 && buffer[0] === 254 && buffer[1] === 255) return {
		ruleId: "file-encoding-invalid-charset",
		severity: "error",
		message: "El archivo está codificado en UTF-16BE con BOM. Se exige codificación estándar UTF-8 sin BOM.",
		context: "Charset: UTF-16BE con BOM",
		line: 1,
		col: 1,
		repairAction: "transcode-utf16be"
	};
	if (isLikelyUtf16LeWithoutBom(buffer)) return {
		ruleId: "file-encoding-invalid-charset",
		severity: "error",
		message: "El archivo contiene bytes alternantes nulos (UTF-16LE sin BOM). Se exige UTF-8 estándar.",
		context: "Charset: UTF-16LE sin BOM",
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
			message: "El archivo contiene secuencias de bytes inválidas para UTF-8 (posible Windows-1252 / ISO-8859-1).",
			context: "Charset: No-UTF8 inválido",
			line: 1,
			col: 1,
			repairAction: "transcode-win1252"
		};
	}
	if (detectMojibake) {
		const lines = decodedText.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.includes("// mojibake-ok:")) continue;
			const match = MOJIBAKE_REGEX.exec(line);
			if (match && typeof match.index === "number") {
				const lineNum = i + 1;
				const colNum = match.index + 1;
				const snippet = line.slice(Math.max(0, match.index - 10), match.index + 20).trim();
				return {
					ruleId: "file-encoding-mojibake-detected",
					severity: "warning",
					message: `Se detectó posible doble codificación (mojibake): "${match[0]}" en "${snippet}".`,
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
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			id: "validate_file_encoding",
			name: "File Encoding & Charset Validator",
			description: "Garantiza codificación UTF-8 sin BOM y transcodificación",
			family: "architecture",
			packageName: "Codificación",
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
			extraIgnorePatterns: [
				"scratch/**",
				"dist/**",
				"coverage/**",
				"node_modules/**",
				...config.encoding?.exemptGlobs ?? []
			],
			projectRoot,
			fix: optionsObj?.fix
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Validación de codificación desactivada en config")) return;
		const encodingConfig = getAuditConfig(this.projectRoot).encoding;
		const prohibitBom = encodingConfig?.prohibitBom ?? true;
		const detectMojibake = encodingConfig?.detectMojibake ?? true;
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
//#endregion
export { DEFAULT_TEXT_EXTENSIONS, FILE_ENCODING_RULES, FILE_ENCODING_RULE_DESCRIPTIONS, FILE_ENCODING_RULE_REMEDIATIONS, FILE_ENCODING_RULE_REMEDIATION_PHASES, KNOWN_BINARY_EXTENSIONS, ValidateFileEncodingAuditor, inspectBufferEncoding, isBinaryBuffer, isLikelyUtf16LeWithoutBom };
