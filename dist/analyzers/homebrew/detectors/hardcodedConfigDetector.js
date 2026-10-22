import { createLineDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/hardcodedConfigDetector.ts
/**
* src/analyzers/homebrew/detectors/hardcodedConfigDetector.ts
*
* Detects hardcoded candidate paths, candidate arrays, and inline ignore bypasses
* in auditor suites and extensions instead of dynamic configuration-driven resolution.
*/
const hardcodedConfigDetector = createLineDetector({
	id: "hardcoded-config",
	ruleId: "auditor-hardcoded-config",
	ruleDescription: "Hardcoded paths or configs",
	checkLine(_line, trimmed) {
		if (/\[\s*['"`](?:migrations|supabase\/migrations|database\/migrations|src['"`]\s*,\s*['"`]app)['"`]/i.test(trimmed)) return "Hardcoded candidate directory array detected. Resolve paths dynamically from 'config.paths' or 'audit.config.ts'.";
		if (/(?:\.push|\.unshift|\?\?)\s*(?:\(\s*)?['"`](?:supabase\/migrations|database\/migrations)['"`]/i.test(trimmed)) return "Hardcoded fallback directory path detected. Exclusively use the configured path from 'config.paths.migrationsDir'.";
		if (/(?:CANDIDATE_PATHS|FALLBACK_PATHS|CANDIDATE_FILES)\s*:\s*(?:readonly\s*)?string\[\]\s*=\s*\[/i.test(trimmed)) return "Hardcoded candidate files list detected. Resolve paths dynamically from configuration.";
		if (/(?:file|relPath|filePath|path)\.(?:includes|startsWith)\s*\(\s*['"`](?:\/?(?:types|data|migrations|supabase|fixtures)\/|migrations|supabase\/migrations|database\/migrations)['"`]\s*\)/i.test(trimmed)) return "Hardcoded path or directory check detected in sub-auditor ('/types/', '/data/', '/migrations/'). Resolve paths dynamically from 'config.paths' or canonical utilities.";
		if (/(?:config|cfg|paths)\.(?:paths\.)?\w+Roots\s*\?\?\s*\[\s*['"`]/i.test(trimmed)) return "Hardcoded fallback roots array detected. Resolve paths directly from 'config.paths' without hardcoded fallbacks.";
		return null;
	}
});
//#endregion
export { hardcodedConfigDetector };
