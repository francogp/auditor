import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { JSDOM } from "jsdom";
//#region src/suites/documentation/validate_mermaid_syntax.ts
/**
* @file validate_mermaid_syntax.ts
* @description Sub-auditor that validates syntax and escapes in Mermaid diagrams within Markdown files
* using the official modern Mermaid engine (mermaid.parse).
*/
enableCompileCache();
if (typeof globalThis.window === "undefined") {
	const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
	Reflect.set(globalThis, "window", dom.window);
	Reflect.set(globalThis, "document", dom.window.document);
}
const mermaid = (await import("mermaid")).default;
mermaid.initialize({
	startOnLoad: false,
	suppressErrorRendering: true
});
const MERMAID_SYNTAX_RULES = ["mermaid-syntax-error", "mermaid-unquoted-special-chars"];
/**
* Validates syntax of a Mermaid diagram block using the official Mermaid parser.
*/
async function validateMermaid(diagramCode) {
	if (!diagramCode || typeof diagramCode !== "string" || diagramCode.trim().length === 0) return {
		valid: false,
		error: {
			line: 1,
			message: "El diagrama Mermaid está vacío o no contiene código"
		}
	};
	try {
		const parseResult = await mermaid.parse(diagramCode);
		return {
			valid: true,
			diagramType: typeof parseResult === "object" && parseResult !== null && "diagramType" in parseResult ? String(parseResult.diagramType) : "unknown"
		};
	} catch (err) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		const lineMatch = rawMessage.match(/line\s+(\d+)/i);
		return {
			valid: false,
			error: {
				line: lineMatch ? Number.parseInt(lineMatch[1] ?? "1", 10) : 1,
				message: rawMessage
			}
		};
	}
}
/**
* Validates diagram and returns or throws an Error (for backward compatibility).
*/
async function validate(diagramCode, parseOptions) {
	const result = await validateMermaid(diagramCode);
	if (!result.valid && result.error) {
		if (parseOptions?.suppressErrors) return false;
		throw new Error(`Parse error on line ${result.error.line}: ${result.error.message}`);
	}
	return {
		diagramType: result.diagramType ?? "unknown",
		valid: true
	};
}
const UNQUOTED_EDGE_CHARS_REGEX = /[%&<>\u2260\u2265\u2264()/?!+:=#*~]/;
const UNQUOTED_EDGE_LABEL_REGEX = /\|([^|"\n]+)\|/g;
const UNQUOTED_SQUARE_NODE_REGEX = /\b\w+\[([^\]"()\n]*[()][^\]"\n]*)\]/g;
const UNQUOTED_BRACE_NODE_REGEX = /\b\w+\{([^}"\n?%&<>\u2260\u2265\u2264()/:!+=\\#*~]*[?%&<>\u2260\u2265\u2264()/:!+=\\#*~][^}"\n]*)\}/g;
var ValidateMermaidSyntaxAuditor = class extends FileScanAuditor {
	constructor(roots = ["."], projectRoot) {
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(MERMAID_SYNTAX_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["mermaid-unquoted-special-chars"]),
			fixableRuleIds: ["mermaid-unquoted-special-chars"],
			id: "validate_mermaid_syntax",
			name: "Mermaid Diagram Syntax Auditor",
			description: "Sintaxis y caracteres válidos en diagramas Mermaid",
			family: "documentation",
			packageName: "Doc",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📊",
			ruleIds: MERMAID_SYNTAX_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(MERMAID_SYNTAX_RULES, "polish"),
			ruleDescriptions: {
				"mermaid-syntax-error": "Error sintáctico en diagrama Mermaid",
				"mermaid-unquoted-special-chars": "Caracter especial sin comillas en Mermaid"
			},
			ruleRemediations: {
				"mermaid-syntax-error": "Guía de diagnóstico y remediación para mermaid-syntax-error. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"mermaid-unquoted-special-chars": "Guía de diagnóstico y remediación para mermaid-unquoted-special-chars. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			roots,
			allowedExtensions: /* @__PURE__ */ new Set([".md"]),
			unignoreDirs: [
				".agents",
				"skills",
				"docs"
			],
			extraIgnorePatterns: [
				"scratch/**",
				"dist/**",
				"dev-dist/**",
				"test-results/**"
			],
			projectRoot
		});
	}
	fixMermaidLine(line) {
		let fixed = line;
		fixed = fixed.replace(/\|([^|"\n]+)\|/g, (match, text) => {
			const trimmed = text.trim();
			if (UNQUOTED_EDGE_CHARS_REGEX.test(trimmed)) return `|"${trimmed}"|`;
			return match;
		});
		fixed = fixed.replace(/\b(\w+)\[([^\]"()\n]*[()][^\]"\n]*)\]/g, (_match, id, label) => {
			return `${id}["${label.trim()}"]`;
		});
		fixed = fixed.replace(/\b(\w+)\{([^}"\n?%&<>\u2260\u2265\u2264()/:!+=\\#*~]*[?%&<>\u2260\u2265\u2264()/:!+=\\#*~][^}"\n]*)\}/g, (_match, id, label) => {
			return `${id}{"${label.trim()}"}`;
		});
		return fixed;
	}
	checkSpecialCharacters(line, lineNum, relPath) {
		const edgeMatches = line.matchAll(UNQUOTED_EDGE_LABEL_REGEX);
		for (const match of edgeMatches) {
			const text = match[1]?.trim() ?? "";
			if (UNQUOTED_EDGE_CHARS_REGEX.test(text)) this.addViolation({
				ruleId: "mermaid-unquoted-special-chars",
				severity: "error",
				file: relPath,
				line: lineNum,
				context: match[0],
				message: `Etiqueta de arista Mermaid contiene caracteres especiales no entrecomillados ("${text}"). Envuélvela en comillas: |"${text}"|.`,
				fixable: true
			});
		}
		const squareMatches = line.matchAll(UNQUOTED_SQUARE_NODE_REGEX);
		for (const match of squareMatches) {
			const label = match[1]?.trim() ?? "";
			this.addViolation({
				ruleId: "mermaid-unquoted-special-chars",
				severity: "error",
				file: relPath,
				line: lineNum,
				context: match[0],
				message: `Definición de nodo con paréntesis no entrecomillados ("${label}"). Envuélvela en comillas dobles: ["${label}"].`,
				fixable: true
			});
		}
		const braceMatches = line.matchAll(UNQUOTED_BRACE_NODE_REGEX);
		for (const match of braceMatches) {
			const label = match[1]?.trim() ?? "";
			this.addViolation({
				ruleId: "mermaid-unquoted-special-chars",
				severity: "error",
				file: relPath,
				line: lineNum,
				context: match[0],
				message: `Definición de rombo/decisión con caracteres especiales no entrecomillados ("${label}"). Envuélvela en comillas dobles: {"${label}"}.`,
				fixable: true
			});
		}
	}
	async validateDiagramBlock(relPath, diagramCode, mermaidStartLine) {
		if (!diagramCode) return;
		await this.runSubAuditor("mermaid-syntax-error", async () => {
			const validation = await validateMermaid(diagramCode);
			if (!validation.valid && validation.error) {
				const errorLine = mermaidStartLine + Math.max(0, validation.error.line - 1);
				this.addViolation({
					ruleId: "mermaid-syntax-error",
					severity: "error",
					file: relPath,
					line: errorLine,
					context: validation.error.message.slice(0, 100),
					message: `Error de sintaxis en diagrama Mermaid: ${validation.error.message}`
				});
			}
		});
	}
	processMermaidContentLine(line, lineIndex, relPath, isFix) {
		if (this.isLineIgnored(line, ["mermaid-ok", "doc-ok"])) return {
			fixedLine: null,
			isIgnored: true
		};
		let fixedLine = null;
		if (isFix) {
			const fixed = this.fixMermaidLine(line);
			if (fixed !== line) fixedLine = fixed;
		}
		const lineToCheck = fixedLine ?? line;
		this.runSubAuditorSync("mermaid-unquoted-special-chars", () => {
			this.checkSpecialCharacters(lineToCheck, lineIndex + 1, relPath);
		});
		return {
			fixedLine,
			isIgnored: false
		};
	}
	async scanFile(relPath, content) {
		const lines = content.split("\n");
		let inMermaid = false;
		let diagramIgnored = false;
		let mermaidStartLine = 0;
		const mermaidLines = [];
		let fileModified = false;
		const isFix = this.isFixActive();
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			const trimmed = line.trim();
			if (trimmed.startsWith("```mermaid")) {
				inMermaid = true;
				diagramIgnored = this.isLineIgnored(line, ["mermaid-ok", "doc-ok"]);
				mermaidStartLine = i + 1;
				mermaidLines.length = 0;
				continue;
			}
			if (inMermaid && trimmed.startsWith("```")) {
				inMermaid = false;
				if (!diagramIgnored) {
					const diagramCode = mermaidLines.map((l) => l.replace(/<!--[\s\S]*?-->/g, "").trimEnd()).join("\n").trim();
					await this.validateDiagramBlock(relPath, diagramCode, mermaidStartLine);
				}
				continue;
			}
			if (inMermaid) {
				const result = this.processMermaidContentLine(line, i, relPath, isFix);
				if (result.isIgnored) diagramIgnored = true;
				else if (result.fixedLine !== null) {
					lines[i] = result.fixedLine;
					fileModified = true;
					mermaidLines.push(result.fixedLine);
				} else mermaidLines.push(line);
			}
		}
		if (isFix && fileModified) {
			const absPath = path.resolve(this.projectRoot, relPath);
			if (fs.existsSync(absPath)) fs.writeFileSync(absPath, lines.join("\n"), "utf-8");
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMermaidSyntaxAuditor());
//#endregion
export { MERMAID_SYNTAX_RULES, ValidateMermaidSyntaxAuditor, validate, validateMermaid };
