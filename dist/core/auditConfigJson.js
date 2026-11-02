import { safeJsonParse, safeReadFileSync, tryCatchSync } from "./safeUtils.js";
import fs from "node:fs";
// src/core/auditConfigJson.ts
/**
* src/core/auditConfigJson.ts
* Pure JSON parsing, merging, and serialization helpers for audit.config.json.
*/
function isPlainRecord(val) {
	return typeof val === "object" && val !== null && !Array.isArray(val);
}
function deepMergeMissingJson(target, missing) {
	let modified = false;
	for (const [key, val] of Object.entries(missing)) {
		if (val === void 0) continue;
		const curr = target[key];
		if (curr === void 0) {
			target[key] = val;
			modified = true;
		} else if (isPlainRecord(curr) && isPlainRecord(val) && deepMergeMissingJson(curr, val)) modified = true;
	}
	return modified;
}
function appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert) {
	const code = safeReadFileSync(configFilePath);
	if (!code) return;
	const json = safeJsonParse(code);
	if (!isPlainRecord(json)) return;
	if (deepMergeMissingJson(json, sectionsToInsert)) tryCatchSync(() => {
		fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + "\n", "utf8");
	});
}
export { appendMissingSectionsToJsonFile, deepMergeMissingJson };
