import { safeJsonParse, safeReadFileSync } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
// src/core/auditProjectIdentity.ts
/**
* packages/auditor/src/core/auditProjectIdentity.ts
*
* Project identity predicates and framework self-provider detection.
*/
/**
* Determines whether the specified project root is the @francogp/auditor provider repository itself.
*/
function isSelfProviderProject(projectRoot) {
	const hostPkgPath = path.join(projectRoot, "package.json");
	const content = safeReadFileSync(hostPkgPath);
	if (!content) return false;
	if (safeJsonParse(content)?.name === "@francogp/auditor") {
		const hasPluginJson = fs.existsSync(path.join(projectRoot, "plugin.json"));
		const hasSkillMd = fs.existsSync(path.join(projectRoot, ".agents/skills/auditor/SKILL.md")) || fs.existsSync(path.join(projectRoot, "skills/auditor/SKILL.md")) || fs.existsSync(path.join(projectRoot, "skills/auditor-framework/SKILL.md"));
		return hasPluginJson && hasSkillMd;
	}
	return false;
}
export { isSelfProviderProject };
