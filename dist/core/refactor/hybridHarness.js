import { parseVueSfc as parseVueSfcBlocks } from "../vueSfcParser.js";
import path from "node:path";
import fs from "node:fs";
import MagicString from "magic-string";
import { Lang, parse } from "@ast-grep/napi";
import { Project } from "ts-morph";
//#region src/core/refactor/hybridHarness.ts
/**
* src/core/refactor/hybridHarness.ts
*
* CANONICAL DETERMINISTIC HYBRID HARNESS (@ast-grep/napi + ts-morph + Vue SFC + MagicString)
* Core automated refactoring engine for duplicate & triplicate remediation in @francogp/auditor.
*/
var HybridHarnessEngine = class HybridHarnessEngine {
	static async execute(projectRoot, plan) {
		const absShared = path.resolve(projectRoot, plan.sharedModulePath);
		fs.mkdirSync(path.dirname(absShared), { recursive: true });
		const tsconfigPath = path.resolve(projectRoot, "tsconfig.json");
		const project = new Project({
			tsConfigFilePath: fs.existsSync(tsconfigPath) ? tsconfigPath : void 0,
			skipAddingFilesFromTsConfig: true
		});
		let sharedFile = project.getSourceFile(absShared);
		if (!sharedFile) {
			const initialShared = fs.existsSync(absShared) ? fs.readFileSync(absShared, "utf8") : "";
			sharedFile = project.createSourceFile(absShared, initialShared, { overwrite: true });
		}
		if (!sharedFile.getFunction(plan.functionName)) sharedFile.addStatements(`\nexport ${plan.sharedFunctionCode}\n`);
		await sharedFile.save();
		for (const relFile of plan.targetFiles) {
			const absFile = path.resolve(projectRoot, relFile);
			if (!fs.existsSync(absFile)) continue;
			const fileContent = fs.readFileSync(absFile, "utf8");
			if (relFile.endsWith(".vue")) {
				const { scripts } = parseVueSfcBlocks(fileContent);
				const scriptBlock = scripts.find((s) => s.isSetup) ?? scripts[0];
				if (!scriptBlock) continue;
				const s = new MagicString(fileContent);
				const scriptText = scriptBlock.content;
				const scriptOffset = scriptBlock.contentStartIndex;
				const updatedScript = this.applyAstGrepPatternRewrite(Lang.TypeScript, scriptText, plan.astPattern, plan.astRewrite);
				s.overwrite(scriptOffset, scriptOffset + scriptText.length, updatedScript);
				const relImport = path.relative(path.dirname(absFile), absShared).replace(/\\/g, "/").replace(/\.ts$/, "");
				const importSpecifier = relImport.startsWith(".") ? relImport : `./${relImport}`;
				if (!updatedScript.includes(`import { ${plan.functionName}`) && !updatedScript.includes(`import ${plan.functionName}`)) s.appendLeft(scriptOffset, `\nimport { ${plan.functionName} } from '${importSpecifier}';\n`);
				fs.writeFileSync(absFile, s.toString(), "utf8");
			} else {
				let sourceFile = project.getSourceFile(absFile);
				if (!sourceFile) sourceFile = project.createSourceFile(absFile, fileContent, { overwrite: true });
				const currentText = sourceFile.getFullText();
				const lang = relFile.endsWith(".tsx") ? Lang.Tsx : Lang.TypeScript;
				const updatedText = this.applyAstGrepPatternRewrite(lang, currentText, plan.astPattern, plan.astRewrite);
				sourceFile.replaceWithText(updatedText);
				const moduleSpecifier = sourceFile.getRelativePathAsModuleSpecifierTo(sharedFile);
				this.ensureNamedImport(sourceFile, moduleSpecifier, plan.functionName);
				try {
					sourceFile.organizeImports();
				} catch {}
				await sourceFile.save();
			}
		}
	}
	static expandMetavariables(rewrite, match) {
		let result = rewrite;
		const matches = rewrite.match(/\$[A-Z0-9_]+/g);
		if (matches) for (const meta of matches) {
			const varName = meta.slice(1);
			const matchedNode = typeof match.getMatch === "function" ? match.getMatch(varName) : null;
			if (matchedNode) result = result.replaceAll(meta, matchedNode.text());
		}
		return result;
	}
	static ensureNamedImport(sourceFile, moduleSpecifier, namedImport) {
		const existing = sourceFile.getImportDeclarations().find((imp) => imp.getModuleSpecifierValue() === moduleSpecifier);
		if (existing) {
			if (!existing.getNamedImports().some((n) => n.getName() === namedImport)) existing.addNamedImport(namedImport);
		} else sourceFile.addImportDeclaration({
			moduleSpecifier,
			namedImports: [namedImport]
		});
	}
	static applyAstGrepPatternRewrite(lang, sourceCode, pattern, rewrite) {
		try {
			const matches = parse(lang, sourceCode).root().findAll(pattern);
			if (matches.length > 0) {
				const edits = matches.map((m) => m.replace(HybridHarnessEngine.expandMetavariables(rewrite, m))).sort((a, b) => b.startPos - a.startPos);
				let updated = sourceCode;
				for (const edit of edits) updated = updated.slice(0, edit.startPos) + edit.insertedText + updated.slice(edit.endPos);
				return updated;
			}
		} catch {}
		return sourceCode.replace(pattern, rewrite);
	}
};
//#endregion
export { HybridHarnessEngine };
