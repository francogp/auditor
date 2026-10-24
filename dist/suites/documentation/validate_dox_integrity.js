import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { loadAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { getEffectiveIgnoreDirs } from "../../core/canonicalIgnoreRegistry.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { checkDoxIntegrity } from "../../analyzers/doxAnalyzer.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
// src/suites/documentation/validate_dox_integrity.ts
/**
* scripts/auditors/documentation/validate_dox_integrity.ts
*
* DOX & AGENTS.md HIERARCHY AND INTEGRITY AUDITOR (Node.js 26+ Native)
*
* Enforces documentation governance and link integrity across all AGENTS.md files:
*   1. Verifies that every code directory contains an AGENTS.md file.
*   2. Verifies that child AGENTS.md files are registered in their nearest parent index.
*   3. Enforces relative links (forbids absolute paths).
*   4. Verifies target files exist on disk (no broken links).
*   5. Forbids linking to git-ignored files (.gitignore).
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_dox_integrity.ts
*   npm run validate:dox-integrity
*/
enableCompileCache();
const DOX_RULES = [
	"dox-missing-agents-md",
	"dox-unregistered-child",
	"dox-unindexed-file",
	"dox-missing-section",
	"dox-section-order",
	"dox-empty-section"
];
var DoxIntegrityAuditor = class extends BaseAuditor {
	rootDir;
	constructor(options = {}) {
		const projectRoot = options.projectRoot || process.cwd();
		super({
			projectRoot,
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(DOX_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_dox_integrity",
			name: "DOX & AGENTS.md Integrity Validator",
			description: "Validates AGENTS.md hierarchy, structure, and integrity",
			family: "documentation",
			packageName: "DOX",
			configKey: "dox.enabled",
			defaultConfig: DEFAULT_AUDIT_CONFIG.dox ?? { enabled: true },
			criticalConfig: {},
			icon: "📚",
			ruleIds: DOX_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DOX_RULES, "polish"),
			ruleDescriptions: {
				"dox-missing-agents-md": "Missing AGENTS.md in directory",
				"dox-unregistered-child": "Unregistered child AGENTS.md",
				"dox-unindexed-file": "Code file not indexed in DOX",
				"dox-missing-section": "Missing mandatory section in AGENTS.md",
				"dox-section-order": "Incorrect section ordering in AGENTS.md",
				"dox-empty-section": "Empty or placeholder section"
			},
			ruleRemediations: {
				"dox-missing-agents-md": "📖 REMEDIATION GUIDE: dox-missing-agents-md\n1. Root Cause: An auditable directory in the DOX hierarchy lacks its descriptive `AGENTS.md` file. The DOX architecture requires local documentation in every key package or module.\n2. Diagnosis: Check the directory indicated in the violation.\n3. Canonical Solution: Create `AGENTS.md` in that directory with standard sections: `# Purpose`, `## Ownership`, `## Local Contracts`, and `## Key Files`.\n4. Example:\n   - Create `src/services/auth/AGENTS.md` with its purpose, ownership, and responsibilities.",
				"dox-unregistered-child": "📖 REMEDIATION GUIDE: dox-unregistered-child\n1. Root Cause: A child `AGENTS.md` file exists in a subdirectory but is not referenced or linked in the parent `AGENTS.md` Child DOX Index section.\n2. Diagnosis: Review the parent `AGENTS.md` in the directory above.\n3. Canonical Solution: Add the relative link to the child `AGENTS.md` under `## Child DOX Index`.\n4. Example:\n   - In `src/AGENTS.md`: `- [`auth/`](./services/auth/AGENTS.md)`",
				"dox-unindexed-file": "📖 REMEDIATION GUIDE: dox-unindexed-file\n1. Root Cause: A code or component file is not indexed in the `AGENTS.md` corresponding to its directory.\n2. Diagnosis: Locate the file reported in the message and open the `AGENTS.md` in its directory.\n3. Canonical Solution: Add an entry in the Key Files list of `AGENTS.md` briefly describing its purpose and responsibilities.\n4. Example:\n   - `- [`AuthService.ts`](./AuthService.ts): Authentication service and JWT token management.`",
				"dox-missing-section": "📖 REMEDIATION GUIDE: dox-missing-section\n1. Root Cause: The `AGENTS.md` file lacks one of the mandatory structural sections (e.g. `Purpose`, `Ownership`, `Local Contracts`).\n2. Diagnosis: Review H1/H2 headers in the reported `AGENTS.md`.\n3. Canonical Solution: Add the missing header adhering to the canonical DOX specification.\n4. Example:\n   - Add: `## Ownership\n\nArchitecture & Tooling Engineers.`",
				"dox-section-order": "📖 REMEDIATION GUIDE: dox-section-order\n1. Root Cause: Section headers in `AGENTS.md` do not follow the canonical sequence required by the DOX specification.\n2. Diagnosis: Verify the section order in the reported file.\n3. Canonical Solution: Reorder sections adhering to the standard flow: 1. Purpose -> 2. Ownership -> 3. Local Contracts -> 4. Key Files -> 5. Work Guidance -> 6. Verification -> 7. Child DOX Index.\n4. Example:\n   - Move `## Ownership` immediately after `# Purpose`.",
				"dox-empty-section": "📖 REMEDIATION GUIDE: dox-empty-section\n1. Root Cause: A section in `AGENTS.md` is empty or contains placeholder text (e.g. \"TBD\", \"TODO\", \"Lorem ipsum\").\n2. Diagnosis: Review the reported section at the finding line.\n3. Canonical Solution: Write a concise, genuine technical description of the module responsibilities or contracts.\n4. Example:\n   ❌ Incorrect: `## Local Contracts\nTODO`\n   ✅ Correct:   `## Local Contracts\n- All methods return Result<T, DomainError>.`"
			},
			coverage: { include: ["**/AGENTS.md"] }
		});
		this.rootDir = projectRoot;
	}
	async runAudit() {
		await loadAuditConfig(this.rootDir);
		const agentsFiles = this.context.collectFiles(["."], /* @__PURE__ */ new Set([".md"]));
		for (const f of agentsFiles) if (path.basename(f) === "AGENTS.md") this.recordScanned(f);
		if (this.filesScannedCount === 0) this.recordScanned("AGENTS.md");
		const rawViolations = await checkDoxIntegrity(this.rootDir, getEffectiveIgnoreDirs(this.rootDir), this.extraIgnorePatterns);
		for (const ruleId of DOX_RULES) this.runSubAuditorSync(ruleId, () => {
			const ruleViolations = rawViolations.filter((v) => (v.ruleId || "dox-missing-agents-md") === ruleId);
			for (const v of ruleViolations) this.addViolation({
				ruleId,
				severity: v.severity || "error",
				file: v.file,
				line: v.line || 1,
				message: v.message,
				context: v.context
			});
		});
		this.context.setMetric("Total Violations Found", rawViolations.length);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new DoxIntegrityAuditor());
export { DOX_RULES, DoxIntegrityAuditor };
