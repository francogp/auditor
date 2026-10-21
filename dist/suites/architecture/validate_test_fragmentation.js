import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { getProcessCliArgs } from "../../core/cli/cittyHarness.js";
import { renderBoxTable } from "../../core/unifiedTheme.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
//#region src/suites/architecture/validate_test_fragmentation.ts
/**
* scripts/auditors/architecture/validate_test_fragmentation.ts
*
* TEST ANTI-FRAGMENTATION & JSDOM GOVERNANCE AUDITOR (Node.js 26+ Native)
*
* Enforces test suite architecture standards across the test suite:
*   - Prevents proliferation of micro-files (< 60 lines or configurable minimum).
*   - Encourages domain-cohesive test suites (300-800 lines) to eliminate
*     Vitest worker thread setup/teardown and module boot overhead.
*   - Detects unnecessary @vitest-environment jsdom annotations on tests that do not
*     mount Vue components or use browser DOM globals, saving ~250ms per suite.
*   - Generates test suite size distribution analytics (summary=true).
*
* Escape Hatches:
*   - Registered in TEST_FRAGMENTATION_WHITELIST (standalone worker wrappers, SFC view mounts).
*   - Line annotation: `// test-fragmentation-ok: <justification>`.
*   - JSDOM annotation: `// jsdom-ok: <justification>`.
*
* Usage:
*   npm run validate:test-fragmentation
*   npm run validate:test-fragmentation:summary
*/
enableCompileCache();
const TEST_FRAGMENTATION_RULES = ["no-fragmented-tests", "unnecessary-jsdom"];
const MIN_TEST_FILE_LINES = 60;
const DISTRIBUTION_SMALL_MAX_LINES = 300;
const DISTRIBUTION_TARGET_MAX_LINES = 800;
const DISTRIBUTION_OVERSIZED_MIN_LINES = 1200;
/**
* Whitelist of legitimately standalone runners, process wrappers, container benchmarks,
* and isolated Vue SFC view mounting specs that are exempt from the 60-line floor.
*/
const TEST_FRAGMENTATION_WHITELIST = /* @__PURE__ */ new Set([]);
var TestFragmentationAuditor = class extends FileScanAuditor {
	minTestLines;
	fragmentationWhitelist;
	distribution = {
		micro: 0,
		small: 0,
		target: 0,
		oversized: 0,
		other: 0,
		totalTestFiles: 0,
		totalTestLines: 0
	};
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => [
			...config.paths.testRoots ?? [],
			...config.paths.integrationRoots ?? [],
			...config.paths.e2eRoots ?? []
		]);
		const config = getAuditConfig(effectiveRoot);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(TEST_FRAGMENTATION_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_test_fragmentation",
			name: "Test Anti-Fragmentation Validator",
			description: "Prevents micro-tests (<60 lines) and unnecessary JSDOM",
			family: "architecture",
			ruleIds: TEST_FRAGMENTATION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TEST_FRAGMENTATION_RULES, "hygiene"),
			packageName: "Tests",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🧪",
			ruleDescriptions: {
				"no-fragmented-tests": "Fragmented test file (<60 lines)",
				"unnecessary-jsdom": "Unnecessary JSDOM without Vue/DOM"
			},
			ruleRemediations: {
				"no-fragmented-tests": "📖 REMEDIATION GUIDE: no-fragmented-tests\n1. Root Cause: Test file has fewer than 60 lines (micro-test). A proliferation of micro-tests fragments the Vitest runner, multiplies module bootstrap overhead, and obscures subsystem cohesion.\n2. Diagnosis: Check the line count of the reported test file.\n3. Canonical Solution:\n   a) Consolidate assertions into the related module test suite (`<module>.test.ts`).\n   b) If testing a standalone behavior, expand test coverage with edge cases, failure modes, and negative assertions.\n   c) If this is an intentionally concise integration or contract test, add to `testFragmentationWhitelist` in `audit.config.ts` or annotate with `// test-ok: <reason>`.\n4. Example / Auto-fix command:\n   ❌ Fragmented: `userHelper.test.ts` with 25 lines and a single trivial assert.\n   ✅ Consolidated: Merged into `userService.test.ts` covering complete lifecycle.",
				"unnecessary-jsdom": "📖 REMEDIATION GUIDE: unnecessary-jsdom\n1. Root Cause: The test file declares `// @vitest-environment jsdom` or runs under JSDOM, but does not interact with the browser DOM, mount Vue components, or access `document`/`window`.\n2. Diagnosis: Inspect the test file to see if it only exercises pure TypeScript/Node.js logic.\n3. Canonical Solution: Remove `// @vitest-environment jsdom` to run under Vitest native `node` environment, speeding execution up to 10x.\n4. Example / Auto-fix command:\n   ❌ Unnecessary: `// @vitest-environment jsdom` in math calculation test.\n   ✅ Optimized:   Removed; executes under native `node` environment."
			},
			roots: targetRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".js"]),
			projectRoot: effectiveRoot
		});
		this.minTestLines = config.paths.minTestFileLines ?? 60;
		const customWhitelist = config.paths.testFragmentationWhitelist ?? [];
		this.fragmentationWhitelist = /* @__PURE__ */ new Set([...TEST_FRAGMENTATION_WHITELIST, ...customWhitelist]);
	}
	getDistribution() {
		return this.distribution;
	}
	scanFile(relPath, content) {
		const normalized = relPath.split(path.sep).join(path.posix.sep);
		if (!normalized.endsWith(".test.ts") && !normalized.endsWith(".spec.ts")) return;
		const lineCount = content.split("\n").length;
		this.distribution.totalTestFiles++;
		this.distribution.totalTestLines += lineCount;
		if (this.minTestLines > 0 && lineCount < this.minTestLines) this.distribution.micro++;
		else if (lineCount < 300) this.distribution.small++;
		else if (lineCount <= 800) this.distribution.target++;
		else if (lineCount > 1200) this.distribution.oversized++;
		else this.distribution.other++;
		this.runSubAuditorSync("no-fragmented-tests", () => {
			this.checkMicroTestFragmentation(normalized, content, lineCount);
		});
		this.runSubAuditorSync("unnecessary-jsdom", () => {
			this.checkUnnecessaryJsdom(normalized, content);
		});
	}
	checkMicroTestFragmentation(relPath, content, lineCount) {
		if (this.minTestLines <= 0 || lineCount >= this.minTestLines) return;
		if (this.fragmentationWhitelist.has(relPath) || TEST_FRAGMENTATION_WHITELIST.has(relPath)) return;
		if (content.includes("test-fragmentation-ok")) return;
		this.addViolation({
			ruleId: "no-fragmented-tests",
			severity: "error",
			file: relPath,
			line: 1,
			message: `Test file is overly fragmented (${lineCount} lines < ${this.minTestLines} line minimum). Consolidate into a domain-cohesive test suite (300-800 lines) or annotate with // test-fragmentation-ok: <justification>.`,
			context: `Lines: ${lineCount}`
		});
	}
	checkUnnecessaryJsdom(relPath, content) {
		const jsdomMatch = /@vitest-environment\s+jsdom/.exec(content);
		if (!jsdomMatch) return;
		if (this.hasEscapeHatch(content, [
			"jsdom-ok",
			"test-ok",
			"test-fragmentation-ok"
		])) return;
		const hasVueMount = /@vue\/test-utils|mount\(|shallowMount\(/.test(content);
		const hasDomGlobals = /\b(?:document\.|window\.|localStorage|sessionStorage|navigator\.|HTMLElement|customElements|MutationObserver|ResizeObserver|IntersectionObserver)\b/.test(content);
		const hasWorkerGlobals = /\bself\.(?:onmessage|postMessage|importScripts)\b/.test(content);
		if (!hasVueMount && !hasDomGlobals && !hasWorkerGlobals) {
			const line = this.getLineNumber(content, jsdomMatch.index);
			this.addViolation({
				ruleId: "unnecessary-jsdom",
				severity: "error",
				file: relPath,
				line,
				message: `Test file unnecessarily requests JSDOM environment without mounting Vue components or using DOM APIs. Remove "@vitest-environment jsdom" to run in native Node environment (~250ms faster), or annotate with // jsdom-ok: <justification>.`,
				context: `@vitest-environment jsdom`
			});
		}
	}
	async runAudit() {
		await super.runAudit();
		this.context.setMetric("Suites Ideales (300-800L)", this.distribution.target);
		this.context.setMetric("Suites Pequeñas (60-299L)", this.distribution.small);
		this.context.setMetric("Micro-suites (<60L)", this.distribution.micro);
		this.context.setMetric("Sobredimensionadas (>1200L)", this.distribution.oversized);
		this.context.setMetric("Total Archivos Test", this.distribution.totalTestFiles);
		this.context.setMetric("Total Líneas Test", this.distribution.totalTestLines);
		if (getProcessCliArgs().some((token) => token.includes("summary=true") || token === "--summary")) this.printDistributionSummary();
	}
	printDistributionSummary() {
		const d = this.distribution;
		const tableStr = renderBoxTable([{
			header: "DISTRIBUCIÓN DE SUITES",
			width: 35,
			key: "category"
		}, {
			header: "CANTIDAD",
			width: 15,
			align: "right",
			key: "count"
		}], [
			{
				category: "Micro-archivos (<60 líns)",
				count: String(d.micro)
			},
			{
				category: "Suites Pequeñas (60-299 líns)",
				count: String(d.small)
			},
			{
				category: "Suites Objetivo (300-800 líns)",
				count: `${d.target} (Ideal)`
			},
			{
				category: "Suites Medias (801-1200 líns)",
				count: String(d.other)
			},
			{
				category: "Sobredimensionadas (>1200 líns)",
				count: String(d.oversized)
			}
		], { footerRows: [{
			category: "Total Archivos de Test",
			count: String(d.totalTestFiles)
		}, {
			category: "Total Líneas de Código Test",
			count: String(d.totalTestLines)
		}] });
		process.stdout.write(`\n${tableStr}\n\n`);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new TestFragmentationAuditor());
//#endregion
export { DISTRIBUTION_OVERSIZED_MIN_LINES, DISTRIBUTION_SMALL_MAX_LINES, DISTRIBUTION_TARGET_MAX_LINES, MIN_TEST_FILE_LINES, TEST_FRAGMENTATION_RULES, TEST_FRAGMENTATION_WHITELIST, TestFragmentationAuditor };
