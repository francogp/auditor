import { BaseAuditor, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { getPackageJson } from "../../core/packageJson.js";
import { findConfigRootObject, findPropertyAssignment, getPropertyKeyName, parseTsSourceFile, printTransformedSourceFile, valueToAstExpression } from "../../core/viteConfigAst.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
//#region src/suites/architecture/validate_playwright_config.ts
/**
* src/suites/architecture/validate_playwright_config.ts
*
* PLAYWRIGHT E2E CONFIGURATION & HYGIENE AUDITOR (Node.js 26+ Native)
*
* Enforces standardized end-to-end testing configurations across Playwright suites:
*   1. Conditionally active only when @playwright/test is declared in package.json or an e2e directory exists.
*   2. Guarantees playwright.config.ts exists on disk; auto-scaffolds in --fix mode.
*   3. Enforces standard baseline directives:
*      - timeout (bounded execution time)
*      - reporter (structured output)
*      - trace / screenshot on failure
*/
enableCompileCache();
const PLAYWRIGHT_CONFIG_RULES = ["playwright-config-missing", "playwright-config-missing-setting"];
const CANONICAL_PLAYWRIGHT_CONFIG_LINES = [
	"import { defineConfig, devices } from '@playwright/test';",
	"",
	"export default defineConfig({",
	"  testDir: './e2e',",
	"  timeout: 30000,",
	"  expect: {",
	"    timeout: 5000",
	"  },",
	"  fullyParallel: true,",
	"  forbidOnly: !!process.env.CI,",
	"  retries: process.env.CI ? 2 : 0,",
	"  workers: process.env.CI ? 1 : undefined,",
	"  reporter: [['html', { open: 'never' }], ['list']],",
	"  use: {",
	"    trace: 'on-first-retry',",
	"    screenshot: 'only-on-failure'",
	"  }",
	"});",
	""
];
const CANONICAL_PLAYWRIGHT_CONFIG_CONTENT = CANONICAL_PLAYWRIGHT_CONFIG_LINES.join("\n");
function isPlaywrightProjectContext(projectRoot) {
	try {
		const pkg = getPackageJson(projectRoot);
		if (pkg && (pkg.dependencies?.["@playwright/test"] || pkg.devDependencies?.["@playwright/test"] || pkg.dependencies?.["playwright"] || pkg.devDependencies?.["playwright"])) return true;
	} catch {}
	return fs.existsSync(path.join(projectRoot, "e2e")) || fs.existsSync(path.join(projectRoot, "tests/e2e"));
}
const PLAYWRIGHT_CONFIG_REQUIREMENT = {
	id: "playwright-config",
	file: "playwright.config.ts",
	candidateFiles: [
		"playwright.config.ts",
		"playwright.config.js",
		"playwright.config.mjs"
	],
	description: "Configuración estándar de pruebas E2E (playwright.config.ts)",
	ruleId: "playwright-config-missing",
	isApplicable: (_config, projectRoot) => isPlaywrightProjectContext(projectRoot),
	generateDefaultContent: () => CANONICAL_PLAYWRIGHT_CONFIG_CONTENT
};
var ValidatePlaywrightConfigAuditor = class extends BaseAuditor {
	constructor(rootsOrOptions, maybeProjectRoot) {
		const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions) ? rootsOrOptions : void 0;
		const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
		const configRequirement = {
			...PLAYWRIGHT_CONFIG_REQUIREMENT,
			...optionsObj?.configFile ? {
				file: optionsObj.configFile,
				candidateFiles: [optionsObj.configFile]
			} : {}
		};
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createUniformRuleCapabilities(PLAYWRIGHT_CONFIG_RULES, {
				speed: "light",
				phase: "normal",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			fixableRuleIds: ["playwright-config-missing", "playwright-config-missing-setting"],
			configFiles: [configRequirement],
			id: "validate_playwright_config",
			name: "Playwright Configuration Validator",
			description: "Valida configuración de Playwright para suites E2E",
			icon: "🎭",
			family: "architecture",
			ruleIds: PLAYWRIGHT_CONFIG_RULES,
			packageName: "Playwright",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"playwright-config-missing": "Archivo playwright.config.ts ausente",
				"playwright-config-missing-setting": "Falta directiva en playwright"
			},
			ruleRemediations: {
				"playwright-config-missing": "Diagnóstico: El proyecto usa Playwright o tiene suites E2E pero falta playwright.config.ts.\nRemediación: Ejecuta `auditor fix` para auto-scaffoldear la configuración canónica.",
				"playwright-config-missing-setting": "Diagnóstico: Faltan directivas obligatorias de tiempo de espera o reporte en playwright.config.ts.\nRemediación: Configura `timeout`, `reporter` y `use.trace` en playwright.config.ts o corre `auditor fix`."
			},
			coverage: { include: ["playwright.config.*"] },
			projectRoot,
			fix: optionsObj?.fix,
			...optionsObj
		});
	}
	async runAudit() {
		if (!isPlaywrightProjectContext(this.projectRoot)) {
			this.markSkipped("No se detectó Playwright ni directorio e2e en el proyecto");
			return;
		}
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("playwright-config-missing", () => {
			configFile = this.resolveConfigFile(PLAYWRIGHT_CONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("playwright-config-missing", () => this.ensureConfigFile(PLAYWRIGHT_CONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("playwright-config-missing-setting", "Archivo playwright.config.ts ausente");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || PLAYWRIGHT_CONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.runSubAuditorSync("playwright-config-missing", () => {
				this.addViolation({
					ruleId: "playwright-config-missing",
					severity: "error",
					file: relPath,
					line: 1,
					message: `No se pudo leer ${relPath}.`
				});
			});
			return;
		}
		const sf = parseTsSourceFile(rawContent, relPath);
		const rootObj = findConfigRootObject(sf);
		let modified = false;
		let rootProps = rootObj ? [...rootObj.properties] : [];
		let replaceNpxVite = false;
		const DEFAULT_PLAYWRIGHT_TIMEOUT_MS = 3e4;
		const currentRoot = () => ts.factory.createObjectLiteralExpression(rootProps, true);
		this.runSubAuditorSync("playwright-config-missing-setting", () => {
			if (!(rootObj ? Boolean(findPropertyAssignment(currentRoot(), "timeout", sf)) : false)) {
				if (isFix && rootObj) {
					rootProps.push(ts.factory.createPropertyAssignment("timeout", valueToAstExpression(DEFAULT_PLAYWRIGHT_TIMEOUT_MS)));
					modified = true;
				} else this.addViolation({
					ruleId: "playwright-config-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere configurar \"timeout\" para evitar bloqueos indefinidos en tests E2E."
				});
			}
			if (!(rootObj ? Boolean(findPropertyAssignment(currentRoot(), "reporter", sf)) : false)) {
				if (isFix && rootObj) {
					rootProps.push(ts.factory.createPropertyAssignment("reporter", valueToAstExpression([["html", { open: "never" }], ["list"]])));
					modified = true;
				} else this.addViolation({
					ruleId: "playwright-config-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere configurar \"reporter\" en playwright.config.ts."
				});
			}
			const useProp = rootObj ? findPropertyAssignment(currentRoot(), "use", sf) : null;
			if (!(useProp && ts.isObjectLiteralExpression(useProp.initializer) ? Boolean(findPropertyAssignment(useProp.initializer, "trace", sf)) : false)) {
				if (isFix && rootObj) {
					if (useProp && ts.isObjectLiteralExpression(useProp.initializer)) {
						const nextUseProps = [...useProp.initializer.properties, ts.factory.createPropertyAssignment("trace", valueToAstExpression("on-first-retry"))];
						rootProps = rootProps.map((p) => ts.isPropertyAssignment(p) && getPropertyKeyName(p.name, sf) === "use" ? ts.factory.createPropertyAssignment("use", ts.factory.createObjectLiteralExpression(nextUseProps, true)) : p);
					} else rootProps.push(ts.factory.createPropertyAssignment("use", valueToAstExpression({ trace: "on-first-retry" })));
					modified = true;
				} else this.addViolation({
					ruleId: "playwright-config-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se requiere configurar \"use.trace\" para diagnósticos de fallos en E2E."
				});
			}
			let foundNpxVite = false;
			function scanStrings(node) {
				if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
					if (/\bnpx\s+vite\b/.test(node.text)) foundNpxVite = true;
				}
				ts.forEachChild(node, scanStrings);
			}
			scanStrings(sf);
			if (foundNpxVite) {
				if (isFix) {
					replaceNpxVite = true;
					modified = true;
				} else this.addViolation({
					ruleId: "playwright-config-missing-setting",
					severity: "error",
					file: relPath,
					line: 1,
					message: "Se prohíbe usar \"npx vite\" en webServer.command; utiliza \"vp dev\"."
				});
			}
		});
		if (isFix && modified) {
			if (!rootObj) {
				fs.writeFileSync(resolvedPath, CANONICAL_PLAYWRIGHT_CONFIG_CONTENT, "utf8");
				return;
			}
			const updatedRootObj = ts.factory.createObjectLiteralExpression(rootProps, true);
			const transformer = (context) => {
				const visit = (node) => {
					if (node === rootObj) return ts.visitEachChild(updatedRootObj, visit, context);
					if (replaceNpxVite && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /\bnpx\s+vite\b/.test(node.text)) return ts.factory.createStringLiteral(node.text.replace(/\bnpx\s+vite\b/g, "vp dev"), true);
					return ts.visitEachChild(node, visit, context);
				};
				return (source) => ts.visitNode(source, visit);
			};
			const printed = printTransformedSourceFile(sf, transformer);
			fs.writeFileSync(resolvedPath, printed, "utf8");
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePlaywrightConfigAuditor());
//#endregion
export { CANONICAL_PLAYWRIGHT_CONFIG_CONTENT, CANONICAL_PLAYWRIGHT_CONFIG_LINES, PLAYWRIGHT_CONFIG_REQUIREMENT, PLAYWRIGHT_CONFIG_RULES, ValidatePlaywrightConfigAuditor, isPlaywrightProjectContext };
