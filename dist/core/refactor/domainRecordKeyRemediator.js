import { createUnifiedAstSourceFile } from "../astScriptExtractor.js";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
// src/core/refactor/domainRecordKeyRemediator.ts
/**
* src/core/refactor/domainRecordKeyRemediator.ts
*
* CANONICAL DOMAIN RECORD KEY REMEDIATOR (Node.js 26+ Native)
* Provides standalone AST discovery and deterministic remediation for prohibited open Record<string, T>
* contracts, transforming them to nominal domain keys or DisplayText primitives.
*/
/**
* Discovers Record<string, T> and Record<PropertyKey, T> declarations via TypeScript AST.
*/
function discoverRecordKeyFindings(filePath, sourceText) {
	const { sourceFile } = createUnifiedAstSourceFile(filePath, sourceText);
	const findings = [];
	function visitRecord(node) {
		if (ts.isTypeReferenceNode(node)) {
			if (node.typeName.getText(sourceFile) === "Record") {
				const typeArgs = node.typeArguments;
				if (typeArgs && typeArgs.length >= 2) {
					const firstArg = typeArgs[0];
					const secondArg = typeArgs[1];
					const firstArgText = firstArg.getText(sourceFile);
					const secondArgKind = secondArg.kind;
					if ((firstArg.kind === ts.SyntaxKind.StringKeyword || firstArgText === "PropertyKey") && secondArgKind !== ts.SyntaxKind.UnknownKeyword && secondArgKind !== ts.SyntaxKind.AnyKeyword) {
						const startPos = node.getStart(sourceFile);
						const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
						const originalSnippet = node.getText(sourceFile);
						const suggestedReplacement = `Record<DisplayText, ${secondArg.getText(sourceFile)}>`;
						findings.push({
							filePath,
							line,
							originalSnippet,
							suggestedReplacement
						});
					}
				}
			}
		}
		ts.forEachChild(node, visitRecord);
	}
	visitRecord(sourceFile);
	return findings;
}
/**
* Safely injects an import statement into source code, handling Vue SFC, shebangs, and TS files.
*/
function injectImportStatement(content, importToAdd, isVue) {
	if (content.includes(importToAdd)) return content;
	if (isVue) {
		const scriptMatch = content.match(/<script\b[^>]*>/);
		if (scriptMatch && scriptMatch.index !== void 0) {
			const insertPos = scriptMatch.index + scriptMatch[0].length;
			return content.slice(0, insertPos) + `\n${importToAdd}` + content.slice(insertPos);
		}
		return content;
	}
	if (content.startsWith("#!")) {
		const newlineIdx = content.indexOf("\n");
		return `${content.slice(0, newlineIdx + 1)}${importToAdd}\n${content.slice(newlineIdx + 1)}`;
	}
	return `${importToAdd}\n${content}`;
}
/**
* Remediates Record<string, T> occurrences in a target contract file.
*/
function remediateRecordKeysInFile(fullPath, projectRoot) {
	if (!fs.existsSync(fullPath)) return {
		changed: false,
		replacementCount: 0
	};
	const content = fs.readFileSync(fullPath, "utf-8");
	const findings = discoverRecordKeyFindings(fullPath, content);
	if (findings.length === 0) return {
		changed: false,
		replacementCount: 0
	};
	let currentContent = content;
	let count = 0;
	for (const f of findings) if (currentContent.includes(f.originalSnippet)) {
		currentContent = currentContent.replace(f.originalSnippet, f.suggestedReplacement);
		count++;
	}
	const isVue = fullPath.endsWith(".vue");
	const isDts = fullPath.endsWith(".d.ts");
	const relPath = path.relative(projectRoot, fullPath).replaceAll(path.win32.sep, path.posix.sep);
	if (count > 0 && !isDts && !relPath.startsWith("src/")) currentContent = injectImportStatement(currentContent, "import type { DisplayText } from '@francogp/auditor';", isVue);
	if (currentContent !== content) {
		fs.writeFileSync(fullPath, currentContent, "utf-8");
		return {
			changed: true,
			replacementCount: count
		};
	}
	return {
		changed: false,
		replacementCount: 0
	};
}
export { discoverRecordKeyFindings, injectImportStatement, remediateRecordKeysInFile };
