import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/astContext.js";
import "../../core/safePath.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { detectDuplicateConstants } from "../../analyzers/constantAnalyzer.js";
import { badConstantNames, noAliasConstants, noLiteralSuffixInConstantName } from "../../analyzers/constantRules.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
//#region src/suites/architecture/validate_constant_hygiene.ts
/**
* src/suites/architecture/validate_constant_hygiene.ts
*
* UNIFIED CONSTANT HYGIENE & DUPLICATION AUDITOR (Node.js 26+ Native)
*
* Enforces unified constant declaration architecture and magic number governance:
*   1. Cross-module duplicate constant detection (identical or divergent values via AST).
*   2. Strict prohibition of inline magic numbers outside designated data/config roots.
*   3. Naming convention enforcement: prohibition of value suffixes in constant names.
*   4. Prohibition of redundant 1:1 constant aliases (const A = B / export const A = B).
*   5. Prohibition of raw numeric literals in constant suffixes (_100, _600).
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_constant_hygiene.ts
*/
enableCompileCache();
const CONSTANT_HYGIENE_RULES = [
	"duplicate-constant-identical",
	"duplicate-constant-divergent",
	"constant-bad-names",
	"constant-no-alias",
	"constant-no-literal-suffix"
];
const P_EXPORT_REDUNDANT_ALIAS = /^\s*export\s+const\s+([A-Z_a-z]\w*)\s*=\s*([A-Z_a-z]\w*)\s*;/gm;
var ValidateConstantHygieneAuditor = class extends FileScanAuditor {
	scannedAbsFiles = [];
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const effectiveProjectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const config = getAuditConfig(effectiveProjectRoot);
		const effectiveRoots = (optionsObj?.roots ?? (Array.isArray(rootsOrOptions) ? rootsOrOptions : config.paths.srcRoots ?? [])).map((r) => toPosixRelative(effectiveProjectRoot, r));
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(CONSTANT_HYGIENE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_constant_hygiene",
			name: "Constant Hygiene & Duplicate Validator",
			description: "Gobernanza de constantes, duplicados y nomenclatura",
			family: "architecture",
			packageName: "Constantes",
			configKey: "constants",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🔢",
			roots: effectiveRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"]),
			requiresAst: true,
			ruleIds: CONSTANT_HYGIENE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(CONSTANT_HYGIENE_RULES, "dedup"),
			ruleDescriptions: {
				"duplicate-constant-identical": "Constante idéntica duplicada",
				"duplicate-constant-divergent": "Constante dispar entre módulos",
				"constant-bad-names": "Nombre con sufijo de valor",
				"constant-no-alias": "Alias redundante de constante",
				"constant-no-literal-suffix": "Sufijo numérico en constante"
			},
			ruleRemediations: {
				"duplicate-constant-identical": "Centraliza la constante en un módulo común de constantes del dominio (ej. src/constants/) y reusa la exportación mediante ts-morph o npm run auditor:magic.",
				"duplicate-constant-divergent": "Resuelve la disparidad de valores asignando nombres semánticos específicos o unificando el valor canónico en un módulo SSoT.",
				"constant-bad-names": "Elimina el valor numérico del nombre de la constante (ej. usa MAX_RETRY_COUNT en lugar de MAX_RETRY_COUNT_5).",
				"constant-no-alias": "Elimina el alias redundante de constante e importa o utiliza directamente la constante canónica de origen.",
				"constant-no-literal-suffix": "Remueve el sufijo numérico crudo del nombre de la constante (ej. _100, _600); usa nombres semánticos de dominio."
			},
			projectRoot: effectiveProjectRoot
		});
	}
	scanRegexConstantRules(relPath, content, range) {
		const regexChecks = [
			{
				ruleId: "constant-bad-names",
				rule: badConstantNames
			},
			{
				ruleId: "constant-no-literal-suffix",
				rule: noLiteralSuffixInConstantName
			},
			{
				ruleId: "constant-no-alias",
				rule: noAliasConstants
			}
		];
		for (const { ruleId, rule } of regexChecks) this.runSubAuditorSync(ruleId, () => {
			rule.regex.lastIndex = range.start;
			let m;
			while ((m = rule.regex.exec(content)) !== null) {
				if (m.index >= range.end) break;
				if (rule.check && !rule.check(content, m, relPath)) continue;
				const message = typeof rule.message === "function" ? rule.message(m[0]) : rule.message;
				this.addViolationAtMatch({
					ruleId,
					filePath: relPath,
					content,
					matchIndex: m.index,
					message,
					context: m[0]
				});
			}
		});
	}
	scanRedundantExportAliases(relPath, content, range) {
		this.runSubAuditorSync("constant-no-alias", () => {
			let m;
			P_EXPORT_REDUNDANT_ALIAS.lastIndex = range.start;
			while ((m = P_EXPORT_REDUNDANT_ALIAS.exec(content)) !== null) {
				if (m.index >= range.end) break;
				const aliasName = m[1];
				const targetName = m[2];
				if (!aliasName || !targetName || aliasName === targetName) continue;
				if (/^(?:true|false|null|undefined|NaN|Infinity|\d+)$/.test(targetName)) continue;
				const norm = normalizePosixPath(relPath).toLowerCase();
				if (norm.includes("node_modules") || isTestPath(norm)) continue;
				const preceding = content.slice(0, m.index);
				const lineText = preceding.split("\n").pop() ?? "";
				const nextNl = content.indexOf("\n", m.index);
				const fullLine = lineText + content.slice(m.index, nextNl === -1 ? void 0 : nextNl);
				if (fullLine.includes("// value-ok:") || fullLine.includes("// const-ok:") || fullLine.includes("// json-ok:") || fullLine.includes("// alias-ok:")) continue;
				if (new RegExp(`import\\s+${targetName}\\s+from\\s+['"][^'"]*\\.json['"]`).test(content) || /(?:json|dbjson)$/i.test(targetName)) continue;
				const line = preceding.split("\n").length;
				const column = lineText.length + 1;
				this.addViolation({
					ruleId: "constant-no-alias",
					severity: "error",
					filePath: relPath,
					line,
					column,
					message: `Redefinición redundante 1:1 de constante/función: '${m[0].trim()}'. Usa la constante canónica de origen directamente en lugar de declarar alias passthrough.`,
					context: m[0].trim()
				});
			}
		});
	}
	scanFile(relPath, content) {
		const absPath = path.resolve(this.projectRoot, relPath);
		if (!isTestPath(relPath) && !relPath.endsWith(".d.ts")) this.scannedAbsFiles.push(absPath);
		const isVue = relPath.endsWith(".vue");
		const vueBlocks = isVue ? parseVueSfcBlocks(content) : null;
		const scriptRanges = vueBlocks ? vueBlocks.scripts.map((s) => ({
			start: s.contentStartIndex,
			end: s.contentStartIndex + s.content.length
		})) : [{
			start: 0,
			end: content.length
		}];
		if (isVue && scriptRanges.length === 0) return;
		for (const range of scriptRanges) {
			this.scanRegexConstantRules(relPath, content, range);
			this.scanRedundantExportAliases(relPath, content, range);
		}
	}
	async runAudit(astContext) {
		this.scannedAbsFiles.length = 0;
		await super.runAudit(astContext);
		if (this.scannedAbsFiles.length === 0) {
			this.markRuleNotApplicable("duplicate-constant-identical", "No se encontraron archivos para verificar duplicación");
			this.markRuleNotApplicable("duplicate-constant-divergent", "No se encontraron archivos para verificar duplicación");
			return;
		}
		await this.runSubAuditor("duplicate-constant-identical", async () => {
			const identicalViolations = await detectDuplicateConstants(this.scannedAbsFiles, astContext, this.projectRoot, "identical");
			for (const v of identicalViolations) this.addViolation({
				ruleId: "duplicate-constant-identical",
				severity: v.severity || "error",
				filePath: v.file,
				line: v.line || 1,
				message: v.message,
				context: v.context
			});
		});
		await this.runSubAuditor("duplicate-constant-divergent", async () => {
			const divergentViolations = await detectDuplicateConstants(this.scannedAbsFiles, astContext, this.projectRoot, "divergent");
			for (const v of divergentViolations) this.addViolation({
				ruleId: "duplicate-constant-divergent",
				severity: v.severity || "error",
				filePath: v.file,
				line: v.line || 1,
				message: v.message,
				context: v.context
			});
		});
	}
};
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateConstantHygieneAuditor());
//#endregion
export { CONSTANT_HYGIENE_RULES, ValidateConstantHygieneAuditor as ConstantHygieneAuditor, ValidateConstantHygieneAuditor };
