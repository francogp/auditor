import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import { BaseAuditor, collectRepositoryFiles, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { buildRepositoryFileIndex } from "../../core/safePath.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { DEFAULT_SCAN_DIRECTORIES, resolveMarkdownScanDirectories, stripCodeBlocks } from "./validate_markdown_code_references.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_markdown_links.ts
/**
* scripts/auditors/documentation/validate_markdown_links.ts
*
* RELATIVE MARKDOWN LINK & DOX INTEGRITY AUDITOR (Node.js 26+ Native)
*
* Scans all documentation (.md), skill manuals (SKILL.md), reference guides,
* and DOX index files (AGENTS.md) across the codebase.
*
* Validates that:
*   1. All relative links point to existent files/directories on disk.
*   2. No broken links, miscalculated folder depths, or nonexistent targets exist.
*   3. No forbidden absolute paths (file://, /home/...) or stale environment references.
*   4. No links target git-ignored resources (.gitignore).
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_markdown_links.ts
*   npm run validate:markdown-links
*/
enableCompileCache();
const MARKDOWN_LINK_RULES = [
	"markdown-broken-relative-link",
	"markdown-absolute-path",
	"markdown-stale-environment-path",
	"markdown-gitignored-target",
	"markdown-broken-workspace-package"
];
const DEFAULT_ROOT = path.resolve(import.meta.dirname, "../../..");
const DEFAULT_MARKDOWN_IGNORE_PATTERNS = ["coverage/**"];
let gitIgnoreMatcherInstance = null;
function getGitIgnoreMatcher(rootDir) {
	if (!gitIgnoreMatcherInstance) gitIgnoreMatcherInstance = new GitIgnoreMatcher(rootDir);
	return gitIgnoreMatcherInstance;
}
let repoFileIndexCache = null;
let repoFileIndexCacheRoot = null;
function clearRepoFileIndexCache() {
	repoFileIndexCache = null;
	repoFileIndexCacheRoot = null;
}
function clearGitIgnoredPathsCache() {
	gitIgnoreMatcherInstance = null;
	clearRepoFileIndexCache();
}
function getRepoFileIndex(rootDir, matcher) {
	if (repoFileIndexCache && repoFileIndexCacheRoot === rootDir) return repoFileIndexCache;
	const index = buildRepositoryFileIndex(rootDir, (p) => matcher.isIgnored(p));
	repoFileIndexCache = index;
	repoFileIndexCacheRoot = rootDir;
	return index;
}
/**
* Collects all relevant markdown files (.md) recursively.
*/
function collectMarkdownFiles(targetPath, rootDir, extraIgnorePatterns = DEFAULT_MARKDOWN_IGNORE_PATTERNS) {
	const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
	if (!fs.existsSync(fullPath)) return [];
	if (fs.statSync(fullPath).isFile()) return fullPath.endsWith(".md") ? [fullPath] : [];
	return collectRepositoryFiles(fullPath, rootDir, extraIgnorePatterns, /* @__PURE__ */ new Set([".md"]), /* @__PURE__ */ new Set([".agents"]));
}
/** Regex detecting personal machine absolute paths (e.g. /home/user, /Users/user, C:\Users\user) */
const STALE_ENV_PATH_REGEX = /file:\/\/\/(?:home|Users|[a-zA-Z]:)|(?:^|(?<![\w.]))\/(?:home|Users)\/[\w-]+|[a-zA-Z]:[\\/]Users[\\/][\w-]+/;
function isExternalOrAnchorLink(rawUrl) {
	return rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("mailto:") || rawUrl.startsWith("conversation://") || rawUrl.startsWith("#");
}
function resolveLocalMarkdownTarget(docFile, rawUrl) {
	if (isExternalOrAnchorLink(rawUrl) || path.isAbsolute(rawUrl) || /^[a-z]:/i.test(rawUrl) || rawUrl.startsWith("file://")) return null;
	const [rawPath] = rawUrl.split("#");
	let urlPath = rawPath ?? "";
	try {
		urlPath = decodeURIComponent(urlPath);
	} catch {}
	return urlPath.length > 0 ? path.resolve(path.dirname(docFile), urlPath) : docFile;
}
function formatCandidateMatchError(resolvedRelPath, candidateMatches, sourceDir, rootDir) {
	if (candidateMatches.length === 0) return `Target path does not exist on disk: "${resolvedRelPath}"`;
	const suggestions = candidateMatches.map((cand) => {
		let rel = toPosixRelative(sourceDir, cand);
		if (!rel.startsWith(".")) rel = "./" + rel;
		return rel;
	});
	return `Target path does not exist on disk: "${resolvedRelPath}", pero aparentemente fue localizado en: "${candidateMatches.map((cand) => toPosixRelative(rootDir, cand)).join(", ")}". Verifica si corresponde corregir el enlace a: "${suggestions.join("\" o \"")}"`;
}
function checkTargetExistence(params) {
	const resolvedTarget = resolveLocalMarkdownTarget(params.filePath, params.rawUrl);
	if (!resolvedTarget) return null;
	const resolvedRelPath = toPosixRelative(params.rootDir, resolvedTarget);
	const matcher = getGitIgnoreMatcher(params.rootDir);
	if (matcher.isIgnored(resolvedTarget)) return {
		sourceFile: params.relSourceFile,
		linkText: params.linkText,
		rawUrl: params.rawUrl,
		resolvedPath: resolvedRelPath,
		error: `Target path is ignored by git (.gitignore) and will not exist in clean checkouts or CI: "${resolvedRelPath}"`,
		ruleId: "markdown-gitignored-target",
		line: params.line
	};
	if (!fs.existsSync(resolvedTarget)) {
		const basename = path.basename(resolvedTarget);
		const error = formatCandidateMatchError(resolvedRelPath, (getRepoFileIndex(params.rootDir, matcher).get(basename) ?? []).filter((cand) => !matcher.isIgnored(cand)), path.dirname(params.filePath), params.rootDir);
		return {
			sourceFile: params.relSourceFile,
			linkText: params.linkText,
			rawUrl: params.rawUrl,
			resolvedPath: resolvedRelPath,
			error,
			ruleId: "markdown-broken-relative-link",
			line: params.line
		};
	}
	return null;
}
function checkSingleMarkdownLink(params) {
	const { linkText, rawUrl, line, relSourceFile } = params;
	if (STALE_ENV_PATH_REGEX.test(rawUrl) || STALE_ENV_PATH_REGEX.test(linkText)) return {
		checked: true,
		brokenLink: {
			sourceFile: relSourceFile,
			linkText,
			rawUrl,
			resolvedPath: "",
			error: `Stale legacy environment path detected: "${rawUrl}" (RULE: No references to legacy repository or personal machine paths)`,
			ruleId: "markdown-stale-environment-path",
			line
		}
	};
	if (rawUrl.startsWith("file://") || rawUrl.startsWith("/") || rawUrl.startsWith("\\") || /^[a-z]:/i.test(rawUrl) || path.isAbsolute(rawUrl)) return {
		checked: true,
		brokenLink: {
			sourceFile: relSourceFile,
			linkText,
			rawUrl,
			resolvedPath: "",
			error: `Forbidden absolute path or file:// URL: "${rawUrl}" (RULE: Use relative paths exclusively)`,
			ruleId: "markdown-absolute-path",
			line
		}
	};
	if (isExternalOrAnchorLink(rawUrl)) return { checked: false };
	return {
		checked: true,
		brokenLink: checkTargetExistence(params) ?? void 0
	};
}
function checkStandaloneTextViolations(lines, relSourceFile, brokenLines) {
	const textViolations = [];
	for (let i = 0; i < lines.length; i++) {
		const lineText = lines[i];
		const lineNum = i + 1;
		if (brokenLines.has(lineNum)) continue;
		const textWithoutInlineCode = lineText.replace(/`[^`\n]+`/g, "");
		if (STALE_ENV_PATH_REGEX.test(textWithoutInlineCode)) textViolations.push({
			sourceFile: relSourceFile,
			linkText: "",
			rawUrl: lineText.trim(),
			resolvedPath: "",
			error: `Stale legacy environment reference detected in text: "${lineText.trim()}"`,
			ruleId: "markdown-stale-environment-path",
			line: lineNum
		});
		else if (/file:\/\/\/[^\s)]+/i.test(textWithoutInlineCode)) textViolations.push({
			sourceFile: relSourceFile,
			linkText: "",
			rawUrl: lineText.trim(),
			resolvedPath: "",
			error: `Forbidden absolute file:// URL detected in text: "${lineText.trim()}"`,
			ruleId: "markdown-absolute-path",
			line: lineNum
		});
	}
	return textViolations;
}
const HISTORICAL_OR_EXAMPLE_LINE_REGEX = /\b(?:migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa]|example|ejemplo)\b|\be\.g\./i;
const isHistoricalOrExampleLine = (lineText) => HISTORICAL_OR_EXAMPLE_LINE_REGEX.test(lineText);
function checkPackageMatchViolation(match, relSourceFile, filePath, rootDir, lineNum) {
	const pkgSubpath = match[1].replace(/[.,:;)\]`'"]+$/, "");
	if (pkgSubpath.includes("*") || pkgSubpath.includes("...") || pkgSubpath.includes("<")) return null;
	const candidateRel = path.join("packages", pkgSubpath);
	const rootTarget = path.resolve(rootDir, candidateRel);
	const localTarget = path.resolve(path.dirname(filePath), candidateRel);
	if (!fs.existsSync(rootTarget) && !fs.existsSync(localTarget)) return {
		sourceFile: relSourceFile,
		linkText: "",
		rawUrl: `packages/${pkgSubpath}`,
		resolvedPath: candidateRel,
		error: `Referencia a workspace package inexistente en disco: "packages/${pkgSubpath}" (RULE: No mantener rutas a paquetes de workspace eliminados)`,
		ruleId: "markdown-broken-workspace-package",
		line: lineNum
	};
	return null;
}
function checkWorkspacePackageViolations(lines, relSourceFile, filePath, rootDir, brokenLines) {
	const violations = [];
	const pkgRegex = /(?:^|[`'"\s([<])(?:\/|\.\/|\.\.\/)?packages\/([\w.-]+(?:\/[\w./#-]+)?)\/?(?:$|[`'"\s)\]>,:;])/g;
	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1;
		if (brokenLines.has(lineNum) || isHistoricalOrExampleLine(lines[i])) continue;
		pkgRegex.lastIndex = 0;
		let match;
		while ((match = pkgRegex.exec(lines[i])) !== null) {
			const violation = checkPackageMatchViolation(match, relSourceFile, filePath, rootDir, lineNum);
			if (violation) violations.push(violation);
		}
	}
	return violations;
}
/**
* Extracts all markdown links from markdown content outside code blocks.
*/
function extractMarkdownLinks(content) {
	const cleanContent = stripCodeBlocks(content);
	const contentWithoutInlineCode = cleanContent.replace(/(`+)[^`\n]+\1/g, (match) => " ".repeat(match.length));
	const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
	const links = [];
	let match;
	while ((match = linkRegex.exec(contentWithoutInlineCode)) !== null) {
		const linkText = match[1].trim();
		const rawUrl = match[2].trim().replace(/^[`'"]+|[`'"]+$/g, "");
		const line = cleanContent.slice(0, match.index).split("\n").length;
		links.push({
			linkText,
			rawUrl,
			line
		});
	}
	return links;
}
/**
* Parses all markdown links in a file and returns broken references or illegal paths.
*/
function checkMarkdownLinksInContent(content, filePath, rootDir) {
	const cleanContent = stripCodeBlocks(content);
	const links = extractMarkdownLinks(content);
	const brokenLinks = [];
	let linksChecked = 0;
	const relSourceFile = toPosixRelative(rootDir, filePath);
	for (const { linkText, rawUrl, line } of links) {
		const result = checkSingleMarkdownLink({
			linkText,
			rawUrl,
			line,
			relSourceFile,
			filePath,
			rootDir
		});
		if (result.checked) linksChecked++;
		if (result.brokenLink) brokenLinks.push(result.brokenLink);
	}
	const brokenLines = new Set(brokenLinks.map((b) => b.line).filter((l) => l !== void 0));
	const standaloneViolations = checkStandaloneTextViolations(cleanContent.split("\n"), relSourceFile, brokenLines);
	brokenLinks.push(...standaloneViolations);
	const workspaceViolations = checkWorkspacePackageViolations(cleanContent.split("\n"), relSourceFile, filePath, rootDir, brokenLines);
	brokenLinks.push(...workspaceViolations);
	return {
		linksChecked,
		brokenLinks
	};
}
/**
* Runs the full markdown link audit.
*/
function auditMarkdownLinks(options = {}) {
	const root = options.rootDir ?? DEFAULT_ROOT;
	const scanDirs = options.scanPaths ?? resolveMarkdownScanDirectories(root);
	const extraIgnores = options.extraIgnorePatterns ?? DEFAULT_MARKDOWN_IGNORE_PATTERNS;
	const fileSet = /* @__PURE__ */ new Set();
	for (const dir of scanDirs) {
		const files = collectMarkdownFiles(dir, root, extraIgnores);
		for (const f of files) fileSet.add(f);
	}
	const allFiles = Array.from(fileSet);
	let totalLinks = 0;
	const violations = [];
	for (const filePath of allFiles) {
		const { linksChecked, brokenLinks } = checkMarkdownLinksInContent(fs.readFileSync(filePath, "utf-8"), filePath, root);
		totalLinks += linksChecked;
		violations.push(...brokenLinks);
	}
	return {
		filesScanned: allFiles.length,
		linksChecked: totalLinks,
		violations,
		passed: violations.length === 0
	};
}
var MarkdownLinkAuditor = class extends BaseAuditor {
	scanRoots;
	constructor(scanRoots, projectRoot) {
		const effectiveScanRoots = resolveMarkdownScanDirectories(projectRoot, scanRoots);
		const config = getAuditConfig(projectRoot);
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(MARKDOWN_LINK_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_markdown_links",
			name: "Markdown & DOX Relative Links Auditor",
			description: "Enlaces relativos y rutas válidas en markdown",
			family: "documentation",
			ruleIds: MARKDOWN_LINK_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(MARKDOWN_LINK_RULES, "polish"),
			packageName: "Doc",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🔗",
			ruleDescriptions: {
				"markdown-broken-relative-link": "Enlace relativo roto",
				"markdown-absolute-path": "Ruta absoluta prohibida",
				"markdown-stale-environment-path": "Referencia a entorno obsoleto",
				"markdown-gitignored-target": "Enlace a ruta ignorada en git",
				"markdown-broken-workspace-package": "Workspace package inexistente"
			},
			ruleRemediations: {
				"markdown-broken-relative-link": "📖 GUÍA DE REMEDIACIÓN: markdown-broken-relative-link\n1. Causa Raíz: Un enlace relativo en formato Markdown `[texto](./ruta/destino.md)` o enlace con ancla `#seccion` apunta a un archivo o encabezado que no existe.\n2. Diagnóstico: Verifica la ruta del enlace reportado en la línea indicada y comprueba si el archivo de destino existe relativamente respecto al documento actual.\n3. Solución Canónica:\n   a) Corrige la ruta relativa al archivo existente.\n   b) Si el archivo fue movido, ajusta los saltos de directorio (`../`).\n   c) Si el ancla `#heading` cambió de nombre, actualiza el slug del encabezado.\n4. Ejemplo:\n   ❌ Incorrecto: `[Guía](./docs/guide.md)` (cuando el archivo está en `../docs/guide.md`)\n   ✅ Correcto:   `[Guía](../docs/guide.md)`",
				"markdown-absolute-path": "📖 GUÍA DE REMEDIACIÓN: markdown-absolute-path\n1. Causa Raíz: Se encontró una ruta absoluta de la máquina local (ej: raíz del sistema o rutas fijas de usuario) en un enlace o texto de documentación. Las rutas absolutas rompen la portabilidad y filtran datos del entorno local.\n2. Diagnóstico: Ubica la ruta absoluta señalada en el archivo Markdown.\n3. Solución Canónica: Convierte la ruta absoluta en una ruta relativa al repositorio o al archivo actual, o utiliza la sintaxis canónica `file:///ruta/relativa`.\n4. Ejemplo:\n   ❌ Incorrecto: `[Config](file:///root/users/user/project/audit.config.ts)`\n   ✅ Correcto:   `[Config](file:///.auditor/audit.config.ts)`",
				"markdown-stale-environment-path": "📖 GUÍA DE REMEDIACIÓN: markdown-stale-environment-path\n1. Causa Raíz: La documentación hace referencia a directorios o rutas de entornos obsoletos que ya no forman parte de la arquitectura del proyecto.\n2. Diagnóstico: Inspecciona el término reportado y busca su equivalente actual en la documentación de arquitectura.\n3. Solución Canónica: Sustituye la referencia obsoleta por la ruta del subsistema canónico vigente.\n4. Ejemplo:\n   - Actualizar referencias a carpetas legacy ya eliminadas.",
				"markdown-gitignored-target": "📖 GUÍA DE REMEDIACIÓN: markdown-gitignored-target\n1. Causa Raíz: Un enlace en Markdown apunta a un archivo o carpeta que está ignorado por Git (por ejemplo `dist/`, `scratch/`, `coverage/`, `node_modules/`). Los usuarios que clonen el repositorio no dispondrán de dicho archivo.\n2. Diagnóstico: Comprueba el archivo de destino del enlace contra las reglas de `.gitignore`.\n3. Solución Canónica:\n   a) Enlaza a la fuente original del artefacto (ej: `src/` en lugar de `dist/`).\n   b) Si el enlace es ilustrativo sobre un artefacto generado, documéntalo en un bloque de código explicativo en lugar de un enlace hipertexto navegable.\n4. Ejemplo:\n   ❌ Incorrecto: `[Ver cobertura](file:///coverage/index.html)`\n   ✅ Correcto:   `Consulta el reporte generado en `scratch/coverage/` tras ejecutar los tests.`",
				"markdown-broken-workspace-package": "📖 GUÍA DE REMEDIACIÓN: markdown-broken-workspace-package\n1. Causa Raíz: Un enlace o referencia en Markdown apunta a un paquete del monorepo (`packages/<pkg>`) que no existe o fue renombrado.\n2. Diagnóstico: Revisa el paquete indicado en la violación y verifica la lista de workspaces en `pnpm-workspace.yaml` o `package.json`.\n3. Solución Canónica: Corrige el nombre del paquete o actualiza la ruta al workspace válido.\n4. Ejemplo:\n   ❌ Incorrecto: `packages/old-utils`\n   ✅ Correcto:   `packages/core-utils`"
			},
			coverage: { include: ["**/*.md"] },
			roots: effectiveScanRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".md"]),
			extraIgnorePatterns: [
				...DEFAULT_MARKDOWN_IGNORE_PATTERNS,
				...config.paths.ignoreGlobs ?? [],
				...config.paths.ignoredPatterns ?? []
			],
			unignoreDirs: [".agents"],
			projectRoot
		});
		this.scanRoots = effectiveScanRoots;
	}
	async runAudit() {
		const mdFiles = this.context.collectFiles(this.scanRoots, /* @__PURE__ */ new Set([".md"]));
		if (mdFiles.length === 0) {
			for (const r of MARKDOWN_LINK_RULES) this.markRuleNotApplicable(r, "No se encontraron archivos markdown");
			return;
		}
		for (const f of mdFiles) this.recordScanned(f);
		const docs = [];
		let totalLinks = 0;
		for (const filePath of mdFiles) {
			const content = fs.readFileSync(filePath, "utf-8");
			const cleanContent = stripCodeBlocks(content);
			const links = extractMarkdownLinks(content);
			totalLinks += links.length;
			docs.push({
				file: filePath,
				relSourceFile: toPosixRelative(this.projectRoot, filePath),
				lines: cleanContent.split("\n"),
				links
			});
		}
		const scanDocLines = (ruleId, matcherFn, msgFn) => {
			for (const doc of docs) for (let i = 0; i < doc.lines.length; i++) {
				const lineText = doc.lines[i];
				if (matcherFn(lineText.replace(/`[^`\n]+`/g, ""))) this.addViolation({
					ruleId,
					severity: "error",
					file: doc.relSourceFile,
					line: i + 1,
					message: msgFn(lineText.trim()),
					context: lineText.trim()
				});
			}
		};
		this.runSubAuditorSync("markdown-absolute-path", () => {
			for (const doc of docs) for (const link of doc.links) if (link.rawUrl.startsWith("file://") || link.rawUrl.startsWith("/") || link.rawUrl.startsWith("\\") || /^[a-z]:/i.test(link.rawUrl) || path.isAbsolute(link.rawUrl)) this.addViolation({
				ruleId: "markdown-absolute-path",
				severity: "error",
				file: doc.relSourceFile,
				line: link.line,
				message: `Forbidden absolute path or file:// URL: "${link.rawUrl}" (RULE: Use relative paths exclusively)`,
				context: link.rawUrl
			});
			scanDocLines("markdown-absolute-path", (text) => /file:\/\/\/[^\s)]+/i.test(text), (trimmed) => `Forbidden absolute file:// URL detected in text: "${trimmed}"`);
		});
		this.runSubAuditorSync("markdown-stale-environment-path", () => {
			for (const doc of docs) for (const link of doc.links) if (STALE_ENV_PATH_REGEX.test(link.rawUrl) || STALE_ENV_PATH_REGEX.test(link.linkText)) this.addViolation({
				ruleId: "markdown-stale-environment-path",
				severity: "error",
				file: doc.relSourceFile,
				line: link.line,
				message: `Stale legacy environment path detected: "${link.rawUrl}" (RULE: No references to legacy repository or personal machine paths)`,
				context: link.rawUrl
			});
			scanDocLines("markdown-stale-environment-path", (text) => STALE_ENV_PATH_REGEX.test(text), (trimmed) => `Stale legacy environment reference detected in text: "${trimmed}"`);
		});
		const forEachResolvedLocalLink = (callback) => {
			for (const doc of docs) for (const link of doc.links) {
				const target = resolveLocalMarkdownTarget(doc.file, link.rawUrl);
				if (target) callback(doc, link, target);
			}
		};
		this.runSubAuditorSync("markdown-gitignored-target", () => {
			const matcher = getGitIgnoreMatcher(this.projectRoot);
			forEachResolvedLocalLink((doc, link, resolvedTarget) => {
				if (matcher.isIgnored(resolvedTarget)) {
					const resolvedRelPath = toPosixRelative(this.projectRoot, resolvedTarget);
					this.addViolation({
						ruleId: "markdown-gitignored-target",
						severity: "error",
						file: doc.relSourceFile,
						line: link.line,
						message: `Target path is ignored by git (.gitignore) and will not exist in clean checkouts or CI: "${resolvedRelPath}"`,
						context: link.rawUrl
					});
				}
			});
		});
		this.runSubAuditorSync("markdown-broken-relative-link", () => {
			const matcher = getGitIgnoreMatcher(this.projectRoot);
			const repoIndex = getRepoFileIndex(this.projectRoot, matcher);
			forEachResolvedLocalLink((doc, link, resolvedTarget) => {
				if (matcher.isIgnored(resolvedTarget)) return;
				if (!fs.existsSync(resolvedTarget)) {
					const resolvedRelPath = toPosixRelative(this.projectRoot, resolvedTarget);
					const basename = path.basename(resolvedTarget);
					const errorMsg = formatCandidateMatchError(resolvedRelPath, (repoIndex.get(basename) ?? []).filter((cand) => !matcher.isIgnored(cand)), path.dirname(doc.file), this.projectRoot);
					this.addViolation({
						ruleId: "markdown-broken-relative-link",
						severity: "error",
						file: doc.relSourceFile,
						line: link.line,
						message: errorMsg,
						context: link.rawUrl
					});
				}
			});
		});
		this.runSubAuditorSync("markdown-broken-workspace-package", () => {
			const pkgRegex = /(?:^|[`'"\s([<])(?:\/|\.\/|\.\.\/)?packages\/([\w.-]+(?:\/[\w./#-]+)?)\/?(?:$|[`'"\s)\]>,:;])/g;
			for (const doc of docs) for (let i = 0; i < doc.lines.length; i++) {
				const lineText = doc.lines[i];
				if (isHistoricalOrExampleLine(lineText)) continue;
				pkgRegex.lastIndex = 0;
				let match;
				while ((match = pkgRegex.exec(lineText)) !== null) {
					const violation = checkPackageMatchViolation(match, doc.relSourceFile, doc.file, this.projectRoot, i + 1);
					if (violation) this.addViolation({
						ruleId: "markdown-broken-workspace-package",
						severity: "error",
						file: violation.sourceFile,
						line: violation.line ?? 1,
						message: violation.error,
						context: violation.rawUrl
					});
				}
			}
		});
		this.context.setMetric("Markdown files scanned", mdFiles.length);
		this.context.setMetric("Relative links verified", totalLinks);
		this.context.setMetric("Broken link violations", this.getFindings().length);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownLinkAuditor());
//#endregion
export { DEFAULT_MARKDOWN_IGNORE_PATTERNS, DEFAULT_SCAN_DIRECTORIES, MARKDOWN_LINK_RULES, MarkdownLinkAuditor, auditMarkdownLinks, checkMarkdownLinksInContent, clearGitIgnoredPathsCache, clearRepoFileIndexCache, collectMarkdownFiles, extractMarkdownLinks, getGitIgnoreMatcher, resolveMarkdownScanDirectories, stripCodeBlocks };
