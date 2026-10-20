import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, CANONICAL_IGNORE_DIRS, FileScanAuditor, SCANNABLE_EXTENSIONS, assertSafePathComponent, collectRepositoryFiles, createRuleCapabilities, createUniformRemediationPhases, getEffectiveScannableRoots, isPathIgnored, resolveFileScanRoots } from "../../core/auditorBase.js";
import { NATIVE_PATH_RULES } from "../../analyzers/nativePaths/nativePathTypes.js";
import { scanNativePathAst } from "../../analyzers/nativePaths/nativePathScanner.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_native_paths.ts
/**
* scripts/auditors/architecture/validate_native_paths.ts
*
* SECURITY & PATH INTEGRITY AUDITOR (Node.js 26+ Native, TypeScript AST)
*
* Detects homebrew filesystem path, file-URL and URL handling that must use
* `node:path` / `node:url` / `URL` natives. Analysis runs as a single TypeScript AST pass
* (src/analyzers/nativePaths) over `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` and Vue `<script>` blocks:
*   1. `unsafe-path-concat`: paths assembled with `+`, `+=`, template literals or `[...].join(sep)`.
*   2. `unsanitized-env-argv-path`: raw `process.env` / `process.argv` passed to fs/path sinks.
*   3. `untrusted-url-fetch`: dynamic `fetch()` without `new URL()` origin validation.
*   4. `hardcoded-slash-path`: Windows drive/UNC literals and backslash splitting/searching.
*   5. `homebrew-path-manipulation`: manual separator swapping, de-duplication and trimming.
*   6. `homebrew-path-parsing`: basename/dirname/extension via split/lastIndexOf/regex.
*   7. `homebrew-path-containment`: hand-rolled CWE-22 guards (`includes('..')`, prefix checks).
*   8. `homebrew-file-url`: `file://` conversions by hand instead of `fileURLToPath`/`pathToFileURL`.
*   9. `homebrew-url-parsing`: URL/query parsing by hand instead of `URL`/`URLSearchParams`.
*
* Authorized Escape Hatches:
*   path-ok: <reason>, url-ok: <reason>, env-ok: <reason>, cross-platform-ok: <reason>, security-ok: <reason>, string-ok: <reason>, test-ok: <reason>, no-domain: <reason>
*
* Usage:
*   npm run auditor -- task=validate_native_paths
*/
enableCompileCache();
/** Script extensions scanned by this suite (JSX flavors included on top of the canonical set). */
const NATIVE_PATH_EXTENSIONS = /* @__PURE__ */ new Set([
	...SCANNABLE_EXTENSIONS,
	".tsx",
	".jsx"
]);
/**
* Scans in-memory source code for native path violations using the TypeScript AST.
*/
function scanFileForNativePathViolations(filePath, content) {
	return scanNativePathAst(new AuditedDocument(filePath, content, filePath));
}
function createEmptyCounts() {
	return Object.fromEntries(NATIVE_PATH_RULES.map((r) => [r, 0]));
}
/**
* Full repository audit runner for native paths and security integrity.
*/
function auditNativePaths(targetDir = process.cwd()) {
	assertSafePathComponent(targetDir);
	const config = getAuditConfig(targetDir);
	const extraIgnorePatterns = [...config.paths?.ignoreGlobs ?? [], ...config.paths?.ignoredPatterns ?? []];
	const allFiles = getEffectiveScannableRoots(config).map((r) => path.resolve(targetDir, r)).filter((p) => fs.existsSync(p)).flatMap((root) => collectRepositoryFiles(root, targetDir, extraIgnorePatterns, NATIVE_PATH_EXTENSIONS));
	const violations = [];
	const countsByRule = createEmptyCounts();
	for (const file of allFiles) {
		const relPath = toPosixRelative(targetDir, file);
		try {
			for (const v of scanFileForNativePathViolations(relPath, fs.readFileSync(file, "utf-8"))) {
				violations.push(v);
				countsByRule[v.ruleId] += 1;
			}
		} catch {}
	}
	return {
		filesScanned: allFiles.length,
		violations,
		passed: violations.length === 0,
		countsByRule
	};
}
const RULE_DESCRIPTIONS = {
	"unsafe-path-concat": "Concatenación insegura de rutas",
	"unsanitized-env-argv-path": "Ruta argv/env sin sanitizar",
	"untrusted-url-fetch": "Llamada HTTP sin sanitizar",
	"hardcoded-slash-path": "Separador de ruta hardcodeado",
	"homebrew-path-manipulation": "Normalización casera de rutas",
	"homebrew-path-parsing": "Parseo casero de rutas",
	"homebrew-path-containment": "Contención casera de rutas",
	"homebrew-file-url": "Conversión casera file://",
	"homebrew-url-parsing": "Parseo casero de URLs"
};
const RULE_REMEDIATIONS = {
	"unsafe-path-concat": "📖 GUÍA DE REMEDIACIÓN: unsafe-path-concat\n1. Causa Raíz: Una ruta de archivo se construyó uniendo texto (operador `+`, `+=`, template literal o `[...].join(separador)`). El separador queda fijo, se rompe entre Windows y POSIX y no se normalizan segmentos `..` (CWE-22).\n2. Diagnóstico: Ubica la expresión señalada: un origen de ruta (`__dirname`, `import.meta.dirname`, `process.cwd()`, variables `*Dir`/`*Path`/`*File`) combinado con un separador literal o `path.sep`.\n3. Solución Canónica: Pasa cada segmento como argumento separado a `path.join()` o `path.resolve()` de `node:path`.\n4. Ejemplo:\n   ❌ Frágil: unir directorio, barra y nombre de archivo como texto\n   ✅ Canónico: `const fullPath = path.join(baseDir, fileName);`",
	"unsanitized-env-argv-path": "📖 GUÍA DE REMEDIACIÓN: unsanitized-env-argv-path\n1. Causa Raíz: Un valor de `process.argv` o `process.env` se pasa directo a `fs.*` o `path.join/resolve` sin verificar que permanezca dentro del directorio autorizado (CWE-22).\n2. Diagnóstico: Ubica la llamada al sink de filesystem o path que recibe el argumento crudo.\n3. Solución Canónica:\n   a) Asigna el valor a una variable, resuélvelo con `path.resolve(base, valor)` y valida contención con `path.relative()` + `path.isAbsolute()` (o `assertSafePathComponent()`).\n   b) Si es un script CLI con ruta ya validada, anota `// path-ok: <justificación>`.\n4. Ejemplo:\n   ❌ Inseguro: pasar el argumento de proceso directamente a la lectura de archivos\n   ✅ Seguro:   `const target = path.resolve(root, input); assertSafePathComponent(target);`",
	"untrusted-url-fetch": "📖 GUÍA DE REMEDIACIÓN: untrusted-url-fetch\n1. Causa Raíz: Se invoca `fetch()` con un valor dinámico sin parsearlo con `new URL()` ni validar protocolo u origen (CWE-918 SSRF).\n2. Diagnóstico: Inspecciona la llamada a `fetch()` señalada y el origen del argumento.\n3. Solución Canónica:\n   a) Construye la URL con `new URL(endpoint, baseUrl)`.\n   b) Valida `protocol` y `hostname`/`origin` contra una lista permitida, o usa `safeFetch()`.\n   c) Si es una llamada interna con URL fija, anota `// url-ok: <justificación>`.\n4. Ejemplo:\n   ❌ Inseguro: invocar fetch con un string recibido sin validar\n   ✅ Seguro:   `fetch(new URL(userPath, baseUrl));`",
	"hardcoded-slash-path": "📖 GUÍA DE REMEDIACIÓN: hardcoded-slash-path\n1. Causa Raíz: Se usó una letra de unidad o ruta UNC de Windows como ruta, o se dividió/buscó una ruta por contrabarra. Rompe la ejecución en Linux/macOS y CI.\n2. Diagnóstico: Busca el literal de unidad/UNC o la llamada `split`/`lastIndexOf`/`indexOf` con contrabarra en la línea del reporte.\n3. Solución Canónica:\n   a) Resuelve rutas relativas al proyecto con `path.resolve()`.\n   b) Para segmentos usa `path.parse()`, `path.basename()` o `split(path.sep)`.\n   c) Si el código es explícitamente Windows, usa `path.win32.*` (que acepta literales Windows).\n4. Ejemplo:\n   ❌ Incorrecto: rutas con prefijo rígido de unidad o división por contrabarra\n   ✅ Correcto:   `const p = path.resolve(process.cwd(), \"data\");`",
	"homebrew-path-manipulation": "📖 GUÍA DE REMEDIACIÓN: homebrew-path-manipulation\n1. Causa Raíz: Se normalizó una ruta a mano (intercambio de separadores con regex o `split/join` literales, deduplicación de barras, recorte de barra final, limpieza con clases de caracteres). En POSIX la contrabarra es un carácter válido de nombre de archivo, así que reemplazarla corrompe rutas.\n2. Diagnóstico: Ubica la llamada `replace`/`replaceAll` o la cadena `split(...).join(...)` señalada.\n3. Solución Canónica:\n   a) Para rutas del SO actual: `p.split(path.sep).join(path.posix.sep)`.\n   b) Para entrada estilo Windows de cualquier origen: `p.replaceAll(path.win32.sep, path.posix.sep)`.\n   c) Para segmentos redundantes: `path.normalize()` / `path.posix.normalize()`.\n4. Ejemplo:\n   ❌ Frágil: reemplazar contrabarras por barras con una expresión regular\n   ✅ Canónico: `const posixRel = path.relative(root, file).split(path.sep).join(path.posix.sep);`",
	"homebrew-path-parsing": "📖 GUÍA DE REMEDIACIÓN: homebrew-path-parsing\n1. Causa Raíz: Se extrajo nombre, directorio o extensión de una ruta con `split`, `lastIndexOf`, `pop()` o regex. Falla con separadores mixtos, archivos ocultos (`.env`) y nombres con varios puntos.\n2. Diagnóstico: Ubica la llamada de string señalada sobre una variable de ruta o nombre de archivo.\n3. Solución Canónica: Usa `path.basename()`, `path.dirname()`, `path.extname()` o `path.parse()` de `node:path`.\n4. Ejemplo:\n   ❌ Frágil: tomar el último segmento dividiendo por barra\n   ✅ Canónico: `const { name, ext, dir } = path.parse(filePath);`",
	"homebrew-path-containment": "📖 GUÍA DE REMEDIACIÓN: homebrew-path-containment\n1. Causa Raíz: La protección contra directory traversal (CWE-22) se implementó a mano: buscar `..` en el texto, comparar prefijos con `startsWith(base)` (confunde `/base` con `/base2`), omitir `path.isAbsolute()` (en Windows otra unidad devuelve ruta absoluta) o regex que borran `../` (eludibles con encoding).\n2. Diagnóstico: Ubica la comprobación señalada y la ruta que intenta proteger.\n3. Solución Canónica: Resuelve con `path.resolve(base, input)` y valida con `const rel = path.relative(base, target); const inside = !rel.startsWith(\"..\") && !path.isAbsolute(rel);` o usa `isPathContained()`.\n4. Ejemplo:\n   ❌ Frágil: rechazar entradas que contengan dos puntos o comparar prefijos de texto\n   ✅ Canónico: `if (!isPathContained(rootDir, target)) throw new Error(\"Acceso denegado\");`",
	"homebrew-file-url": "📖 GUÍA DE REMEDIACIÓN: homebrew-file-url\n1. Causa Raíz: Se convirtió entre rutas y URLs `file://` a mano (quitar o anteponer el esquema, o leer `.pathname` de `new URL(..., import.meta.url)`). `.pathname` queda percent-encoded (espacios como `%20`) y en Windows produce `/C:/...`.\n2. Diagnóstico: Ubica el literal `file://` o el acceso a `.pathname` señalado.\n3. Solución Canónica: Usa `fileURLToPath()` y `pathToFileURL()` de `node:url`, o `import.meta.dirname` / `import.meta.filename`.\n4. Ejemplo:\n   ❌ Frágil: quitar el esquema del string de la URL del módulo\n   ✅ Canónico: `const local = fileURLToPath(new URL(\"./data.json\", import.meta.url));`",
	"homebrew-url-parsing": "📖 GUÍA DE REMEDIACIÓN: homebrew-url-parsing\n1. Causa Raíz: Se parseó o construyó una URL a mano: dividir por `?`, `#`, `&` o `=`, regex de query o de esquema, `path.join()` sobre URLs, concatenación dentro de `new URL()` o la API legacy `url.parse()` (deprecada).\n2. Diagnóstico: Ubica la operación de string, regex o llamada señalada sobre la URL.\n3. Solución Canónica: Usa `new URL(relativo, base)`, `url.searchParams`, `URLSearchParams`, `url.pathname` y `url.hash`.\n4. Ejemplo:\n   ❌ Frágil: dividir la URL por el signo de interrogación para leer parámetros\n   ✅ Canónico: `const id = new URL(requestUrl).searchParams.get(\"id\");`"
};
var NativePathsAuditor = class extends FileScanAuditor {
	documentCache = /* @__PURE__ */ new WeakMap();
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (cfg) => getEffectiveScannableRoots(cfg));
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(NATIVE_PATH_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_native_paths",
			name: "Security & Native Path Integrity Validator",
			description: "Exige node:path, node:url y URL nativos (CWE-22)",
			family: "architecture",
			ruleIds: NATIVE_PATH_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(NATIVE_PATH_RULES, "setup"),
			packageName: "Path",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🛤️",
			ruleDescriptions: RULE_DESCRIPTIONS,
			ruleRemediations: RULE_REMEDIATIONS,
			roots: targetRoots,
			allowedExtensions: NATIVE_PATH_EXTENSIONS,
			projectRoot: effectiveRoot
		});
		for (const ruleId of NATIVE_PATH_RULES) this.declareFileSubAuditor(ruleId, (doc) => {
			for (const v of this.scanDocumentOnce(doc)) if (v.ruleId === ruleId) this.addViolation(v);
		});
	}
	/** Runs the single AST pass once per document and shares the result across rule sub-auditors. */
	scanDocumentOnce(doc) {
		const cached = this.documentCache.get(doc);
		if (cached) return cached;
		const violations = scanNativePathAst(doc);
		this.documentCache.set(doc, violations);
		return violations;
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new NativePathsAuditor());
//#endregion
export { CANONICAL_IGNORE_DIRS, NATIVE_PATH_EXTENSIONS, NATIVE_PATH_RULES, NativePathsAuditor, auditNativePaths, getEffectiveScannableRoots, isPathIgnored, scanFileForNativePathViolations };
