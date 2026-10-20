import { toPosixRelative } from "../auditCoverage.js";
import "../safePath.js";
import { resolveFallowBinary } from "../../suites/architecture/validate_similar_code.js";
import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { FallowArchitectureAuditor } from "../../suites/architecture/validate_fallow.js";
import { HybridHarnessEngine } from "./hybridHarness.js";
import path from "node:path";
import { execSync } from "node:child_process";
//#region src/core/refactor/dupesRefactorEngine.ts
/**
* src/core/refactor/dupesRefactorEngine.ts
*
* CANONICAL DUPLICATION & CLONE REFACTORING ENGINE (Node.js 26+ Native)
* Provides deterministic clone triage, Dirac micro-context extraction,
* and automated plan-based remediation for duplicate and triplicate code.
*
* Inherits directly from BaseRefactorEngine with strict FallowArchitectureAuditor injection.
*/
function runFallowJson(cmd, args, projectRoot) {
	const fullCmd = `node "${resolveFallowBinary(projectRoot) ?? path.resolve(process.cwd(), "node_modules/fallow/bin/fallow")}" ${cmd} --root "${projectRoot}" ${args.join(" ")} --format json --quiet`;
	try {
		const stdout = execSync(fullCmd, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			maxBuffer: 52428800
		});
		return JSON.parse(stdout);
	} catch (err) {
		const out = err.stdout;
		if (out && out.trim().startsWith("{")) return JSON.parse(out);
		throw new Error(`Failed to execute fallow ${cmd}: ${err.message}`);
	}
}
function determineTopology(files) {
	const isSingle = files.length === 1;
	const hasVue = files.some((f) => f.endsWith(".vue"));
	if (isSingle) return hasVue ? "intra-file-vue" : "intra-file-ts";
	return hasVue ? "cross-file-vue-ts" : "cross-file-ts";
}
var DupesRefactorEngine = class extends BaseRefactorEngine {
	toolId = "auditor-dupes";
	configSectionKey = "fallow";
	constructor(auditorOrOptions, _explicitConfig) {
		const auditor = auditorOrOptions instanceof FallowArchitectureAuditor ? auditorOrOptions : new FallowArchitectureAuditor({ projectRoot: typeof auditorOrOptions === "string" ? auditorOrOptions : auditorOrOptions?.projectRoot ?? process.cwd() });
		super(auditor);
	}
	discoverInFile(filePath) {
		const all = this.triageCandidates();
		const relNorm = toPosixRelative(this.projectRoot, filePath);
		return all.filter((c) => c.files.some((f) => toPosixRelative(this.projectRoot, f) === relNorm));
	}
	createPlan(id, findings) {
		return {
			version: 1,
			planId: id,
			action: "extract-shared-function",
			targetFiles: Array.from(new Set(findings.flatMap((f) => f.files))),
			sharedModulePath: "src/shared/extractedFunctions.ts",
			fingerprint: findings[0]?.fingerprint ?? "unknown",
			functionName: findings[0]?.suggestedName ?? "extractedHelper",
			parameters: [],
			returnType: "void",
			sharedFunctionCode: "// Extracted helper body",
			astPattern: "",
			astRewrite: ""
		};
	}
	async applyPlan(projectRoot, plan) {
		await HybridHarnessEngine.execute(projectRoot, plan);
		return { modifiedFiles: plan.targetFiles };
	}
	/**
	* Discovers and triages clone groups from Fallow, strictly filtering
	* instances through the canonical sub-auditor path resolution.
	*/
	triageCandidates(minOccurrences = 2) {
		const dupes = runFallowJson("dupes", ["--min-occurrences", String(minOccurrences)], this.projectRoot);
		let deadFiles = /* @__PURE__ */ new Set();
		try {
			const dead = runFallowJson("dead-code", ["--include-dupes"], this.projectRoot);
			deadFiles = new Set(dead.unused_files.map((f) => toPosixRelative(this.projectRoot, f.path)));
		} catch {}
		const effectiveMin = Math.max(2, minOccurrences);
		const candidates = [];
		for (const g of dupes.clone_groups) {
			const validInstances = g.instances.filter((i) => {
				const rel = toPosixRelative(this.projectRoot, i.file);
				return this.isPathScannable(rel);
			});
			if (validInstances.length < effectiveMin) continue;
			const files = Array.from(new Set(validInstances.map((i) => toPosixRelative(this.projectRoot, i.file))));
			const topology = determineTopology(files);
			const isDead = files.some((f) => deadFiles.has(toPosixRelative(this.projectRoot, f)));
			candidates.push({
				fingerprint: g.fingerprint,
				topology,
				tokenCount: g.token_count,
				lineCount: g.line_count,
				occurrenceCount: validInstances.length,
				spread: g.spread ?? 0,
				files,
				instances: validInstances,
				suggestedName: g.suggested_name,
				isDeadCodeTarget: isDead
			});
		}
		return candidates.sort((a, b) => {
			const scoreA = a.tokenCount * a.occurrenceCount * (1 + .15 * a.spread);
			return b.tokenCount * b.occurrenceCount * (1 + .15 * b.spread) - scoreA;
		});
	}
};
//#endregion
export { DupesRefactorEngine, determineTopology, runFallowJson };
