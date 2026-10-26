import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { forEachSourceScriptLine, isSameFilePath } from "./refactorFileScanner.js";
import { DomainTypesAuditor } from "../../suites/domain_data/validate_domain_types.js";
import { discoverRecordKeyFindings, injectImportStatement } from "./domainRecordKeyRemediator.js";
import path from "node:path";
import fs from "node:fs";
// src/core/refactor/domainRefactorEngine.ts
/**
* src/core/refactor/domainRefactorEngine.ts
*
* DOMAIN TYPE & BRANDED ID GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
* Provides deterministic discovery, Dirac micro-context extraction,
* and automated plan-based remediation for naked strings, unfrozen catalogs, and unbranded IDs.
*/
const UNFROZEN_ARRAY_REGEX = /^(\s*export\s+const\s+([A-Z0-9_]+)\s*=\s*\[[^\]]+\])\s*;/m;
const UNFROZEN_OBJECT_REGEX = /^(\s*export\s+const\s+([A-Z0-9_]+)\s*=\s*\{[^}]+\})\s*;/m;
const NAKED_PARAM_REGEX = /\b([a-zA-Z0-9_$]*(?:id|type|status|category|mode|kind))\s*:\s*string\b/gi;
const UNBRANDED_ID_REGEX = /^\s*export\s+type\s+([A-Za-z0-9_$]+Id)\s*=\s*string\s*;/m;
var DomainRefactorEngine = class DomainRefactorEngine extends BaseRefactorEngine {
	toolId = "auditor-domain";
	configSectionKey = "domain";
	constructor(auditorOrOptions, _explicitConfig) {
		const auditor = auditorOrOptions instanceof DomainTypesAuditor ? auditorOrOptions : new DomainTypesAuditor({ projectRoot: typeof auditorOrOptions === "string" ? auditorOrOptions : auditorOrOptions?.projectRoot });
		super(auditor);
	}
	discoverInFile(filePath) {
		return DomainRefactorEngine.discoverInFile(filePath);
	}
	createPlan(domainPlanId, domainFindings) {
		const targetFiles = Array.from(new Set(domainFindings.map((f) => f.file)));
		return DomainRefactorEngine.buildDomainHygienePlan(domainPlanId, targetFiles, domainFindings);
	}
	applyPlan(projectRoot, plan) {
		DomainRefactorEngine.applyPlan(projectRoot, plan);
		return { modifiedFiles: plan.targetFiles };
	}
	/**
	* Scans a file to discover domain type hygiene and branded ID opportunities.
	*/
	static discoverInFile(filePath) {
		const findings = [];
		forEachSourceScriptLine(filePath, (line, actualLine) => {
			const unbrandedMatch = UNBRANDED_ID_REGEX.exec(line);
			if (unbrandedMatch) {
				const typeName = unbrandedMatch[1];
				if (typeName && !line.includes("Brand<")) {
					const originalSnippet = unbrandedMatch[0].trim();
					findings.push({
						file: filePath,
						line: actualLine,
						kind: "unbranded-id",
						identifier: typeName,
						originalSnippet,
						suggestedReplacement: `export type ${typeName} = Brand<string, '${typeName}'>;`,
						explanation: `Type alias "${typeName}" is a raw string alias. Use nominal branding (Brand<string, '${typeName}'>) to prevent accidental duck-typing.`
					});
					return;
				}
			}
			if (line.includes("export const ") && !line.includes("as const") && !line.includes("satisfies")) {
				const arrayMatch = UNFROZEN_ARRAY_REGEX.exec(line);
				if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
					const originalSnippet = arrayMatch[0].trim();
					const identifier = arrayMatch[2];
					findings.push({
						file: filePath,
						line: actualLine,
						kind: "unfrozen-catalog",
						identifier,
						originalSnippet,
						suggestedReplacement: `${arrayMatch[1]} as const;`,
						explanation: `Catalog array "${identifier}" is mutable. Append "as const" to freeze literal tuples and derive union types.`
					});
					return;
				}
				const objectMatch = UNFROZEN_OBJECT_REGEX.exec(line);
				if (objectMatch && objectMatch[1] && objectMatch[2]) {
					const originalSnippet = objectMatch[0].trim();
					const identifier = objectMatch[2];
					findings.push({
						file: filePath,
						line: actualLine,
						kind: "unfrozen-catalog",
						identifier,
						originalSnippet,
						suggestedReplacement: `${objectMatch[1]} as const;`,
						explanation: `Catalog dictionary "${identifier}" is mutable. Append "as const" to derive strict key-value domain records.`
					});
					return;
				}
			}
			NAKED_PARAM_REGEX.lastIndex = 0;
			let paramMatch;
			while ((paramMatch = NAKED_PARAM_REGEX.exec(line)) !== null) {
				const fullSnippet = paramMatch[0];
				const paramName = paramMatch[1];
				if (paramName) {
					const suggestedType = paramName.charAt(0).toUpperCase() + paramName.slice(1);
					findings.push({
						file: filePath,
						line: actualLine,
						kind: "naked-string-parameter",
						identifier: paramName,
						originalSnippet: fullSnippet,
						suggestedReplacement: `${paramName}: ${suggestedType}`,
						explanation: `Parameter "${paramName}" is typed as open "string". Use a canonical domain union or Branded ID instead.`
					});
				}
			}
		});
		if (fs.existsSync(filePath)) {
			const sourceText = fs.readFileSync(filePath, "utf-8");
			const recordFindings = discoverRecordKeyFindings(filePath, sourceText);
			for (const r of recordFindings) findings.push({
				file: filePath,
				line: r.line,
				kind: "record-string-key",
				identifier: "Record",
				originalSnippet: r.originalSnippet,
				suggestedReplacement: r.suggestedReplacement,
				explanation: `Prohibited Record with open string key "${r.originalSnippet}". Replace with branded key or DisplayText.`
			});
		}
		return findings;
	}
	static buildDomainHygienePlan(planId, targetFiles, findings) {
		const constAssertions = [];
		const brandWrappers = [];
		const parameterReplacements = [];
		const recordKeyReplacements = [];
		for (const f of findings) if (f.kind === "unfrozen-catalog") constAssertions.push({
			file: f.file,
			line: f.line,
			originalDeclaration: f.originalSnippet,
			replacementDeclaration: f.suggestedReplacement
		});
		else if (f.kind === "unbranded-id") brandWrappers.push({
			file: f.file,
			line: f.line,
			originalTypeDef: f.originalSnippet,
			replacementTypeDef: f.suggestedReplacement
		});
		else if (f.kind === "naked-string-parameter") parameterReplacements.push({
			file: f.file,
			line: f.line,
			originalParameter: f.originalSnippet,
			replacementParameter: f.suggestedReplacement
		});
		else if (f.kind === "record-string-key") recordKeyReplacements.push({
			file: f.file,
			line: f.line,
			originalTypeRef: f.originalSnippet,
			replacementTypeRef: f.suggestedReplacement,
			importToAdd: "import type { DisplayText } from '@francogp/auditor';"
		});
		return {
			version: 1,
			planId,
			targetFiles,
			constAssertions,
			brandWrappers,
			parameterReplacements,
			recordKeyReplacements
		};
	}
	static createPlan(planId, findings) {
		const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
		return DomainRefactorEngine.buildDomainHygienePlan(planId, targetFiles, findings);
	}
	static applySnippetReplacements(content, items, relFile, targetDir) {
		let current = content;
		let count = 0;
		for (const item of items) if (isSameFilePath(item.file, relFile, targetDir) && current.includes(item.original)) {
			current = current.replace(item.original, item.replacement);
			count++;
		}
		return {
			content: current,
			count
		};
	}
	static applyRecordKeyPlanReplacements(content, items, relFile, targetDir) {
		let current = content;
		let count = 0;
		for (const item of items) {
			if (!isSameFilePath(item.file, relFile, targetDir) || !current.includes(item.originalTypeRef)) continue;
			current = current.replace(item.originalTypeRef, item.replacementTypeRef);
			count++;
			if (item.importToAdd && !relFile.endsWith(".d.ts") && !relFile.startsWith("src/")) current = injectImportStatement(current, item.importToAdd, relFile.endsWith(".vue"));
		}
		return {
			content: current,
			count
		};
	}
	/**
	* Deterministically applies a DomainRefactorPlan across target source files.
	*/
	static applyPlan(targetDir, plan) {
		let filesChanged = 0;
		let changesApplied = 0;
		for (const relFile of plan.targetFiles ?? []) {
			const fullPath = path.resolve(targetDir, relFile);
			if (!fs.existsSync(fullPath)) continue;
			const initialContent = fs.readFileSync(fullPath, "utf-8");
			let currentContent = initialContent;
			const constItems = (plan.constAssertions ?? []).map((i) => ({
				file: i.file,
				original: i.originalDeclaration,
				replacement: i.replacementDeclaration
			}));
			const constRes = DomainRefactorEngine.applySnippetReplacements(currentContent, constItems, relFile, targetDir);
			currentContent = constRes.content;
			changesApplied += constRes.count;
			const brandItems = (plan.brandWrappers ?? []).map((i) => ({
				file: i.file,
				original: i.originalTypeDef,
				replacement: i.replacementTypeDef
			}));
			const brandRes = DomainRefactorEngine.applySnippetReplacements(currentContent, brandItems, relFile, targetDir);
			currentContent = brandRes.content;
			changesApplied += brandRes.count;
			const paramItems = (plan.parameterReplacements ?? []).map((i) => ({
				file: i.file,
				original: i.originalParameter,
				replacement: i.replacementParameter
			}));
			const paramRes = DomainRefactorEngine.applySnippetReplacements(currentContent, paramItems, relFile, targetDir);
			currentContent = paramRes.content;
			changesApplied += paramRes.count;
			const recordRes = DomainRefactorEngine.applyRecordKeyPlanReplacements(currentContent, plan.recordKeyReplacements ?? [], relFile, targetDir);
			currentContent = recordRes.content;
			changesApplied += recordRes.count;
			if (currentContent !== initialContent) {
				fs.writeFileSync(fullPath, currentContent, "utf-8");
				filesChanged++;
			}
		}
		return {
			filesChanged,
			changesApplied
		};
	}
};
export { DomainRefactorEngine };
