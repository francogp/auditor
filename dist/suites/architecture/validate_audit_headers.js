import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, CANONICAL_IGNORE_DIRS, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveScannableRoots, isPathIgnored } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_audit_headers.ts
/**
* scripts/auditors/architecture/validate_audit_headers.ts
*
* ILLEGAL AUDIT HEADERS & FILE-LEVEL SUPPRESSIONS AUDITOR (Node.js 26+)
*
* Enforces the project's Absolute Prohibition on File-Level Audit Ignores
* and Zero-Ignore policies across the codebase:
*   - Detects fallow file-level ignore directives.
*   - Detects whole-file eslint-disable blocks.
*   - Detects banned TypeScript compiler bypasses (@ts-nocheck, @ts-ignore, @ts-expect-error).
*   - Detects auditor escape hatches misused as standalone file header comments.
*   - Strictly respects project-level DIRECTORY IGNORES.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_audit_headers.ts
*   npm run validate:audit-headers
*/
enableCompileCache();
const MAX_HEADER_LINES_CHECK = 10;
const HEADER_RULES = [
	"file-level-fallow-ignore",
	"file-level-eslint-disable",
	"banned-ts-suppression",
	"banned-magic-suppression",
	"banned-style-suppression",
	"header-auditor-escape",
	"unjustified-escape-hatch"
];
const FALLOW_IGNORE_FILE_REGEX = /^\s*\/\/\s*fallow-ignore-file\b/i;
const TS_SUPPRESSION_REGEX = /^\s*\/\/\s*@ts-(?:nocheck|ignore|expect-error)\b/i;
const ESLINT_DISABLE_BLOCK_REGEX = /^\s*\/\*\s*(?:eslint|oxlint)-disable\b(?!\s*-(?:next-line|line)\b)/i;
const ESLINT_DISABLE_TEMPLATE_REGEX = /^\s*<!--\s*(?:eslint|oxlint)-disable\b(?!\s*-(?:next-line|line)\b)/i;
const BANNED_MAGIC_SUPPRESSION_REGEX = /\/\/\s*(?:no-magic|magic-ok|number-ok)\b/i;
const BANNED_STYLE_SUPPRESSION_REGEX = /\/\/\s*(?:style-inherited|style-ok)\b/i;
const STANDALONE_ESCAPE_HATCHES_REGEX = /^\s*\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok)\s*$/i;
const UNJUSTIFIED_ESCAPE_HATCH_REGEX = /\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok|uuid-ok|infra-id-ok|spanish-ok|open-record|runtime-set|runtime-map|lib-duplicate-ok|fallback-ok)\b(?!\s*:\s*\S)/i;
function checkLineForIllegalHeaders(filePath, rawLine, lineNum) {
	const trimmed = rawLine.trim();
	if (FALLOW_IGNORE_FILE_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "file-level-fallow-ignore",
		message: `Illegal 'fallow-ignore-file' header detected. Silencing audits for entire files is STRICTLY PROHIBITED. Resolve the issue in source code or exclude the directory in global configuration.`,
		context: trimmed,
		severity: "error"
	};
	if (TS_SUPPRESSION_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "banned-ts-suppression",
		message: `TypeScript suppression detected ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibited under Zero-Ignore policy.`,
		context: trimmed,
		severity: "error"
	};
	if (ESLINT_DISABLE_BLOCK_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "file-level-eslint-disable",
		message: `File-level '/* eslint-disable */' or '/* oxlint-disable */' block detected. Use line-scoped directives only when strictly justified.`,
		context: trimmed,
		severity: "error"
	};
	if (ESLINT_DISABLE_TEMPLATE_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "file-level-eslint-disable",
		message: `Template-level '<!-- eslint-disable -->' or '<!-- oxlint-disable -->' directive detected. Avoid disabling rules across entire templates.`,
		context: trimmed,
		severity: "error"
	};
	const bannedMagicMatch = rawLine.match(BANNED_MAGIC_SUPPRESSION_REGEX);
	if (bannedMagicMatch) return {
		file: filePath,
		line: lineNum,
		ruleId: "banned-magic-suppression",
		message: `Banned escape directive '// ${bannedMagicMatch[1]}' detected. The Zero Magic Numbers policy requires declaring descriptive constants ('as const') without exceptions.`,
		context: trimmed,
		severity: "error"
	};
	const bannedStyleMatch = rawLine.match(BANNED_STYLE_SUPPRESSION_REGEX);
	if (bannedStyleMatch) return {
		file: filePath,
		line: lineNum,
		ruleId: "banned-style-suppression",
		message: `Banned escape directive '// ${bannedStyleMatch[1]}' detected. Vue 3 scoped styles do not penetrate child components; simulated style inheritance comments are prohibited. Each component with classes must declare or link its styles explicitly.`,
		context: trimmed,
		severity: "error"
	};
	if (lineNum <= 10 && STANDALONE_ESCAPE_HATCHES_REGEX.test(rawLine)) return {
		file: filePath,
		line: lineNum,
		ruleId: "header-auditor-escape",
		message: `Misplaced escape hatch '${trimmed}' used as file header. Escape annotations must only be added directly on active code statements.`,
		context: trimmed,
		severity: "error"
	};
	const unjustifiedMatch = rawLine.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
	if (unjustifiedMatch) return {
		file: filePath,
		line: lineNum,
		ruleId: "unjustified-escape-hatch",
		message: `[JUSTIFIED ESCAPES & IGNORES GUIDE] Escape hatch '// ${unjustifiedMatch[1]}' missing mandatory technical justification.
   📚 CANONICAL FORMAT REQUIRED: '// ${unjustifiedMatch[1]}: <detailed technical reason>'
   💡 VALID EXAMPLES:
      - // domain-ok: Dynamic UI text, chat messages, or narrative strings
      - // uuid-ok: Database UUID or unique session identifier
      - // infra-id-ok: DOM element identifier or network socket ID
      - // open-record: Dynamic JSON key-value dictionary
      - // runtime-set: Fast O(1) set for identifier validation
      - // spanish-ok: User-facing UI label in Spanish
   ⚠️ PROHIBITION: Never use generic ignores or use escapes to mask type errors in domain entities.`,
		context: trimmed,
		severity: "error"
	};
	return null;
}
/**
* Scans file contents for illegal suppression headers or file-level ignores.
*/
function scanFileForIllegalHeaders(filePath, content) {
	const violations = [];
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const violation = checkLineForIllegalHeaders(filePath, lines[i], i + 1);
		if (violation) violations.push(violation);
	}
	return violations;
}
/**
* Object-oriented FileScanAuditor implementation for Illegal Audit Headers.
*/
var AuditHeadersAuditor = class extends FileScanAuditor {
	collectedViolations = [];
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const headerRoots = options.roots ?? getEffectiveScannableRoots(getAuditConfig(projectRoot));
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			roots: headerRoots,
			projectRoot,
			ruleCapabilities: createRuleCapabilities(HEADER_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_audit_headers",
			name: "Audit Headers & Suppression Validator",
			description: "Prohibits file-level suppressions and global ignores",
			family: "architecture",
			ruleIds: HEADER_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(HEADER_RULES, "polish"),
			packageName: "Header",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "📰",
			ruleDescriptions: {
				"file-level-fallow-ignore": "Prohibited file fallow-ignore",
				"file-level-eslint-disable": "Prohibited global eslint-disable",
				"banned-ts-suppression": "Prohibited @ts-ignore/@ts-nocheck",
				"banned-magic-suppression": "Prohibited magic number suppression",
				"banned-style-suppression": "Prohibited style suppression",
				"header-auditor-escape": "Misplaced escape hatch",
				"unjustified-escape-hatch": "Unjustified escape hatch"
			},
			ruleRemediations: {
				"file-level-fallow-ignore": "📖 REMEDIATION GUIDE: file-level-fallow-ignore\n1. Root Cause: A global suppression directive /* fallow-ignore-file */ was found in the file header, masking technical debt or dead code across the whole module.\n2. Diagnosis: Look for comments at the beginning of the file containing fallow-ignore-file.\n3. Canonical Solution: Remove the global directive. If a justified exception exists, scope it to the specific line or refactor the code legitimately.\n4. Example / Auto-fix command:\n   ❌ Banned:  /* fallow-ignore-file */\n   ✅ Clean:   Resolve violations or scope with technical justification.",
				"file-level-eslint-disable": "📖 REMEDIATION GUIDE: file-level-eslint-disable\n1. Root Cause: An un-scoped /* eslint-disable */ or /* oxlint-disable */ directive was declared for the entire file or template.\n2. Diagnosis: Check the top of the file for global linter disable comments.\n3. Canonical Solution: Remove the global directive. Fix the lint issues or disable only the specific rule on the exact line using // eslint-disable-next-line <rule> -- <reason>.\n4. Example / Auto-fix command:\n   ❌ Banned:  /* eslint-disable */\n   ✅ Scoped:  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Interop with untyped 3rd-party library",
				"banned-ts-suppression": "📖 REMEDIATION GUIDE: banned-ts-suppression\n1. Root Cause: Blind suppression directives (@ts-ignore or @ts-nocheck) were used, destroying type safety.\n2. Diagnosis: Search for @ts-ignore or @ts-nocheck in the source file.\n3. Canonical Solution: Correct the types in interfaces or functions. If an external untyped library causes an unavoidable type error, use @ts-expect-error with a mandatory explanation.\n4. Example / Auto-fix command:\n   ❌ Banned:  // @ts-ignore\n   ✅ Scoped:  // @ts-expect-error - External library emits incorrect types in v1.2",
				"banned-magic-suppression": "📖 REMEDIATION GUIDE: banned-magic-suppression\n1. Root Cause: An attempt was made to suppress magic number auditing through non-canonical comments or file headers.\n2. Diagnosis: Check for comments attempting to disable the magic numbers rule.\n3. Canonical Solution: Extract numeric values into semantic constants or import them from design tokens.\n4. Example / Auto-fix command:\n   ❌ Banned:  // magic-ok\n   ✅ Clean:   export const NETWORK_RETRY_DELAY_MS = 5000;",
				"banned-style-suppression": "📖 REMEDIATION GUIDE: banned-style-suppression\n1. Root Cause: A global stylelint-disable suppression was detected in the file header or style block.\n2. Diagnosis: Inspect stylelint-disable directives in .css, .scss, or Vue <style> blocks.\n3. Canonical Solution: Fix CSS properties, nesting, or z-index values according to design guidelines. Do not disable Stylelint for entire files.\n4. Example / Auto-fix command:\n   Use system z-index variables or correct the selector.",
				"header-auditor-escape": "📖 REMEDIATION GUIDE: header-auditor-escape\n1. Root Cause: An auditor escape hatch was placed in the file header instead of directly on the affected code line.\n2. Diagnosis: Check for comments like // layout-ok: in file headers or imports.\n3. Canonical Solution: Move the escape hatch immediately before the statement requiring it, or remove it if no longer needed.\n4. Example / Auto-fix command:\n   Place the comment directly before the code line: // layout-ok: <justification>",
				"unjustified-escape-hatch": "📖 REMEDIATION GUIDE: unjustified-escape-hatch\n1. Root Cause: An escape hatch was used without the required technical justification after a colon.\n2. Diagnosis: Identify exception comments that lack an explanation (// layout-ok: <explanation>).\n3. Canonical Solution: Add a clear technical reason explaining the architectural necessity for the escape.\n4. Example / Auto-fix command:\n   ❌ Banned:  // layout-ok\n   ✅ Valid:   // layout-ok: Container width animation required by non-transformable responsive layout"
			}
		});
	}
	getViolations() {
		return this.collectedViolations;
	}
	scanFile(relPath, content) {
		const lines = content.split(/\r?\n/);
		this.runSubAuditorSync("file-level-fallow-ignore", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (FALLOW_IGNORE_FILE_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "file-level-fallow-ignore",
						message: `Illegal 'fallow-ignore-file' header detected. Silencing audits for entire files is STRICTLY PROHIBITED. Resolve the issue in source code or exclude the directory in global configuration.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("banned-ts-suppression", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (TS_SUPPRESSION_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "banned-ts-suppression",
						message: `TypeScript suppression detected ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibited under Zero-Ignore policy.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("file-level-eslint-disable", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (ESLINT_DISABLE_BLOCK_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "file-level-eslint-disable",
						message: `File-level '/* eslint-disable */' or '/* oxlint-disable */' block detected. Use line-scoped directives only when strictly justified.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				} else if (ESLINT_DISABLE_TEMPLATE_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "file-level-eslint-disable",
						message: `Template-level '<!-- eslint-disable -->' or '<!-- oxlint-disable -->' directive detected. Avoid disabling rules across entire templates.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("banned-magic-suppression", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (BANNED_MAGIC_SUPPRESSION_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "banned-magic-suppression",
						message: `Banned magic number suppression detected ('/' + '/ no-magic', '/' + '/ magic-ok', '/' + '/ number-ok'). Centralize numbers into domain constants with 'as const' or explicit typing.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("banned-style-suppression", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (BANNED_STYLE_SUPPRESSION_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "banned-style-suppression",
						message: `Banned style suppression detected ('/' + '/ style-inherited', '/' + '/ style-ok'). All .vue components MUST include their own <style lang="scss"> block per architecture governance.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("header-auditor-escape", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (STANDALONE_ESCAPE_HATCHES_REGEX.test(line)) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "header-auditor-escape",
						message: `Orphan or misplaced escape hatch detected ('${line.trim()}'). Escape hatches must be on the same statement line or immediately preceding with ':' and the technical reason.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
		this.runSubAuditorSync("unjustified-escape-hatch", () => {
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const unjustifiedMatch = line.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
				if (unjustifiedMatch) {
					const v = {
						file: relPath,
						line: i + 1,
						ruleId: "unjustified-escape-hatch",
						message: `[JUSTIFIED ESCAPES & IGNORES GUIDE] Escape hatch '// ${unjustifiedMatch[1]}' missing mandatory technical justification.
    📚 CANONICAL FORMAT REQUIRED: '// ${unjustifiedMatch[1]}: <detailed technical reason>'
    ⚠️ PROHIBITION: Never use generic ignores or use escapes to mask type errors in domain entities.`,
						context: line.trim(),
						severity: "error"
					};
					this.collectedViolations.push(v);
					this.addViolation(v);
				}
			}
		});
	}
};
/**
* Legacy procedural audit runner preserved for testing and external consumers.
*/
function auditAuditHeaders(targetDir = process.cwd()) {
	const config = getAuditConfig(targetDir);
	const rootsToScan = getEffectiveScannableRoots(config).filter((r) => fs.existsSync(path.resolve(targetDir, r)));
	const auditor = new AuditHeadersAuditor({
		projectRoot: targetDir,
		roots: rootsToScan
	});
	const files = auditor["context"].collectFiles(rootsToScan);
	for (const file of files) {
		const relPath = path.relative(targetDir, file).split(path.sep).join(path.posix.sep);
		try {
			const content = fs.readFileSync(file, "utf-8");
			auditor["recordScanned"](relPath);
			auditor["scanFile"](relPath, content);
		} catch {}
	}
	const violations = auditor.getViolations();
	const countsByRule = {};
	for (const r of HEADER_RULES) countsByRule[r] = auditor.getCountsByRule().get(r) ?? 0;
	return {
		filesScanned: auditor.getFilesScanned(),
		violations,
		passed: violations.length === 0,
		countsByRule
	};
}
await BaseAuditor.runCliIfMain(import.meta.url, new AuditHeadersAuditor());
//#endregion
export { AuditHeadersAuditor, CANONICAL_IGNORE_DIRS, HEADER_RULES, MAX_HEADER_LINES_CHECK, auditAuditHeaders, isPathIgnored, scanFileForIllegalHeaders };
