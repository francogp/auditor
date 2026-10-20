import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_markdown_syntax.ts
/**
* scripts/auditors/documentation/validate_markdown_syntax.ts
*
* MARKDOWN SYNTAX & NPM SCRIPT SSOT AUDITOR (Node.js 26+ Native)
*
* Enforces documentation hygiene and Single Source of Truth mandates across markdown files:
*   1. NPM Script Exclusivity in Docs (`npm-script-exclusivity-in-docs`):
*      In `.agents/skills/`, `docs/`, and project markdown files, forbids raw script commands
*      like `node scripts/...`, `npx tsx scripts/...`, `node -e "..."`, `python .agents/...`,
*      or `npx vite build` in code blocks. Commands must be declared in package.json and run via
*      `npm run <script>`.
*   2. Markdown Table Preceding Blank Line (`markdown-table-preceding-blank-line`):
*      Ensures all markdown tables are preceded by an empty line so CommonMark and GFM parsers
*      render tables cleanly without merging into preceding paragraphs.
*
* Escape Hatches:
*   `<!-- doc-ok -->`, `<!-- npm-ok -->`, `<!-- table-ok -->`
*
* Usage:
*   npm run validate:markdown-syntax
*/
enableCompileCache();
const MARKDOWN_SYNTAX_RULES = ["npm-script-exclusivity-in-docs", "markdown-table-preceding-blank-line"];
const FORBIDDEN_DOC_COMMAND_REGEX = /\b(?:node\s+scripts\/|npx\s+tsx\s+scripts\/|node\s+-e\s+["']|python\s+\.agents\/|npx\s+vite\s+build\b)/;
const TABLE_SEPARATOR_REGEX = /^\s*\|\s*[:-][-| :]*\|\s*$/;
const TABLE_ROW_REGEX = /^\s*\|.+?\|\s*$/;
function isTablePrecededProperly(prevLine) {
	if (prevLine === "") return true;
	if (prevLine.startsWith("#") || prevLine.startsWith("<!--")) return true;
	return TABLE_ROW_REGEX.test(prevLine);
}
var MarkdownSyntaxAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, () => ["."]);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(MARKDOWN_SYNTAX_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["markdown-table-preceding-blank-line"]),
			fixableRuleIds: ["markdown-table-preceding-blank-line"],
			id: "validate_markdown_syntax",
			name: "Markdown Syntax & NPM Script SSoT Validator",
			description: "Comandos no autorizados o tablas mal formateadas en docs",
			family: "documentation",
			ruleIds: MARKDOWN_SYNTAX_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(MARKDOWN_SYNTAX_RULES, "polish"),
			packageName: "Doc",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📝",
			ruleDescriptions: {
				"npm-script-exclusivity-in-docs": "Comando directo en vez de npm run",
				"markdown-table-preceding-blank-line": "Falta línea en blanco antes de tabla"
			},
			ruleRemediations: {
				"npm-script-exclusivity-in-docs": "📖 GUÍA DE REMEDIACIÓN: npm-script-exclusivity-in-docs\n1. Causa Raíz: La documentación contiene comandos de invocación directa a scripts del proyecto (ej: `node scripts/...`, `./setup.sh`, `bash scripts/...`) en lugar de referenciar el script unificado de NPM/Vite+.\n2. Diagnóstico: Localiza la línea señalada en el documento Markdown.\n3. Solución Canónica: Sustituye la llamada directa por su comando canónico registrado: `npm run <script>` o `vp run <script>`.\n4. Ejemplo:\n   ❌ Incorrecto: ````bash\\nnode scripts/audit.ts\\n````\n   ✅ Correcto:   ````bash\\nnpm run auditor\\n````",
				"markdown-table-preceding-blank-line": "📖 GUÍA DE REMEDIACIÓN: markdown-table-preceding-blank-line\n1. Causa Raíz: Una tabla Markdown comienza inmediatamente después de una línea de texto sin una línea en blanco intermedia, lo que corrompe la interpretación del parser CommonMark/GFM.\n2. Diagnóstico: Ubica la tabla reportada en el archivo Markdown.\n3. Solución Canónica:\n   a) Ejecuta el auto-fix canónico: `npm run auditor:fix` o `auditor fix` para insertar automáticamente la línea en blanco.\n   b) O inserta manualmente una línea vacía justo antes de la fila de encabezados de la tabla (`| col1 | col2 |`).\n4. Ejemplo:\n   ❌ Incorrecto: `Descripción:\\n| Columna 1 | Columna 2 |`\n   ✅ Correcto:   `Descripción:\\n\\n| Columna 1 | Columna 2 |`"
			},
			roots: targetRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".md"]),
			extraIgnorePatterns: [
				"scratch/**",
				"dist/**",
				"dev-dist/**",
				"test-results/**"
			],
			projectRoot: effectiveRoot
		});
	}
	checkNpmScriptViolation(line, trimmed, lineNum, relPath) {
		const match = FORBIDDEN_DOC_COMMAND_REGEX.exec(line);
		if (!match) return;
		this.addViolation({
			ruleId: "npm-script-exclusivity-in-docs",
			severity: "error",
			file: relPath,
			line: lineNum,
			message: `Direct script execution '${match[0].trim()}' in documentation. Mandate requires NPM script Single Source of Truth ('npm run <script>').`,
			context: trimmed
		});
	}
	checkTablePrecedingBlankLine(lines, index, trimmed, relPath) {
		if (index === 0) return false;
		const nextLine = lines[index + 1]?.trim() || "";
		if (!TABLE_ROW_REGEX.test(trimmed) || index + 1 >= lines.length || !TABLE_SEPARATOR_REGEX.test(nextLine)) return false;
		if (!isTablePrecededProperly(lines[index - 1]?.trim() || "")) {
			if (this.isFixActive()) return true;
			this.addViolation({
				ruleId: "markdown-table-preceding-blank-line",
				severity: "warning",
				file: relPath,
				line: index + 1,
				message: "Markdown table header must be preceded by a blank empty line for standard GFM compliance.",
				context: trimmed,
				fixable: true
			});
		}
		return false;
	}
	scanFile(relPath, content) {
		const lines = content.split("\n");
		let inFencedCodeBlock = false;
		const insertBlankBeforeIndices = [];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const trimmed = line.trim();
			if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
				inFencedCodeBlock = !inFencedCodeBlock;
				continue;
			}
			if (this.isLineIgnored(line, [
				"doc-ok",
				"npm-ok",
				"table-ok",
				"markdown-ok"
			])) continue;
			if (inFencedCodeBlock) this.runSubAuditorSync("npm-script-exclusivity-in-docs", () => {
				this.checkNpmScriptViolation(line, trimmed, i + 1, relPath);
			});
			else this.runSubAuditorSync("markdown-table-preceding-blank-line", () => {
				if (this.checkTablePrecedingBlankLine(lines, i, trimmed, relPath)) insertBlankBeforeIndices.push(i);
			});
		}
		if (insertBlankBeforeIndices.length > 0 && this.isFixActive()) {
			const eol = content.includes("\r\n") ? "\r" : "";
			for (const lineIdx of [...insertBlankBeforeIndices].reverse()) lines.splice(lineIdx, 0, eol);
			const targetMarkdownPath = path.join(this.projectRoot, relPath);
			if (fs.existsSync(targetMarkdownPath)) fs.writeFileSync(targetMarkdownPath, lines.join("\n"), "utf-8");
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownSyntaxAuditor());
//#endregion
export { MARKDOWN_SYNTAX_RULES, MarkdownSyntaxAuditor };
