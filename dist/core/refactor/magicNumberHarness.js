import { parseVueSfc as parseVueSfcBlocks } from "../vueSfcParser.js";
import path from "node:path";
import fs from "node:fs";
import MagicString from "magic-string";
//#region src/core/refactor/magicNumberHarness.ts
/**
* src/core/refactor/magicNumberHarness.ts
*
* CANONICAL POLYGLOT MAGIC LITERAL & DESIGN TOKEN REFACTORING HARNESS
* Applies surgical AST span replacements across TypeScript, Vue SFCs, and SCSS.
* Enforces strict pre-flight constant hygiene to prevent duplicate/bad-name regressions.
*/
const FORBIDDEN_GENERIC_NAMES_LIST = [
	"ID",
	"NAME",
	"TYPE",
	"KEY",
	"INDEX",
	"COUNT",
	"DEFAULT",
	"SIZE",
	"MAX",
	"MIN",
	"VAL",
	"VALUE",
	"ITEM",
	"STATE",
	"MODE",
	"TAG",
	"DATA",
	"INFO",
	"OPTIONS",
	"CONFIG",
	"RESULT",
	"STATUS"
];
var ConstantHygieneGate = class {
	static FORBIDDEN_GENERIC_NAMES = new Set(FORBIDDEN_GENERIC_NAMES_LIST);
	/**
	* Validates proposed constant name against validate_constant_hygiene rules:
	* 1. constant-no-literal-suffix (_100, _500)
	* 2. constant-bad-names (including value in name)
	* 3. generic names ban
	*/
	static validateOrSanitize(name, _value) {
		let clean = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
		clean = clean.replace(/_(\d+)$/, "");
		if (this.FORBIDDEN_GENERIC_NAMES.has(clean) || clean.length < 3) clean = `DOMAIN_${clean}`;
		return clean;
	}
};
var MagicNumberHarness = class {
	static async execute(projectRoot, plan) {
		this.maintainSharedConstants(projectRoot, plan);
		for (const relFile of plan.targetFiles) this.processTargetFile(projectRoot, relFile, plan);
	}
	static maintainSharedConstants(projectRoot, plan) {
		const sharedDecls = plan.declarations.filter((d) => d.targetLocation === "shared-constants-module" && d.destinationFile);
		if (sharedDecls.length === 0) return;
		const destFile = path.resolve(projectRoot, sharedDecls[0].destinationFile);
		fs.mkdirSync(path.dirname(destFile), { recursive: true });
		let currentShared = fs.existsSync(destFile) ? fs.readFileSync(destFile, "utf8") : "";
		for (const d of sharedDecls) {
			const cleanName = ConstantHygieneGate.validateOrSanitize(d.name, d.value);
			if (!currentShared.includes(`export const ${cleanName}`)) currentShared += `\nexport const ${cleanName} = ${typeof d.value === "string" ? `'${d.value}'` : d.value};\n`;
		}
		fs.writeFileSync(destFile, currentShared, "utf8");
	}
	static processTargetFile(projectRoot, relFile, plan) {
		const absPath = path.resolve(projectRoot, relFile);
		if (!fs.existsSync(absPath)) return;
		const rawContent = fs.readFileSync(absPath, "utf8");
		const s = new MagicString(rawContent);
		const replacements = (plan.fileReplacements[relFile] ?? []).slice().sort((a, b) => b.startOffset - a.startOffset);
		for (const r of replacements) s.overwrite(r.startOffset, r.endOffset, r.replacement);
		this.injectLocalDeclarations(s, relFile, rawContent, plan);
		fs.writeFileSync(absPath, s.toString(), "utf8");
	}
	static injectLocalDeclarations(s, relFile, rawContent, plan) {
		const fileDeclarations = plan.declarations.filter((d) => d.targetLocation === "local-file-header");
		if (fileDeclarations.length === 0) return;
		const declText = fileDeclarations.map((d) => {
			return `const ${ConstantHygieneGate.validateOrSanitize(d.name, d.value)} = ${typeof d.value === "string" ? `'${d.value}'` : d.value};`;
		}).join("\n");
		if (relFile.endsWith(".vue")) {
			const { scripts } = parseVueSfcBlocks(rawContent);
			const targetScript = scripts.find((sc) => sc.isSetup) ?? scripts[0];
			if (targetScript) s.appendLeft(targetScript.contentStartIndex, `\n${declText}\n`);
		} else if (relFile.endsWith(".ts") || relFile.endsWith(".tsx") || relFile.endsWith(".js")) s.prepend(`${declText}\n\n`);
	}
};
//#endregion
export { ConstantHygieneGate, FORBIDDEN_GENERIC_NAMES_LIST, MagicNumberHarness };
