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
	ruleDescription: "Rutas o configs hardcodeadas",
	checkLine(_line, trimmed) {
		if (trimmed.includes("hardcoded-config-ok") || trimmed.includes("homebrew-ok")) return null;
		if (/\[\s*['"`](?:migrations|supabase\/migrations|database\/migrations|src['"`]\s*,\s*['"`]app)['"`]/i.test(trimmed)) return "Array de rutas candidatas hardcodeadas detectado. Resuelve las rutas dinámicamente desde 'config.paths' o 'audit.config.ts'.";
		if (/(?:\.push|\.unshift|\?\?)\s*(?:\(\s*)?['"`](?:supabase\/migrations|database\/migrations)['"`]/i.test(trimmed)) return "Ruta de directorio fallback hardcodeada detectada. Usa únicamente la ruta configurada en 'config.paths.migrationsDir'.";
		if (/(?:CANDIDATE_PATHS|FALLBACK_PATHS|CANDIDATE_FILES)\s*:\s*(?:readonly\s*)?string\[\]\s*=\s*\[/i.test(trimmed)) return "Lista fija de archivos candidatos hardcodeada detectada. Resuelve las rutas desde la configuración.";
		if (/relPath\.(?:includes|startsWith)\s*\(\s*['"`](?:migrations|supabase\/migrations|database\/migrations)['"`]\s*\)/i.test(trimmed) && !trimmed.includes("config.")) return "Exclusión de ruta hardcodeada detectada en el escáner. Consulta dinámicamente 'config.paths.migrationsDir' o 'config.exemptPaths'.";
		if (/(?:config|cfg|paths)\.(?:paths\.)?\w+Roots\s*\?\?\s*\[\s*['"`]/i.test(trimmed)) return "Array de rutas fallback hardcodeadas detectado. Resuelve las rutas directamente desde 'config.paths' sin fallback hardcodeado.";
		return null;
	}
});
//#endregion
export { hardcodedConfigDetector };
