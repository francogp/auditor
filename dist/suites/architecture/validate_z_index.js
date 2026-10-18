import { AUDIT_CONFIG_FILE } from "../../core/auditConfigTypes.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import { Z_LAYERS, getEffectiveZLayers, resolveZLayersScssPath } from "../../core/auditZLayers.js";
import { isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { fixZIndexLiteral, resolveZLayer } from "../../analyzers/zIndexRules.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import { writeFileSync } from "node:fs";
import fs$1 from "node:fs/promises";
//#region src/suites/architecture/validate_z_index.ts
/**
* scripts/auditors/architecture/validate_z_index.ts
*
* Z-INDEX CONSISTENCY & CSS VARIABLE AUDITOR (Node.js 26+ Native)
*
* Enforces unified Z-Index design system governance:
*   1. 1:1 parity between canonical TypeScript Z_LAYERS and CSS variables in _base.scss.
*   2. Detection of hardcoded numeric z-index literals with automated CSS variable autofix.
*   3. Prohibition of isolated Z-Index constants declared outside canonical Z_LAYERS.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* scripts/auditors/architecture/validate_z_index.ts
*   npm run validate:z-index
*/
enableCompileCache();
const Z_INDEX_RULES = [
	"z-index-missing-var",
	"z-index-mismatch",
	"z-index-read-error",
	"z-index-hardcoded-literal",
	"z-index-isolated-constant"
];
function checkOrFixMissingVar(varName, value, content, isFixMode, errors, violations) {
	const msg = `Falta variable CSS '${varName}' (debe ser ${value})`;
	errors.push(msg);
	if (isFixMode && content.includes(":root {")) return {
		updatedContent: content.replace(/\}\s*$/, `  ${varName}: ${value};\n}\n`),
		wasModified: true
	};
	violations.push({
		ruleId: "z-index-missing-var",
		message: msg,
		context: varName
	});
	return {
		updatedContent: content,
		wasModified: false
	};
}
function checkOrFixMismatchVar(varName, value, parsedValue, matchStr, regex, content, isFixMode, errors, violations) {
	if (parsedValue === value) return {
		updatedContent: content,
		wasModified: false
	};
	const msg = `Desincronización en '${varName}': TS=${value}, SCSS=${matchStr}`;
	errors.push(msg);
	if (isFixMode) return {
		updatedContent: content.replace(regex, `${varName}: ${value}`),
		wasModified: true
	};
	violations.push({
		ruleId: "z-index-mismatch",
		message: msg,
		context: `${varName}: ${matchStr}`
	});
	return {
		updatedContent: content,
		wasModified: false
	};
}
function auditZIndexParity(scssContent, isFixMode, layers = Z_LAYERS) {
	let content = scssContent;
	let modified = false;
	const errors = [];
	const violations = [];
	for (const [key, value] of Object.entries(layers)) {
		const varName = `--z-${key.toLowerCase().replace(/_/g, "-")}`;
		const regex = new RegExp(`${varName}\\s*:\\s*(-?\\d+)\\b`);
		const match = content.match(regex);
		if (!match) {
			const res = checkOrFixMissingVar(varName, value, content, isFixMode, errors, violations);
			content = res.updatedContent;
			if (res.wasModified) modified = true;
		} else {
			const res = checkOrFixMismatchVar(varName, value, parseInt(match[1], 10), match[1], regex, content, isFixMode, errors, violations);
			content = res.updatedContent;
			if (res.wasModified) modified = true;
		}
	}
	return {
		scssContent: content,
		modified,
		errors,
		violations
	};
}
const HARDCODED_Z_INDEX_REGEX = /(?:z-index|zIndex)\s*:\s*(-?\d+)\b/gi;
const ISOLATED_Z_INDEX_CONST_REGEX = /const\s+(\w*Z_INDEX\w*)\s*=\s*(?:'[^']+'|"[^"]+"|\d+)/gi;
var ZIndexAuditor = class extends FileScanAuditor {
	scssPath;
	isExplicit;
	constructor(scssPath, roots, projectRoot) {
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = roots ?? (scssPath ? [path.dirname(scssPath)] : config.paths.srcRoots);
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(Z_INDEX_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [
				"z-index-missing-var",
				"z-index-mismatch",
				"z-index-hardcoded-literal"
			]),
			fixableRuleIds: [
				"z-index-missing-var",
				"z-index-mismatch",
				"z-index-hardcoded-literal"
			],
			id: "validate_z_index",
			name: "Z-Index Consistency Validator",
			description: "Valida paridad entre Z_LAYERS y variables CSS (SCSS)",
			family: "architecture",
			packageName: "Z-Index",
			configKey: "styles.zLayersEnabled",
			defaultConfig: {
				enabled: true,
				zLayersEnabled: true
			},
			criticalConfig: {},
			icon: "🥞",
			roots: effectiveRoots,
			allowedExtensions: /* @__PURE__ */ new Set([
				".vue",
				".scss",
				".css",
				".ts",
				".tsx"
			]),
			ruleIds: Z_INDEX_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(Z_INDEX_RULES, "hygiene"),
			ruleDescriptions: {
				"z-index-missing-var": "Falta variable en _base.scss",
				"z-index-mismatch": "Desincronización TS vs SCSS",
				"z-index-read-error": "Error al leer estilos base",
				"z-index-hardcoded-literal": "Valor hardcodeado sin variable",
				"z-index-isolated-constant": "Constante aislada fuera de Z_LAYERS"
			},
			ruleRemediations: {
				"z-index-missing-var": "📖 GUÍA DE REMEDIACIÓN: z-index-missing-var\n1. Causa Raíz: Se declaró una capa de apilamiento en TypeScript (Z_LAYERS en src/types/zLayers.ts o en audit.config.ts), pero no existe su variable homóloga \"$z-<capa>\" en el archivo de estilos base (src/styles/_base.scss).\n2. Diagnóstico: Compara las claves de Z_LAYERS con las variables $z-* declaradas en _base.scss.\n3. Solución: Agrega la variable SCSS correspondiente en _base.scss igualando el valor numérico definido en TypeScript.\n4. Ejemplo:\n   ❌ En TS: Z_LAYERS = { DROPDOWN: 9000 }, pero falta $z-dropdown en SCSS\n   ✅ En SCSS: $z-dropdown: 9000;",
				"z-index-mismatch": "📖 GUÍA DE REMEDIACIÓN: z-index-mismatch\n1. Causa Raíz: Existe una divergencia numérica entre el valor de z-index definido en TypeScript (Z_LAYERS) y el definido en la variable SCSS ($z-*) para la misma capa de apilamiento.\n2. Diagnóstico: Revisa el mensaje de error que indica qué capa y qué valores discrepan (ej: TS=11000 vs SCSS=10000).\n3. Solución: Unifica ambos valores haciendo coincidir la variable de SCSS con la constante canónica de TypeScript.",
				"z-index-read-error": "📖 GUÍA DE REMEDIACIÓN: z-index-read-error\n1. Causa Raíz: El archivo de estilos base especificado en config.styles.baseScssFile o config.styles.zLayersScssFile no se encuentra en disco o contiene errores de sintaxis al leer las variables.\n2. Diagnóstico: Verifica que la ruta física configurada en .auditor/audit.config.ts exista y sea accesible.\n3. Solución: Corrige la ruta en audit.config.ts o repara los errores sintácticos de SCSS en el archivo de estilos base.",
				"z-index-hardcoded-literal": "📖 GUÍA DE REMEDIACIÓN: z-index-hardcoded-literal\n1. Causa Raíz: Se detectó un valor numérico crudo (hardcoded) asignado a z-index (ej: z-index: 9999 o zIndex: 100) en lugar de utilizar las variables del sistema de capas Z_LAYERS. Los valores hardcodeados generan guerras de especificidad y superposición caótica de ventanas, tooltips y modales.\n2. Diagnóstico: Busca valores numéricos literales en propiedades z-index dentro de bloques de estilo o tweens de GSAP.\n3. Solución:\n   a) En CSS/SCSS: reemplaza el número por la variable oficial: z-index: $z-modal; o z-index: var(--z-modal);\n   b) En TypeScript/GSAP: importa y utiliza el valor de la capa canónica: zIndex: Z_LAYERS.MODAL\n4. Ejemplo:\n   ❌ Incorrecto: .tooltip { z-index: 9999; }\n   ✅ Correcto:   .tooltip { z-index: $z-tooltip; }",
				"z-index-isolated-constant": "📖 GUÍA DE REMEDIACIÓN: z-index-isolated-constant\n1. Causa Raíz: Se detectó la definición de una constante numérica aislada de z-index fuera del catálogo unificado Z_LAYERS (ej: const MODAL_Z = 5000 en un archivo local).\n2. Diagnóstico: Localiza la constante declarada en el archivo señalado por el auditor.\n3. Solución: Elimina la constante aislada e importa el valor canónico desde Z_LAYERS (src/types/zLayers.ts)."
			},
			projectRoot
		});
		if (scssPath) {
			this.scssPath = scssPath;
			this.isExplicit = true;
		} else {
			this.scssPath = resolveZLayersScssPath(this.projectRoot);
			this.isExplicit = !!(config.styles?.zLayersScssFile ?? config.styles?.baseScssFile);
		}
		this.declareFileSubAuditor("z-index-hardcoded-literal", (doc) => {
			const isTest = isTestPath(doc.relPath);
			const isExempt = isExemptFile(doc.relPath);
			if (isTest || isExempt) return;
			HARDCODED_Z_INDEX_REGEX.lastIndex = 0;
			let m;
			const replacements = [];
			while ((m = HARDCODED_Z_INDEX_REGEX.exec(doc.rawContent)) !== null) {
				if (doc.isInsideComment(m.index)) continue;
				const pos = doc.getLineAndColumn(m.index);
				if (doc.hasEscapeHatch(pos.line, "z-index-hardcoded-literal")) continue;
				const numMatch = m[0].match(/-?\d+/);
				const val = numMatch ? parseInt(numMatch[0], 10) : 0;
				const { exactKey, nearestKey, cssVarExpr } = resolveZLayer(val);
				const canFix = Boolean(cssVarExpr);
				if (this.isFixActive() && canFix) {
					const replaced = fixZIndexLiteral(m[0]);
					if (replaced !== m[0]) {
						replacements.push({
							start: m.index,
							end: m.index + m[0].length,
							replacement: replaced
						});
						continue;
					}
				}
				let msg;
				if (exactKey && cssVarExpr) msg = `Z-Index hardcodeado detectado: '${m[0]}'. Corresponde a Z_LAYERS.${exactKey}. Usa '${cssVarExpr}'.`;
				else if (nearestKey && cssVarExpr) msg = `Z-Index relativo detectado: '${m[0]}'. Cerca de Z_LAYERS.${nearestKey}. Usa '${cssVarExpr}'.`;
				else msg = `Z-Index hardcodeado fuera de estándar: '${m[0]}'. Registra la capa en Z_LAYERS o usa una existente.`;
				this.addViolation({
					ruleId: "z-index-hardcoded-literal",
					severity: "error",
					filePath: doc.relPath,
					line: pos.line,
					column: pos.column,
					message: msg,
					context: m[0],
					fixable: canFix
				});
			}
			if (replacements.length > 0) {
				let updated = doc.rawContent;
				for (let i = replacements.length - 1; i >= 0; i--) {
					const r = replacements[i];
					updated = updated.slice(0, r.start) + r.replacement + updated.slice(r.end);
				}
				writeFileSync(doc.filePath, updated, "utf-8");
			}
		});
		this.declareFileSubAuditor("z-index-isolated-constant", (doc) => {
			const norm = normalizePosixPath(doc.relPath).toLowerCase();
			const isTest = isTestPath(doc.relPath);
			const isExempt = isExemptFile(doc.relPath);
			if (isTest || isExempt) return;
			if (norm.endsWith(".ts") || norm.endsWith(".tsx") || norm.endsWith(".vue")) {
				const auditConfig = getAuditConfig(this.projectRoot);
				const zFile = auditConfig.styles?.zLayersTsFile ?? auditConfig.domain?.zLayersFile;
				if (!(zFile && norm.includes(zFile.replace(/^\/+|\/+$/g, "").toLowerCase())) && !norm.includes("node_modules")) {
					ISOLATED_Z_INDEX_CONST_REGEX.lastIndex = 0;
					let cMatch;
					while ((cMatch = ISOLATED_Z_INDEX_CONST_REGEX.exec(doc.rawContent)) !== null) {
						if (doc.isInsideComment(cMatch.index)) continue;
						const pos = doc.getLineAndColumn(cMatch.index);
						if (doc.hasEscapeHatch(pos.line, "z-index-isolated-constant")) continue;
						this.addViolation({
							ruleId: "z-index-isolated-constant",
							severity: "error",
							filePath: doc.relPath,
							line: pos.line,
							column: pos.column,
							message: `Declaración de constante de Z-Index aislada detectada: '${cMatch[0]}'. Está PROHIBIDO declarar constantes de Z-Index fuera de Z_LAYERS. Registra la capa en Z_LAYERS o consume 'Z_LAYERS.<CAPA>'.`,
							context: cMatch[0],
							fixable: false
						});
					}
				}
			}
		});
	}
	async runAudit() {
		if (!this.isExplicit && this.isSuiteGatingDisabled("Z-Layers desactivado en config")) return;
		if (!this.scssPath) {
			this.runSubAuditorSync("z-index-read-error", () => {
				this.addViolation({
					ruleId: "z-index-read-error",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: "Falta configuración de Z-Layers en audit.config.ts: no se encontró archivo SCSS. Defina 'styles.zLayersScssFile' apuntando a su archivo SCSS base, o configure explícitamente 'styles.zLayersEnabled: false' si este proyecto no utiliza capas Z de SCSS.",
					context: AUDIT_CONFIG_FILE
				});
			});
			for (const r of [
				"z-index-missing-var",
				"z-index-mismatch",
				"z-index-hardcoded-literal",
				"z-index-isolated-constant"
			]) this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "Z-Layers no configurado en proyecto");
			});
			return;
		}
		const relTarget = path.relative(this.projectRoot, this.scssPath).split(path.sep).join(path.posix.sep);
		const rootsCoverage = deriveCoverageFromRoots(this.roots, this.allowedExtensions);
		this.redeclareCoverage({
			include: Array.from(/* @__PURE__ */ new Set([relTarget, ...rootsCoverage.include])),
			source: "runtime"
		});
		const isFixMode = this.isFixModeRequested();
		let scssContent = null;
		let readErr = null;
		try {
			scssContent = await fs$1.readFile(this.scssPath, "utf-8");
			this.recordScanned(this.scssPath);
		} catch (err) {
			readErr = err;
		}
		this.runSubAuditorSync("z-index-read-error", () => {
			if (readErr) this.addViolation({
				ruleId: "z-index-read-error",
				severity: "error",
				file: this.scssPath,
				line: 1,
				message: `Error leyendo _base.scss: ${readErr instanceof Error ? readErr.message : typeof readErr === "string" ? readErr : JSON.stringify(readErr)}`,
				context: this.scssPath
			});
		});
		if (scssContent !== null) {
			const effectiveLayers = getEffectiveZLayers(this.projectRoot);
			const result = auditZIndexParity(scssContent, isFixMode, effectiveLayers);
			this.runSubAuditorSync("z-index-missing-var", () => {
				const missingVars = result.violations.filter((v) => v.ruleId === "z-index-missing-var");
				for (const v of missingVars) this.addViolation({
					ruleId: "z-index-missing-var",
					severity: "error",
					file: this.scssPath,
					line: 1,
					message: v.message,
					context: v.context,
					fixable: true
				});
			});
			this.runSubAuditorSync("z-index-mismatch", () => {
				const mismatches = result.violations.filter((v) => v.ruleId === "z-index-mismatch");
				for (const v of mismatches) this.addViolation({
					ruleId: "z-index-mismatch",
					severity: "error",
					file: this.scssPath,
					line: 1,
					message: v.message,
					context: v.context,
					fixable: true
				});
			});
			if (isFixMode && result.modified) await fs$1.writeFile(this.scssPath, result.scssContent, "utf-8");
			this.context.setMetric("Total Layers Checked", Object.keys(Z_LAYERS).length);
			this.context.setMetric("Status", result.modified ? "Auto-fixed" : "Synced");
		} else {
			this.runSubAuditorSync("z-index-missing-var", () => {
				this.markRuleNotApplicable("z-index-missing-var", "Archivo SCSS no legible");
			});
			this.runSubAuditorSync("z-index-mismatch", () => {
				this.markRuleNotApplicable("z-index-mismatch", "Archivo SCSS no legible");
			});
		}
		await super.runAudit();
	}
};
await FileScanAuditor.runCliIfMain(import.meta.url, new ZIndexAuditor());
//#endregion
export { HARDCODED_Z_INDEX_REGEX, ISOLATED_Z_INDEX_CONST_REGEX, ZIndexAuditor, Z_INDEX_RULES, auditZIndexParity, fixZIndexLiteral as fixZIndexLiteralMatch };
