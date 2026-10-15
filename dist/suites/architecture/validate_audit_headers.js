import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, CANONICAL_IGNORE_DIRS, FileScanAuditor, createRuleCapabilities, getEffectiveScannableRoots, isPathIgnored, loadFallowIgnorePatterns } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_audit_headers.ts
/**
* scripts/auditors/architecture/validate_audit_headers.ts
*
* ILLEGAL AUDIT HEADERS & FILE-LEVEL SUPPRESSIONS AUDITOR (Node.js 26+)
*
* Enforces the project's Absolute Prohibition on File-Level Audit Ignores
* and Zero-Ignore policies across the codebase:
*   - Detects fallow file-level ignore directives.
*   - Detects whole-file eslint-disable blocks.
*   - Detects banned TypeScript compiler bypasses (@ts-nocheck, @ts-ignore, @ts-expect-error).
*   - Detects auditor escape hatches misused as standalone file header comments.
*   - Strictly respects project-level DIRECTORY IGNORES.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_audit_headers.ts
*   npm run validate:audit-headers
*/
enableCompileCache();
const MAX_HEADER_LINES_CHECK = 10;
const HEADER_RULES = [
	"file-level-fallow-ignore",
	"file-level-eslint-disable",
	"banned-ts-suppression",
	"banned-magic-suppression",
	"banned-style-suppression",
	"header-auditor-escape",
	"unjustified-escape-hatch"
];
const FALLOW_IGNORE_FILE_REGEX = /^\s*\/\/\s*fallow-ignore-file\b/i;
const TS_SUPPRESSION_REGEX = /^\s*\/\/\s*@ts-(?:nocheck|ignore|expect-error)\b/i;
const ESLINT_DISABLE_BLOCK_REGEX = /^\s*\/\*\s*eslint-disable\b(?!\s*-(?:next-line|line)\b)/i;
const ESLINT_DISABLE_TEMPLATE_REGEX = /^\s*<!--\s*eslint-disable\b(?!\s*-(?:next-line|line)\b)/i;
const BANNED_MAGIC_SUPPRESSION_REGEX = /\/\/\s*(?:no-magic|magic-ok|number-ok)\b/i;
const BANNED_STYLE_SUPPRESSION_REGEX = /\/\/\s*(?:style-inherited|style-ok)\b/i;
const STANDALONE_ESCAPE_HATCHES_REGEX = /^\s*\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok)\s*$/i;
const UNJUSTIFIED_ESCAPE_HATCH_REGEX = /\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok|uuid-ok|infra-id-ok|spanish-ok|open-record|runtime-set|runtime-map|lib-duplicate-ok|fallback-ok)\b(?!\s*:\s*\S)/i;
function checkLineForIllegalHeaders(filePath, rawLine, lineNum) {
	const trimmed = rawLine.trim();
	if (FALLOW_IGNORE_FILE_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "file-level-fallow-ignore",
		message: `Cabecera ilegal 'fallow-ignore-file' detectada. Está ESTRICTAMENTE PROHIBIDO silenciar auditorías para archivos completos. Resuelve el problema en el código o excluye el directorio a nivel de configuración global.`,
		context: trimmed,
		severity: "error"
	};
	if (TS_SUPPRESSION_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "banned-ts-suppression",
		message: `Supresión de TypeScript detectada ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibido por la política 'Zero-Ignore'.`,
		context: trimmed,
		severity: "error"
	};
	if (ESLINT_DISABLE_BLOCK_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "file-level-eslint-disable",
		message: `Bloque '/* eslint-disable */' a nivel de archivo detectado. Usa 'eslint-disable-next-line' acotado a la línea específica únicamente cuando esté estrictamente justificado.`,
		context: trimmed,
		severity: "error"
	};
	if (ESLINT_DISABLE_TEMPLATE_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "file-level-eslint-disable",
		message: `Directiva '<!-- eslint-disable -->' a nivel de template detectada. Evita deshabilitar reglas en templates enteros.`,
		context: trimmed,
		severity: "error"
	};
	const bannedMagicMatch = rawLine.match(BANNED_MAGIC_SUPPRESSION_REGEX);
	if (bannedMagicMatch) return {
		file: filePath,
		line: lineNum,
		ruleId: "banned-magic-suppression",
		message: `Directiva de escape prohibida '// ${bannedMagicMatch[1]}' detectada. La política de Zero Magic Numbers exige declarar constantes descriptivas ('as const') sin excepciones.`,
		context: trimmed,
		severity: "error"
	};
	const bannedStyleMatch = rawLine.match(BANNED_STYLE_SUPPRESSION_REGEX);
	if (bannedStyleMatch) return {
		file: filePath,
		line: lineNum,
		ruleId: "banned-style-suppression",
		message: `Directiva de escape prohibida '// ${bannedStyleMatch[1]}' detectada. Los estilos scoped de Vue 3 no penetran a componentes hijos; está estrictamente prohibido usar comentarios de herencia simulada de estilos. Cada componente con clases debe vincular o declarar sus estilos explícitamente.`,
		context: trimmed,
		severity: "error"
	};
	if (lineNum <= 10 && STANDALONE_ESCAPE_HATCHES_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "header-auditor-escape",
		message: `Anotación de escape '${trimmed}' usada indebidamente como cabecera de archivo. Las anotaciones de escape deben añadirse únicamente al final de sentencias de código activas.`,
		context: trimmed,
		severity: "error"
	};
	const unjustifiedMatch = rawLine.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
	if (unjustifiedMatch) return {
		file: filePath,
		line: lineNum,
		ruleId: "unjustified-escape-hatch",
		message: `[GUÍA DE ESCAPE HATCHES / IGNORES JUSTIFICADOS] Escape hatch '// ${unjustifiedMatch[1]}' sin justificación técnica obligatoria.
   📚 FORMATO CANÓNICO REQUERIDO: '// ${unjustifiedMatch[1]}: <motivo técnico detallado>'
   💡 EJEMPLOS VÁLIDOS SEGÚN EL CASO:
      - // domain-ok: Texto dinámico de UI, mensajes de chat o cadenas narrativas
      - // uuid-ok: UUID de base de datos o identificador único de sesión
      - // infra-id-ok: Identificador DOM o socket de red externo
      - // open-record: Contenedor JSON dinámico de clave-valor genérico
      - // runtime-set: Set O(1) de validación rápida de identificadores
      - // spanish-ok: Etiqueta o texto de interfaz en español
   ⚠️ PROHIBICIÓN: Nunca uses ignores genéricos ni los uses para ocultar errores de tipado en entidades del sistema.`,
		context: trimmed,
		severity: "error"
	};
	return null;
}
/**
* Scans file contents for illegal suppression headers or file-level ignores.
*/
function scanFileForIllegalHeaders(filePath, content) {
	const violations = [];
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const violation = checkLineForIllegalHeaders(filePath, lines[i], i + 1);
		if (violation) violations.push(violation);
	}
	return violations;
}
/**
* Object-oriented FileScanAuditor implementation for Illegal Audit Headers.
*/
var AuditHeadersAuditor = class extends FileScanAuditor {
	collectedViolations = [];
	constructor(roots, projectRoot) {
		const headerRoots = roots ?? getEffectiveScannableRoots(getAuditConfig(projectRoot));
		super({
			usesThirdPartyTool: false,
			roots: headerRoots,
			projectRoot,
			ruleCapabilities: createRuleCapabilities(HEADER_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_audit_headers",
			name: "Audit Headers & Suppression Validator",
			description: "Prohíbe supresiones a nivel de archivo e ignores globales",
			family: "architecture",
			ruleIds: HEADER_RULES,
			packageName: "Header",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "📰",
			ruleDescriptions: {
				"file-level-fallow-ignore": "fallow-ignore-file prohibido",
				"file-level-eslint-disable": "eslint-disable global prohibido",
				"banned-ts-suppression": "@ts-ignore/@ts-nocheck prohibido",
				"banned-magic-suppression": "Escape de número mágico prohibido",
				"banned-style-suppression": "Escape de estilos prohibido",
				"header-auditor-escape": "Escape hatch mal ubicado",
				"unjustified-escape-hatch": "Escape hatch sin justificación"
			},
			ruleRemediations: {
				"file-level-fallow-ignore": "Guía de diagnóstico y remediación para file-level-fallow-ignore. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"file-level-eslint-disable": "Guía de diagnóstico y remediación para file-level-eslint-disable. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"banned-ts-suppression": "Guía de diagnóstico y remediación para banned-ts-suppression. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"banned-magic-suppression": "Guía de diagnóstico y remediación para banned-magic-suppression. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"banned-style-suppression": "Guía de diagnóstico y remediación para banned-style-suppression. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"header-auditor-escape": "Guía de diagnóstico y remediación para header-auditor-escape. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"unjustified-escape-hatch": "Guía de diagnóstico y remediación para unjustified-escape-hatch. Revisa la incidencia detectada y ajusta el código correspondiente."
			}
		});
	}
	getViolations() {
		return this.collectedViolations;
	}
	scanFile(relPath, content) {
		const lines = content.split(/\r?\n/);
		this.runSubAuditorSync("file-level-fallow-ignore", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (FALLOW_IGNORE_FILE_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "file-level-fallow-ignore",
						message: `Cabecera ilegal 'fallow-ignore-file' detectada. Está ESTRICTAMENTE PROHIBIDO silenciar auditorías para archivos completos. Resuelve el problema en el código o excluye el directorio a nivel de configuración global.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("banned-ts-suppression", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (TS_SUPPRESSION_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "banned-ts-suppression",
						message: `Supresión de TypeScript detectada ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibido por la política 'Zero-Ignore'.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("file-level-eslint-disable", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (ESLINT_DISABLE_BLOCK_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "file-level-eslint-disable",
						message: `Bloque '/* eslint-disable */' a nivel de archivo detectado. Usa 'eslint-disable-next-line' acotado a la línea específica únicamente cuando esté estrictamente justificado.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("banned-magic-suppression", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (BANNED_MAGIC_SUPPRESSION_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "banned-magic-suppression",
						message: `Supresión de número mágico desaconsejada detectada ('/' + '/ no-magic', '/' + '/ magic-ok', '/' + '/ number-ok'). Centraliza los números en constantes de dominio con 'as const' o tipado explícito.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("banned-style-suppression", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (BANNED_STYLE_SUPPRESSION_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "banned-style-suppression",
						message: `Supresión de estilos prohibida detectada ('/' + '/ style-inherited', '/' + '/ style-ok'). Todos los componentes .vue DEBEN incluir su propio bloque <style lang="scss"> según la gobernanza de arquitectura.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("header-auditor-escape", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (STANDALONE_ESCAPE_HATCHES_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "header-auditor-escape",
						message: `Escape hatch huérfano o mal ubicado detectado ('${line.trim()}'). Los escapes deben ubicarse en la misma línea del statement o inmediatamente precediéndolo con ':' y el motivo técnico.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("unjustified-escape-hatch", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const unjustifiedMatch = line.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
				if (unjustifiedMatch) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "unjustified-escape-hatch",
						message: `[GUÍA DE ESCAPE HATCHES / IGNORES JUSTIFICADOS] Escape hatch '// ${unjustifiedMatch[1]}' sin justificación técnica obligatoria.
    📚 FORMATO CANÓNICO REQUERIDO: '// ${unjustifiedMatch[1]}: <motivo técnico detallado>'
    ⚠️ PROHIBICIÓN: Nunca uses ignores genéricos ni los uses para ocultar errores de tipado en entidades del sistema.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
	}
};
/**
* Legacy procedural audit runner preserved for testing and external consumers.
*/
function auditAuditHeaders(targetDir = process.cwd()) {
	const config = getAuditConfig(targetDir);
	const rootsToScan = getEffectiveScannableRoots(config).filter((r) => fs.existsSync(path.resolve(targetDir, r)));
	const auditor = new AuditHeadersAuditor(rootsToScan);
	const files = auditor["context"].collectFiles(rootsToScan);
	for (const file of files) {
		const relPath = path.relative(targetDir, file).split(path.sep).join(path.posix.sep);
		try {
			const content = fs.readFileSync(file, "utf-8");
			auditor["recordScanned"](relPath);
			auditor["scanFile"](relPath, content);
		} catch {}
	}
	const violations = auditor.getViolations();
	const countsByRule = {};
	for (const r of HEADER_RULES) countsByRule[r] = auditor.getCountsByRule().get(r) ?? 0;
	return {
		filesScanned: auditor.getFilesScanned(),
		violations,
		passed: violations.length === 0,
		countsByRule
	};
}
if (process.argv[1] && (process.argv[1].endsWith("validate_audit_headers.ts") || process.argv[1].endsWith("validate_audit_headers.js"))) await BaseAuditor.runCli(new AuditHeadersAuditor());
//#endregion
export { AuditHeadersAuditor, CANONICAL_IGNORE_DIRS, HEADER_RULES, MAX_HEADER_LINES_CHECK, auditAuditHeaders, isPathIgnored, loadFallowIgnorePatterns, scanFileForIllegalHeaders };
