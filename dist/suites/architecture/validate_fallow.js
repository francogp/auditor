import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isCliPath } from "../../core/auditCodeRoots.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from "../../cli/cliUtils.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { resolveFallowBinary } from "./validate_similar_code.js";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
//#region src/suites/architecture/validate_fallow.ts
/**
* packages/auditor/src/suites/architecture/validate_fallow.ts
*
* OFFICIAL FALLOW STATIC INTELLIGENCE & REFACTORING TARGETS AUDITOR
*
* Dedicated standalone auditor for Fallow intelligence engine:
*   1. Duplicate and triplicate code detection.
*   2. Static security vulnerability analysis (CWE sinks).
*   3. Dead code, unused exports, files, dependencies, and circular dependencies.
*   4. Structural complexity and refactoring targets enforcement.
*/
const FALLOW_RULES = [
	"fallow-refactoring-targets",
	"fallow-duplicate-code",
	"fallow-triplicate-code",
	"fallow-unused-exports",
	"fallow-unused-files",
	"fallow-unused-dependencies",
	"fallow-circular-dependencies",
	"fallow-boundary-violations",
	"fallow-stale-suppressions",
	"fallow-workspace-diagnostic",
	"fallow-security-cwe"
];
const FALLOW_RULE_CAPABILITIES = {
	"fallow-boundary-violations": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-stale-suppressions": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-workspace-diagnostic": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-refactoring-targets": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-duplicate-code": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-triplicate-code": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-unused-exports": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-unused-files": {
		speed: ["light", "full"],
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-unused-dependencies": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-circular-dependencies": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	},
	"fallow-security-cwe": {
		speed: "light",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: true,
		critical: false
	}
};
const FALLOW_RULE_DESCRIPTIONS = {
	"fallow-refactoring-targets": "Objetivo refactor Fallow",
	"fallow-duplicate-code": "Código duplicado detectado",
	"fallow-triplicate-code": "Código triplicado crítico",
	"fallow-unused-exports": "Export no utilizado en código",
	"fallow-unused-files": "Archivo muerto sin uso",
	"fallow-unused-dependencies": "Dependencia no utilizada",
	"fallow-circular-dependencies": "Dependencia circular",
	"fallow-boundary-violations": "Límite arquitectónico",
	"fallow-stale-suppressions": "Supresión obsoleta",
	"fallow-workspace-diagnostic": "Diagnóstico de workspace",
	"fallow-security-cwe": "Vulnerabilidad CWE detectada"
};
const FALLOW_RULE_REMEDIATIONS = {
	"fallow-refactoring-targets": "Causa Raíz:\nEl motor de análisis arquitectónico Fallow calcula una prioridad de refactorización combinando complejidad ciclomática, complejidad cognitiva, tamaño de archivo (LOC), acoplamiento aferente/eferente y el número de módulos dependientes que amplifican cada cambio. Un puntaje superior al umbral configurado (\"fallow.maxTargetPriority\", por defecto \"high\" = 20, o \"critical\" = 30) señala un hotspot de alto riesgo arquitectónico.\n\nDiagnóstico:\n1. Ejecuta \"npm run auditor:findings -- rule=fallow-refactoring-targets flat\" para ver los archivos afectados, el puntaje exacto de prioridad y las funciones concretas señaladas por Fallow.\n2. Ejecuta \"npm run auditor:complexity\" para desglosar la complejidad ciclomática y cognitiva función por función.\n3. Ejecuta \"npm run auditor:fallow\" para obtener la vista general de salud del grafo.\n\nSolución Canónica:\n1. Descomposición funcional: Extraer las funciones de alta complejidad cognitiva identificadas en el mensaje hacia funciones puras auxiliares, reduciendo anidamientos, ramas condicionales profundas y mutaciones directas.\n2. Modularización de archivos de alto impacto: Si el mensaje indica \"Split high-impact file (N LOC), M dependents amplify every change\", divide el archivo en módulos o subsistemas cohesivos más pequeños y desacoplados.\n3. Configuración en .auditor/audit.config.ts: Fallow evalúa objetivos según \"config.fallow.maxTargetPriority\" (\"critical\" >= 30, \"high\" >= 20). En proyectos monolíticos o coordinadores autorizados, la verificación puede ajustarse mediante \"fallow.enforceTargets: false\" o elevar el umbral previa consulta explícita con el programador humano.\n4. Queda CATEGÓRICAMENTE PROHIBIDO desensamblar node_modules o parchar librerías para silenciar esta detección.\n\nEjemplo / Herramientas Oficiales:\n  Diagnóstico: npm run auditor:complexity\n  Deduplicación: npm run auditor:dupes\n  Inspección de objetivos: npm run auditor:findings -- rule=fallow-refactoring-targets flat",
	"fallow-duplicate-code": "Causa Raíz:\nSe detectaron dos fragmentos de código estructuralmente idénticos o clones sintácticos que superan el umbral configurado de tokens y líneas de Fallow, violando el principio DRY.\n\nDiagnóstico:\nEjecuta \"npm run auditor:dupes\" para ver la tabla consolidada de duplicados por archivo, o \"npm run auditor:fallow:dupes\" para la vista detallada de clones sintácticos.\n\nSolución Canónica:\n1. Extraer la lógica duplicada a una función utilitaria compartida, composable o helper puro.\n2. Utilizar la herramienta determinista oficial: \"npm run auditor:dupes inspect <fingerprint>\" para generar el plan de deduplicación y aplicarlo con \"npm run auditor:dupes apply <plan.json>\".\n\nEjemplo / Herramientas Oficiales:\n  Descubrimiento: npm run auditor:dupes\n  Inspección: npm run auditor:dupes inspect <fingerprint>",
	"fallow-triplicate-code": "Causa Raíz:\nSe detectó un bloque de código triplicado (presente en 3 o más ubicaciones distintas del repositorio). La triplicación representa deuda técnica severa y multiplica exponencialmente el riesgo de desincronización de bugs.\n\nDiagnóstico:\nEjecuta \"npm run auditor:dupes\" para inspeccionar las huellas digitales (fingerprints) de los triplicados y los archivos involucrados.\n\nSolución Canónica:\n1. Unificar el código triplicado en una única fuente de verdad (SSoT) en un módulo común compartido.\n2. Ejecutar \"npm run auditor:dupes inspect <fingerprint>\" y aplicar la refactorización mediante \"npm run auditor:dupes apply <plan.json> --worktree\" para verificar de forma segura en un árbol aislado.\n\nEjemplo / Herramientas Oficiales:\n  Descubrimiento de triplicados: npm run auditor:dupes\n  Inspección detallada: npm run auditor:dupes inspect <fingerprint>",
	"fallow-unused-exports": "Causa Raíz:\nUna función, clase, interfaz, tipo o constante declarada con \"export\" no posee consumidores ni referencias en ningún otro archivo del repositorio ni en las entradas del paquete.\n\nDiagnóstico:\nEjecuta \"npm run auditor:fallow:exports\" o \"npm run auditor:findings -- rule=fallow-unused-exports flat\" para identificar el símbolo no utilizado y la línea exacta.\n\nSolución Canónica:\n1. Si el símbolo es de consumo puramente interno del archivo, elimina la palabra clave \"export\".\n2. Si el símbolo es código obsoleto o muerto, elimínalo completamente del archivo.\n3. Si el símbolo es parte de la API pública exportada por una librería, asegúrate de que el archivo esté declarado en \"exports\" de package.json o configurado como entrypoint en .fallowrc.json.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:fallow:exports",
	"fallow-unused-files": "Causa Raíz:\nUn archivo fuente del proyecto no es importado ni alcanzado directa o transitivamente por ningún punto de entrada del grafo de dependencias analizado por Fallow.\n\nDiagnóstico:\nEjecuta \"npm run auditor:findings -- rule=fallow-unused-files flat\" para ver el listado de archivos huérfanos.\n\nSolución Canónica:\n1. Si el archivo es código abandonado o residual de refactorizaciones previas, elimínalo del repositorio con \"git rm\".\n2. Si el archivo debía ser utilizado por el sistema, incorpora su importación legítima en el módulo correspondiente.\n3. Si es un archivo de configuración, script CLI o fixture que se ejecuta de forma independiente, agrégalo a \"entryPoints\" en .fallowrc.json.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:fallow category=dead-code",
	"fallow-unused-dependencies": "Causa Raíz:\nUn paquete declarado en \"dependencies\" o \"devDependencies\" de package.json no es importado ni referenciado en ningún archivo fuente del proyecto.\n\nDiagnóstico:\nEjecuta \"npm run auditor:dependencies\" o \"npm run auditor:findings -- rule=fallow-unused-dependencies flat\".\n\nSolución Canónica:\n1. Desinstalar la dependencia innecesaria ejecutando \"npm rm <nombre-del-paquete>\".\n2. Si la dependencia se utiliza exclusivamente en tiempo de ejecución de manera indirecta (ej. motor de testing, CLI global o plugin dinámico), configúrala en la sección de exclusiones de dependencias en .fallowrc.json.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:dependencies",
	"fallow-circular-dependencies": "Causa Raíz:\nDos o más módulos forman un ciclo cerrado de dependencias (A importa B y B importa A), lo que puede ocasionar valores \"undefined\" durante la carga de módulos, problemas de inicialización y memory leaks.\n\nDiagnóstico:\nEjecuta \"npm run auditor:fallow:circular\" para visualizar el ciclo exacto y los módulos involucrados.\n\nSolución Canónica:\n1. Romper el ciclo abstrayendo los tipos, interfaces o constantes compartidas a un archivo común neutral.\n2. Invertir dependencias mediante inyección de dependencias, callbacks o eventos.\n3. Usar \"import type { ... }\" si la dependencia cruzada se debe únicamente a definiciones de tipos en TypeScript.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:fallow:circular",
	"fallow-boundary-violations": "Causa Raíz:\nUn módulo importa código de otra capa o subsistema violando las fronteras arquitectónicas declaradas en .fallowrc.json (por ejemplo, UI importando modelos internos de Server DB directamente).\n\nDiagnóstico:\nEjecuta \"npm run auditor:findings -- rule=fallow-boundary-violations flat\" para ver la importación infractora y los límites violados.\n\nSolución Canónica:\n1. Sustituir la importación directa consumiendo la API pública o contrato oficial provisto por la capa destino.\n2. Encapsular la lógica en servicios intermediarios autorizados para preservar el desacoplamiento arquitectónico.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:findings -- rule=fallow-boundary-violations",
	"fallow-stale-suppressions": "Causa Raíz:\nExiste una directiva de supresión de Fallow (\"// fallow-ignore\", etc.) en una línea donde ya no se produce ninguna infracción estática, ensuciando el código fuente con comentarios obsoletos.\n\nDiagnóstico:\nEjecuta \"npm run auditor:findings -- rule=fallow-stale-suppressions flat\" para ubicar el comentario obsoleto.\n\nSolución Canónica:\n1. Eliminar la directiva de supresión obsoleta del código fuente para preservar la higiene estática.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:fallow category=suppressions",
	"fallow-workspace-diagnostic": "Causa Raíz:\nFallow detectó un problema de configuración estructural en el espacio de trabajo, tales como errores en tsconfig.json, rutas no resolubles o sintaxis inválida en .fallowrc.json.\n\nDiagnóstico:\nRevisa el mensaje detallado del diagnóstico y ejecuta \"npm run auditor:tsconfig\" y \"npm run auditor:fallow-config\".\n\nSolución Canónica:\n1. Corregir las opciones del compilador o rutas de inclusión en tsconfig.json.\n2. Validar que .fallowrc.json cumpla estrictamente con el esquema esperado y sea JSON válido.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:tsconfig\n  npm run auditor:fallow-config",
	"fallow-security-cwe": "Causa Raíz:\nFallow identificó un patrón de código susceptible a una vulnerabilidad de seguridad catalogada en CWE (Common Weakness Enumeration), como path traversal (CWE-22), inyección o manipulación insegura de entradas.\n\nDiagnóstico:\nEjecuta \"npm run auditor:fallow:security\" para inspeccionar el identificador CWE y el vector de riesgo.\n\nSolución Canónica:\n1. Para validación de entradas de usuario, implementar esquemas tipados estrictos con Valibot o tipos de dominio.\n2. Para contención de rutas (CWE-22), utilizar siempre \"path.resolve()\" + \"path.relative()\" de node:path.\n3. Sanitizar y escapar todos los parámetros antes de interpolarlos en consultas o comandos del sistema.\n\nEjemplo / Herramientas Oficiales:\n  npm run auditor:fallow:security"
};
const FALLOW_RULE_REMEDIATION_PHASES = {
	"fallow-unused-files": "prune",
	"fallow-unused-exports": "prune",
	"fallow-unused-dependencies": "prune",
	"fallow-duplicate-code": "dedup",
	"fallow-triplicate-code": "dedup",
	"fallow-boundary-violations": "contracts",
	"fallow-security-cwe": "behavior",
	"fallow-refactoring-targets": "hygiene",
	"fallow-circular-dependencies": "hygiene",
	"fallow-stale-suppressions": "hygiene",
	"fallow-workspace-diagnostic": "setup"
};
const FALLOW_CRITICAL_PRIORITY_THRESHOLD = 30;
const FALLOW_HIGH_PRIORITY_THRESHOLD = 20;
const FALLOW_MEDIUM_PRIORITY_THRESHOLD = 10;
const FALLOW_MODERATE_PRIORITY_THRESHOLD = 10;
const FALLOW_LOW_PRIORITY_THRESHOLD = 5;
const FALLOW_ALL_PRIORITY_THRESHOLD = 1;
const FALLOW_PRIORITY_MIN_THRESHOLDS = {
	critical: 30,
	high: 20,
	medium: 10,
	moderate: 10,
	low: 5,
	all: 1
};
function resolveFallowTargetMinThreshold(priority) {
	if (typeof priority === "number") return Number.isFinite(priority) ? Math.max(0, priority) : 20;
	if (typeof priority === "string" && priority in FALLOW_PRIORITY_MIN_THRESHOLDS) return FALLOW_PRIORITY_MIN_THRESHOLDS[priority];
	return 20;
}
const FALLOW_DUPES_CONFIG = ["--min-occurrences", "2"];
const FALLOW_TRIPLETS_CONFIG = [
	"--min-occurrences",
	"3",
	"--min-lines",
	"10",
	"--min-tokens",
	"60"
];
function mapCloneFindings(cloneGroups, isTriplets, projectRoot) {
	const findings = [];
	const ruleId = isTriplets ? "fallow-triplicate-code" : "fallow-duplicate-code";
	const label = isTriplets ? "Código triplicado crítico detectado por Fallow" : "Código duplicado detectado por Fallow";
	const context = isTriplets ? "fallow-triplets" : "fallow-dupes";
	for (const group of cloneGroups || []) {
		const tokens = group.token_count ?? group.duplicated_tokens ?? 0;
		for (const inst of group.instances || []) findings.push({
			file: path.resolve(projectRoot, inst.file),
			line: inst.start_line,
			message: `${label} (${tokens} tokens)`,
			context,
			ruleId,
			severity: "error"
		});
	}
	return findings;
}
function mapSecurityFindings(findings, projectRoot) {
	const res = [];
	for (const f of findings || []) {
		if (isCliPath(f.path)) continue;
		res.push({
			file: path.resolve(projectRoot, f.path),
			line: f.line || 1,
			message: `Vulnerabilidad de seguridad Fallow: ${f.message || f.rule_id || "CWE Sink"}`,
			context: f.rule_id || "cwe",
			ruleId: "fallow-security-cwe",
			severity: "error"
		});
	}
	return res;
}
function mapUnusedFileFindings(files, projectRoot) {
	return (files || []).map((f) => ({
		file: path.resolve(projectRoot, f.path),
		line: 1,
		message: `Archivo huérfano sin uso (Dead Code Fallow): '${f.path}'`,
		context: f.path,
		ruleId: "fallow-unused-files",
		severity: "error"
	}));
}
function mapUnusedExportFindings(exports, projectRoot) {
	return (exports || []).map((x) => ({
		file: path.resolve(projectRoot, x.path),
		line: x.line || 1,
		message: `Export no utilizado (Fallow): '${x.export_name}'`,
		context: x.export_name,
		ruleId: "fallow-unused-exports",
		severity: "error"
	}));
}
function mapUnusedDepFindings(deps, projectRoot) {
	return (deps || []).map((d) => ({
		file: path.resolve(projectRoot, d.path || "package.json"),
		line: d.line || 1,
		message: `Dependencia no utilizada en package.json (Fallow): '${d.package_name}'`,
		context: d.package_name,
		ruleId: "fallow-unused-dependencies",
		severity: "error"
	}));
}
function mapCircularDepFindings(circulars, projectRoot) {
	return (circulars || []).map((c) => {
		const filesList = c.files || c.cycle || [];
		const filePath = c.path || filesList[0] || "src";
		return {
			file: path.resolve(projectRoot, filePath),
			line: c.line || 1,
			message: `Dependencia circular crítica (Fallow): ${filesList.join(" → ") || c.message || filePath}`,
			context: filePath,
			ruleId: "fallow-circular-dependencies",
			severity: "error"
		};
	});
}
function mapBoundaryFindings(boundaries, projectRoot) {
	return (boundaries || []).map((b) => ({
		file: path.resolve(projectRoot, b.path),
		line: b.line || 1,
		message: `Violación de límite arquitectónico (Fallow): ${b.message}`,
		context: b.message,
		ruleId: "fallow-boundary-violations",
		severity: "error"
	}));
}
function mapStaleSuppressions(suppressions, projectRoot) {
	const findings = [];
	for (const s of suppressions || []) {
		if (s.origin?.issue_kind?.startsWith("cwe-") || s.origin?.kind_known === false) continue;
		findings.push({
			file: path.resolve(projectRoot, s.path || s.file || "src"),
			line: s.line || 1,
			message: `Supresión obsoleta de Fallow: ${s.message || s.kind || ""}`,
			context: s.path || s.file || "",
			ruleId: "fallow-stale-suppressions",
			severity: "error"
		});
	}
	return findings;
}
function mapWorkspaceDiagFindings(diagnostics, projectRoot) {
	const findings = [];
	for (const diag of diagnostics || []) {
		if (diag.kind === "boundaries-not-configured" || diag.kind === "rule-packs-not-configured") continue;
		findings.push({
			file: path.resolve(projectRoot, diag.path || "package.json"),
			line: 1,
			message: `Diagnóstico de workspace (Fallow): [${diag.kind || "diagnostic"}] ${diag.message || ""}`,
			context: diag.kind || "diagnostic",
			ruleId: "fallow-workspace-diagnostic",
			severity: "error"
		});
	}
	return findings;
}
function mapDeadCodeFindings(data, projectRoot) {
	const dc = data.dead_code || data;
	const allDeps = [...dc.unused_dependencies || [], ...dc.unused_dev_dependencies || []];
	return [
		...mapUnusedFileFindings(dc.unused_files, projectRoot),
		...mapUnusedExportFindings(dc.unused_exports, projectRoot),
		...mapUnusedDepFindings(allDeps, projectRoot),
		...mapCircularDepFindings(dc.circular_dependencies, projectRoot),
		...mapBoundaryFindings(data.boundary_violations, projectRoot),
		...mapStaleSuppressions(dc.stale_suppressions, projectRoot),
		...mapWorkspaceDiagFindings(dc.workspace_diagnostics, projectRoot)
	];
}
function mapHealthFindings(data, projectRoot) {
	const findings = [];
	const cfg = getAuditConfig(projectRoot);
	if (cfg.fallow?.enforceTargets) {
		const minThreshold = resolveFallowTargetMinThreshold(cfg.fallow.maxTargetPriority);
		for (const t of data.targets || []) {
			const priority = t.priority ?? 0;
			if (priority < minThreshold) continue;
			findings.push({
				file: path.resolve(projectRoot, t.path),
				line: 1,
				message: `Objetivo de refactorización crítico (Fallow [prioridad: ${priority}]): ${t.recommendation || t.category || "Mantenimiento crítico"}`,
				context: t.category || "refactoring-target",
				ruleId: "fallow-refactoring-targets",
				severity: "error"
			});
		}
	}
	return findings;
}
function mapFallowJson(command, data, projectRoot = process.cwd()) {
	if (command === "dupes") return mapCloneFindings(data.clone_groups, false, projectRoot);
	if (command === "triplets") return mapCloneFindings(data.clone_groups, true, projectRoot);
	if (command === "security") return mapSecurityFindings(data.findings, projectRoot);
	if (command === "dead-code") return mapDeadCodeFindings(data, projectRoot);
	if (command === "health") return mapHealthFindings(data, projectRoot);
	if (command === "audit") return [...mapDeadCodeFindings(data, projectRoot), ...mapHealthFindings(data, projectRoot)];
	return [];
}
function tryParseFallowJson(raw) {
	if (!raw) return null;
	const str = typeof raw === "string" ? raw : raw.toString("utf8");
	const start = str.indexOf("{");
	if (start === -1) return null;
	try {
		return JSON.parse(str.substring(start));
	} catch {
		return null;
	}
}
var FallowArchitectureAuditor = class extends BaseAuditor {
	constructor(projectRoot = process.cwd()) {
		super({
			usesThirdPartyTool: true,
			thirdPartyToolPolicy: {
				toolName: "Fallow",
				fallbackBehavior: "violation",
				fallbackRuleId: "fallow-workspace-diagnostic"
			},
			ruleCapabilities: FALLOW_RULE_CAPABILITIES,
			id: "validate_fallow",
			name: "Fallow Architecture & Refactoring Targets",
			description: "Audita código muerto, targets y CWE con Fallow",
			family: "architecture",
			packageName: "Fallow",
			configKey: "fallow",
			defaultConfig: {
				enabled: true,
				typeAware: true,
				showCascade: true,
				duplicates: {
					nearMiss: true,
					mode: "strict"
				},
				viz: {
					enabled: true,
					outputPath: "scratch/fallow_map.html"
				}
			},
			criticalConfig: {},
			icon: "🌾",
			ruleIds: FALLOW_RULES,
			ruleDescriptions: FALLOW_RULE_DESCRIPTIONS,
			ruleRemediations: FALLOW_RULE_REMEDIATIONS,
			ruleRemediationPhases: FALLOW_RULE_REMEDIATION_PHASES,
			coverage: {
				include: ["src/**/*.{ts,js,vue}"],
				source: "declared-only"
			},
			projectRoot
		});
	}
	runFallowSubCommand(command, extraArgs = [], associatedRules = []) {
		const fallowBin = resolveFallowBinary(this.projectRoot);
		if (!fallowBin) return [];
		const args = [
			"--format",
			"json",
			...extraArgs
		];
		const cmd = `node "${fallowBin}" ${command === "triplets" ? "dupes" : command} ${args.join(" ")}`;
		let reportedElapsed;
		const start = performance.now();
		try {
			const stdout = execSync(cmd, {
				cwd: this.projectRoot,
				encoding: "utf8",
				stdio: [
					"pipe",
					"pipe",
					"ignore"
				],
				maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES
			});
			const parsed = tryParseFallowJson(stdout);
			if (parsed) {
				if (typeof parsed.elapsed_ms === "number") reportedElapsed = parsed.elapsed_ms;
				return mapFallowJson(command, parsed, this.projectRoot);
			}
			if (stdout && stdout.trim().length > 0) this.addViolation({
				ruleId: "fallow-workspace-diagnostic",
				severity: "error",
				file: "fallow",
				line: 1,
				message: `Salida inesperada no JSON de fallow ${command}: ${stdout.trim().slice(0, 300)}`,
				context: `fallow ${command}`
			});
		} catch (e) {
			const err = e;
			const parsed = tryParseFallowJson(err.stdout);
			if (parsed) {
				if (typeof parsed.elapsed_ms === "number") reportedElapsed = parsed.elapsed_ms;
				return mapFallowJson(command, parsed, this.projectRoot);
			}
			this.addViolation({
				ruleId: "fallow-workspace-diagnostic",
				severity: "error",
				file: "fallow",
				line: 1,
				message: `Error ejecutando fallow ${command}: ${err.message || String(e)}`,
				context: `fallow ${command}`
			});
		} finally {
			const elapsed = reportedElapsed ?? performance.now() - start;
			for (const rule of associatedRules) this.reportRuleDuration(rule, elapsed);
		}
		return [];
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Fallow deshabilitado en configuración")) return;
		for (const rule of FALLOW_RULES) if (this.isRuleActiveForCurrentRun(rule)) this.markRuleEvaluated(rule);
		else this.markRuleNotApplicable(rule, `Omitido en tier '${this.getExecutionTier()}'`);
		this.recordExternalScanCount(1);
		const config = getAuditConfig(this.projectRoot);
		const allFindings = [];
		const deadCodeProfile = {
			command: "fallow dead-code",
			profiles: {
				light: ["--no-type-aware"],
				full: (() => {
					const args = [];
					if (config.fallow?.typeAware !== false && fs.existsSync(path.resolve(this.projectRoot, "tsconfig.json"))) args.push("--type-aware");
					if (config.fallow?.showCascade !== false) args.push("--show-cascade");
					return args;
				})()
			},
			defaultArgs: ["--no-type-aware"]
		};
		const deadCodeArgs = this.resolveCommandArgs(deadCodeProfile);
		const deadCodeRules = [
			"fallow-unused-exports",
			"fallow-unused-files",
			"fallow-boundary-violations",
			"fallow-stale-suppressions",
			"fallow-workspace-diagnostic"
		];
		const executeFallowSecurity = () => {
			if (!this.isRuleActiveForCurrentRun("fallow-security-cwe")) return;
			if ((config.fallow?.security?.enabled ?? config.security?.enabled ?? true) !== false) allFindings.push(...this.runFallowSubCommand("security", [], ["fallow-security-cwe"]));
			else this.markRuleNotApplicable("fallow-security-cwe", "Desactivado en config (fallow.security.enabled: false)");
		};
		if (this.isRuleActiveForCurrentRun("fallow-duplicate-code")) {
			const dupesArgs = [...FALLOW_DUPES_CONFIG];
			if (config.fallow?.duplicates?.nearMiss !== false) dupesArgs.push("--dupes-near");
			if (config.fallow?.duplicates?.mode) dupesArgs.push("--dupes-mode", config.fallow.duplicates.mode);
			allFindings.push(...this.runFallowSubCommand("dupes", dupesArgs, ["fallow-duplicate-code"]));
		}
		if (this.isRuleActiveForCurrentRun("fallow-triplicate-code")) allFindings.push(...this.runFallowSubCommand("triplets", FALLOW_TRIPLETS_CONFIG, ["fallow-triplicate-code"]));
		executeFallowSecurity();
		if (deadCodeRules.some((r) => this.isRuleActiveForCurrentRun(r))) {
			const deadCode = this.runFallowSubCommand("dead-code", deadCodeArgs, deadCodeRules);
			allFindings.push(...deadCode.filter((f) => this.isRuleActiveForCurrentRun(f.ruleId)));
		}
		const healthRules = [
			"fallow-refactoring-targets",
			"fallow-circular-dependencies",
			"fallow-unused-dependencies"
		];
		if (healthRules.some((r) => this.isRuleActiveForCurrentRun(r))) {
			const healthArgs = ["--targets", "--report-only"];
			const covPath = path.resolve(this.projectRoot, "coverage/coverage-final.json");
			if (fs.existsSync(covPath)) healthArgs.push("--coverage", "coverage/coverage-final.json");
			const healthFindings = this.runFallowSubCommand("health", healthArgs, healthRules);
			allFindings.push(...healthFindings.filter((f) => this.isRuleActiveForCurrentRun(f.ruleId)));
		}
		for (const f of allFindings) {
			const relPath = toPosixRelative(this.projectRoot, f.file);
			this.recordScanned(relPath);
			this.addViolation({
				ruleId: f.ruleId,
				ruleDescription: FALLOW_RULE_DESCRIPTIONS[f.ruleId],
				severity: f.severity,
				file: relPath,
				line: f.line,
				message: f.message,
				context: f.context
			});
		}
		this.ensureSubAuditorsLogged();
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new FallowArchitectureAuditor());
//#endregion
export { FALLOW_ALL_PRIORITY_THRESHOLD, FALLOW_CRITICAL_PRIORITY_THRESHOLD, FALLOW_HIGH_PRIORITY_THRESHOLD, FALLOW_LOW_PRIORITY_THRESHOLD, FALLOW_MEDIUM_PRIORITY_THRESHOLD, FALLOW_MODERATE_PRIORITY_THRESHOLD, FALLOW_PRIORITY_MIN_THRESHOLDS, FALLOW_RULES, FALLOW_RULE_CAPABILITIES, FALLOW_RULE_DESCRIPTIONS, FALLOW_RULE_REMEDIATIONS, FALLOW_RULE_REMEDIATION_PHASES, FallowArchitectureAuditor, mapFallowJson, resolveFallowTargetMinThreshold };
