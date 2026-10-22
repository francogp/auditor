import { AUDIT_CONFIG_FILE } from "../../core/auditConfigTypes.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import { Z_LAYERS, getEffectiveZLayers, resolveZLayersScssPath } from "../../core/auditZLayers.js";
import { isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
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
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => options.scssPath ? [path.dirname(options.scssPath)] : config.paths.srcRoots);
		const config = getAuditConfig(effectiveRoot);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
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
			description: "Validates parity between Z_LAYERS and CSS variables (SCSS)",
			family: "architecture",
			packageName: "Z-Index",
			configKey: "styles.zLayersEnabled",
			defaultConfig: {
				enabled: true,
				zLayersEnabled: true
			},
			criticalConfig: {},
			icon: "🥞",
			roots: targetRoots,
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
				"z-index-missing-var": "Missing variable in _base.scss",
				"z-index-mismatch": "TS vs SCSS desynchronization",
				"z-index-read-error": "Error reading base styles",
				"z-index-hardcoded-literal": "Hardcoded value without variable",
				"z-index-isolated-constant": "Isolated constant outside Z_LAYERS"
			},
			ruleRemediations: {
				"z-index-missing-var": "📖 REMEDIATION GUIDE: z-index-missing-var\n1. Root Cause: A stacking layer was declared in TypeScript (`Z_LAYERS` in `src/types/zLayers.ts` or in `audit.config.ts`), but lacks its matching `$z-<layer>` variable in the base styles file (`src/styles/_base.scss`).\n2. Diagnosis: Compare `Z_LAYERS` keys against `$z-*` variables declared in `_base.scss`.\n3. Canonical Solution: Add the corresponding SCSS variable in `_base.scss` matching the numeric value in TypeScript.\n4. Example / Auto-fix command:\n   - In TS: `Z_LAYERS = { DROPDOWN: 9000 }`\n   - In SCSS: `$z-dropdown: 9000;`",
				"z-index-mismatch": "📖 REMEDIATION GUIDE: z-index-mismatch\n1. Root Cause: Numerical divergence exists between the z-index value defined in TypeScript (`Z_LAYERS`) and the value in the SCSS variable (`$z-*`) for the same stacking layer.\n2. Diagnosis: Review the error message indicating which layer and values diverge (e.g., TS=11000 vs SCSS=10000).\n3. Canonical Solution: Unify both values by updating the SCSS variable to match the canonical TypeScript constant.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"z-index-read-error": "📖 REMEDIATION GUIDE: z-index-read-error\n1. Root Cause: The base styles file specified in `config.styles.baseScssFile` or `config.styles.zLayersScssFile` was not found on disk or has syntax errors.\n2. Diagnosis: Verify the physical path configured in `.auditor/audit.config.ts` exists and is readable.\n3. Canonical Solution: Correct the path in `audit.config.ts` or fix SCSS syntax errors in the base stylesheet.\n4. Example / Auto-fix command:\n   Verify `styles.baseScssFile` in `.auditor/audit.config.ts`.",
				"z-index-hardcoded-literal": "📖 REMEDIATION GUIDE: z-index-hardcoded-literal\n1. Root Cause: A raw numeric literal was assigned to z-index (e.g. `z-index: 9999` or `zIndex: 100`) instead of using canonical `Z_LAYERS` variables. Hardcoded values trigger specificity wars and modal z-fighting.\n2. Diagnosis: Look for numeric literals in z-index properties within styles or GSAP tweens.\n3. Canonical Solution:\n   a) In CSS/SCSS: replace the number with official variables: `z-index: $z-modal;` or `z-index: var(--z-modal);`.\n   b) In TypeScript/GSAP: import and use canonical layers: `zIndex: Z_LAYERS.MODAL`.\n4. Example / Auto-fix command:\n   ❌ Incorrect: `.tooltip { z-index: 9999; }`\n   ✅ Correct:   `.tooltip { z-index: $z-tooltip; }`",
				"z-index-isolated-constant": "📖 REMEDIATION GUIDE: z-index-isolated-constant\n1. Root Cause: An isolated numeric z-index constant was defined outside the unified `Z_LAYERS` catalog (e.g. `const MODAL_Z = 5000` in a local file).\n2. Diagnosis: Locate the constant declared in the reported file.\n3. Canonical Solution: Delete the isolated constant and import the canonical value from `Z_LAYERS` (`src/types/zLayers.ts`).\n4. Example / Auto-fix command:\n   `import { Z_LAYERS } from \"@/types/zLayers\";`"
			},
			projectRoot: effectiveRoot
		});
		if (options.scssPath) {
			this.scssPath = options.scssPath;
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
				if (exactKey && cssVarExpr) msg = `Hardcoded Z-Index detected: '${m[0]}'. Corresponds to Z_LAYERS.${exactKey}. Use '${cssVarExpr}'.`;
				else if (nearestKey && cssVarExpr) msg = `Relative Z-Index detected: '${m[0]}'. Near Z_LAYERS.${nearestKey}. Use '${cssVarExpr}'.`;
				else msg = `Non-standard hardcoded Z-Index: '${m[0]}'. Register the layer in Z_LAYERS or use an existing one.`;
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
				if (!(zFile && norm.includes(toPosixRelative(this.projectRoot, zFile).toLowerCase())) && !norm.includes("node_modules")) {
					ISOLATED_Z_INDEX_CONST_REGEX.lastIndex = 0;
					let cMatch;
					while ((cMatch = ISOLATED_Z_INDEX_CONST_REGEX.exec(doc.rawContent)) !== null) {
						if (doc.isInsideComment(cMatch.index)) continue;
						const pos = doc.getLineAndColumn(cMatch.index);
						this.addViolation({
							ruleId: "z-index-isolated-constant",
							severity: "error",
							filePath: doc.relPath,
							line: pos.line,
							column: pos.column,
							message: `Isolated Z-Index constant declaration detected: '${cMatch[0]}'. Declaring Z-Index constants outside Z_LAYERS is PROHIBITED. Register the layer in Z_LAYERS or consume 'Z_LAYERS.<LAYER>'.`,
							context: cMatch[0],
							fixable: false
						});
					}
				}
			}
		});
	}
	async runAudit() {
		if (!this.isExplicit && this.isSuiteGatingDisabled("Z-Layers disabled in config")) return;
		if (!this.scssPath) {
			this.runSubAuditorSync("z-index-read-error", () => {
				this.addViolation({
					ruleId: "z-index-read-error",
					severity: "error",
					file: AUDIT_CONFIG_FILE,
					line: 1,
					message: "Missing Z-Layers configuration in audit.config.ts: no SCSS file found. Define 'styles.zLayersScssFile' pointing to your base SCSS file, or explicitly configure 'styles.zLayersEnabled: false' if this project does not use SCSS Z-layers.",
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
