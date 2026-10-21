import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots, toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
//#region src/suites/domain_data/validate_canonical_domains.ts
/**
* packages/auditor/src/suites/domain_data/validate_canonical_domains.ts
*
* CANONICAL DOMAIN CATALOGS & SSoT INTEGRITY AUDITOR (Node.js 26+ Native)
*
* Verifies single source of truth (SSoT) across TypeScript domain types and catalogs:
* 1. Zero collisions between canonical domain catalogs across files.
* 2. Zero repeated ad-hoc string literal unions across multiple files (must define a shared type alias).
* 3. Zero local reinventions of domain types already exported by installed dependencies.
* 4. Zero subsets or uncoordinated duplicates of canonical domain arrays and types.
*/
enableCompileCache();
const CANONICAL_DOMAIN_RULES = [
	"canonical-domain-collision",
	"canonical-domain-repeated-union",
	"canonical-domain-library-duplicate",
	"canonical-domain-subset-mismatch"
];
const EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".vue"]);
const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH = 30;
const MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD = 40;
const UNIVERSAL_SIGNATURE_BLACKLIST = /* @__PURE__ */ new Set([
	"error|warning",
	"error|suggestion|warning",
	"error|info|warning",
	"asc|desc",
	"delete|get|patch|post|put",
	"delete|get|post|put"
]);
function getMatchCoordinates(content, matchIndex, lines) {
	const before = content.slice(0, matchIndex);
	const lineNum = (before.match(/\n/g) ?? []).length + 1;
	return {
		lineNum,
		col: matchIndex - before.lastIndexOf("\n"),
		line: lines[lineNum - 1] ?? ""
	};
}
function hasEscapeHatch(line) {
	return line.includes("// domain-ok:") || line.includes("// lib-duplicate-ok:") || line.includes("// collision-ok:");
}
function extractSortedLiterals(matchStr) {
	const rawLiterals = matchStr.match(/['"`][\w-]+['"`]/g);
	if (!rawLiterals || rawLiterals.length < 2) return null;
	const literals = Array.from(new Set(rawLiterals.map((l) => l.replace(/['"`]/g, "")))).sort();
	if (literals.length < 2) return null;
	return literals;
}
function extractSortedLiteralsSignature(matchStr) {
	const literals = extractSortedLiterals(matchStr);
	return literals ? literals.join("|") : null;
}
function extractValidDomainSignature(matchedSnippet) {
	const literals = extractSortedLiterals(matchedSnippet);
	if (!literals || literals.length < 2) return null;
	if (literals.some((l) => l.includes("/") || l.includes(" ") || l.length > 30)) return null;
	return {
		literals,
		signature: literals.join("|")
	};
}
function forEachValidDomainMatch(content, regex, lines, callback) {
	regex.lastIndex = 0;
	let match;
	while ((match = regex.exec(content)) !== null) {
		const { lineNum, col, line } = getMatchCoordinates(content, match.index, lines);
		if (isCommentLine(line) || hasEscapeHatch(line)) continue;
		callback(match, lineNum, col, line);
	}
}
function detectRepeatedStringUnions(files) {
	const P_GENERIC_STRING_UNION = /(?:\bas\s+|:\s*|\btype\s+[A-Za-z]\w*\s*=\s*)(?:\(\s*)?(?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`]\s*\)?/g;
	const unionOccurrences = /* @__PURE__ */ new Map();
	for (const { file, content } of files) {
		const lines = content.split("\n");
		P_GENERIC_STRING_UNION.lastIndex = 0;
		let match;
		while ((match = P_GENERIC_STRING_UNION.exec(content)) !== null) {
			const { lineNum, col, line } = getMatchCoordinates(content, match.index, lines);
			if (isCommentLine(line) || hasEscapeHatch(line)) continue;
			const signatureKey = extractSortedLiteralsSignature(match[0]);
			if (!signatureKey) continue;
			const finding = {
				file,
				line: lineNum,
				col,
				ruleId: "canonical-domain-repeated-union",
				message: `Repeated ad-hoc string literal union '${signatureKey}' — refactor into canonical domain type alias`,
				snippet: match[0].slice(0, 100).replace(/\n/g, "↵")
			};
			const existing = unionOccurrences.get(signatureKey);
			if (existing) existing.push(finding);
			else unionOccurrences.set(signatureKey, [finding]);
		}
	}
	const repeatedMap = /* @__PURE__ */ new Map();
	for (const [signatureKey, occurrences] of unionOccurrences) if (occurrences.length >= 2) repeatedMap.set(signatureKey, occurrences);
	return repeatedMap;
}
const P_EXPORT_TYPE_UNION = /export\s+type\s+(\w+)\s*=\s*\(?((?:['"][\w-]+['"]\s*\|\s*)+['"][\w-]+['"])\)?/g;
function parseDtsDomainTypes(content, dep, targetMap) {
	P_EXPORT_TYPE_UNION.lastIndex = 0;
	let match;
	while ((match = P_EXPORT_TYPE_UNION.exec(content)) !== null) {
		const typeName = match[1];
		const rawLiterals = match[2].match(/['"][\w-]+['"]/g);
		if (!rawLiterals) continue;
		const literals = Array.from(new Set(rawLiterals.map((l) => l.replace(/['"]/g, "")))).sort();
		if (literals.length < 2) continue;
		const sigKey = literals.join("|");
		if (!UNIVERSAL_SIGNATURE_BLACKLIST.has(sigKey) && !targetMap.has(sigKey)) targetMap.set(sigKey, {
			typeName,
			pkgName: dep,
			signature: sigKey
		});
	}
}
async function scanDepEntries(depDir, dep, targetMap) {
	let entries;
	try {
		entries = await fs.readdir(depDir, {
			recursive: true,
			withFileTypes: true
		});
	} catch {
		return;
	}
	for (const ent of entries) {
		if (ent.isDirectory() || !ent.name.endsWith(".d.ts")) continue;
		const full = path.join(ent.parentPath ?? depDir, ent.name);
		try {
			parseDtsDomainTypes(await fs.readFile(full, "utf8"), dep, targetMap);
		} catch {}
	}
}
async function extractLibraryDomainTypes(root) {
	const libraryTypes = /* @__PURE__ */ new Map();
	const nodeModulesDir = path.join(root, "node_modules");
	const pkgJsonPath = path.join(root, "package.json");
	let pkgJson;
	try {
		const raw = await fs.readFile(pkgJsonPath, "utf8");
		pkgJson = JSON.parse(raw);
	} catch {
		return libraryTypes;
	}
	const allDeps = Object.keys(pkgJson.dependencies || {});
	for (const dep of allDeps) {
		const depDir = path.join(nodeModulesDir, dep);
		try {
			await fs.access(depDir);
		} catch {
			continue;
		}
		await scanDepEntries(depDir, dep, libraryTypes);
	}
	return libraryTypes;
}
function detectLibraryDomainTypeDuplicates(files, libraryTypes) {
	const findings = [];
	if (libraryTypes.size === 0) return findings;
	const P_LITERAL_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*(?::[^=]+)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
	const P_TYPE_UNION_DECL = /\b(?:export\s+)?type\s+(\w+)\s*=\s*(?:\(\s*|\|\s*)?((?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`])/g;
	const P_PROP_UNION_DECL = /\b(\w+)\??:\s*(?:\(\s*|\|\s*)?((?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`])/g;
	const reportIfLibraryDuplicate = (sigKey, file, lineNum, col, snippet, messageBuilder) => {
		if (!sigKey) return;
		const libInfo = libraryTypes.get(sigKey);
		if (libInfo) findings.push({
			file,
			line: lineNum,
			col,
			ruleId: "canonical-domain-library-duplicate",
			message: messageBuilder(libInfo),
			snippet: snippet.slice(0, 100).replace(/\n/g, "↵")
		});
	};
	for (const { file, content } of files) {
		const lines = content.split("\n");
		const scanDeclarations = (regex, getSignatureTarget, msgBuilder, extraFilter) => {
			forEachValidDomainMatch(content, regex, lines, (match, lineNum, col, line) => {
				if (extraFilter && !extraFilter(line)) return;
				const sigKey = extractSortedLiteralsSignature(getSignatureTarget(match));
				reportIfLibraryDuplicate(sigKey, file, lineNum, col, match[0], (lib) => msgBuilder(match[1] ?? "", lib));
			});
		};
		scanDeclarations(P_LITERAL_ARRAY_DECL, (m) => m[0], (name, lib) => `Duplicate of library domain type: '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and use '${lib.typeName}' directly instead of reinventing it locally`);
		scanDeclarations(P_TYPE_UNION_DECL, (m) => m[2] ?? m[0], (name, lib) => `Duplicate of library domain type: type '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and alias '${lib.typeName}' directly instead of re-declaring its union`, (line) => !/\bkeyof\b/.test(line));
		scanDeclarations(P_PROP_UNION_DECL, (m) => m[2] ?? "", (name, lib) => `Duplicate of library domain type: property '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and use '${lib.typeName}' directly instead of re-declaring its union literals`);
	}
	return findings;
}
function extractProjectCanonicalDomains(files, projectRoot) {
	const bySignature = /* @__PURE__ */ new Map();
	const list = [];
	const collisions = [];
	const P_CANONICAL_ARRAY = /\bexport\s+const\s+(\w+)\s*(?::[^=]+)?=\s*\[\s*['"`]([\s\S]*?)\]\s+as\s+const/g;
	const P_CANONICAL_TYPE = /\bexport\s+type\s+(\w+)\s*=\s*\(?((?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`])\)?/g;
	const config = getAuditConfig(projectRoot);
	const typesRoots = config.paths.typesRoots ?? [];
	const dataRoots = config.paths.dataRoots ?? [];
	const logicRoots = config.paths.logicRoots ?? [];
	const getFileScore = (file) => {
		if (typesRoots.some((r) => file.startsWith(r))) return 3;
		if (dataRoots.some((r) => file.startsWith(r))) return 2;
		if (logicRoots.some((r) => file.startsWith(r))) return 1;
		return 0;
	};
	const sortedFiles = [...files].sort((a, b) => getFileScore(b.file) - getFileScore(a.file));
	for (const { file, content } of sortedFiles) {
		if (file.endsWith(".d.ts")) continue;
		const lines = content.split("\n");
		const resolveDomainContext = (rawMatch) => {
			const domain = extractValidDomainSignature(rawMatch);
			if (!domain) return null;
			const isContract = typesRoots.some((r) => file.startsWith(r)) || dataRoots.some((r) => file.startsWith(r));
			return {
				literals: domain.literals,
				signature: domain.signature,
				isContract
			};
		};
		forEachValidDomainMatch(content, P_CANONICAL_ARRAY, lines, (match, lineNum, col, line) => {
			const name = match[1];
			if ([
				"ROUTES",
				"CONFIG",
				"ITEMS",
				"OPTIONS",
				"STYLES",
				"THEMES",
				"MODALS"
			].includes(name)) return;
			const domainCtx = resolveDomainContext(match[0]);
			if (!domainCtx) return;
			const { literals, signature, isContract } = domainCtx;
			const existing = bySignature.get(signature);
			if (existing) {
				if (existing.file !== file && !hasEscapeHatch(line) && !hasEscapeHatch(existing.file)) collisions.push({
					file,
					line: lineNum,
					col,
					ruleId: "canonical-domain-collision",
					message: `Canonical domain collision: '${name}' duplicates canonical domain '${existing.name}' from '${existing.file}:${existing.line}' (${signature}) — unify into a single SSoT contract`,
					snippet: match[0].slice(0, 100).replace(/\n/g, "↵")
				});
			} else registerDomain(name, file, lineNum, col, signature, literals, isContract);
		});
		forEachValidDomainMatch(content, P_CANONICAL_TYPE, lines, (match, lineNum, col) => {
			const name = match[1];
			const domainCtx = resolveDomainContext(match[0]);
			if (!domainCtx) return;
			const { literals, signature, isContract } = domainCtx;
			if (!bySignature.has(signature)) registerDomain(name, file, lineNum, col, signature, literals, isContract);
		});
	}
	function registerDomain(name, file, line, col, signature, literals, isContract) {
		const info = {
			name,
			file,
			line,
			col,
			signature,
			elements: new Set(literals),
			literals,
			isContract
		};
		bySignature.set(signature, info);
		list.push(info);
	}
	return {
		bySignature,
		list,
		collisions
	};
}
const P_ANY_LITERAL_ARRAY = /\b(?:(?:export\s+)?const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
const P_ANY_TYPE_UNION = /\b(?:export\s+)?type\s+(\w+)\s*=\s*(?:\(\s*)?(?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`]\s*\)?/g;
function parseDomainCandidate(m, rawContent, fileLines, targetFile, bySignature) {
	const { lineNum, col, line } = getMatchCoordinates(rawContent, m.index, fileLines);
	if (isCommentLine(line.trim()) || hasEscapeHatch(line)) return null;
	const name = m[1];
	const literals = extractSortedLiterals(m[0]);
	if (!literals || literals.length < 2) return null;
	const signature = literals.join("|");
	const canonicalExact = bySignature.get(signature);
	if (canonicalExact && canonicalExact.file === targetFile && canonicalExact.name === name) return null;
	return {
		lineNum,
		col,
		name,
		literals,
		signature,
		canonicalExact
	};
}
function findBestParentDomain(literals, domainsList, currentFile) {
	let bestParent = null;
	for (const parent of domainsList) {
		if (parent.file === currentFile || parent.literals.length <= literals.length) continue;
		if (!literals.every((l) => parent.elements.has(l))) continue;
		const ratio = literals.length / parent.literals.length;
		const diff = parent.literals.length - literals.length;
		if ((parent.literals.length <= 40 ? literals.length >= 3 && (ratio >= .5 || diff <= 3) : ratio >= .5) && (!bestParent || parent.literals.length < bestParent.literals.length)) bestParent = parent;
	}
	return bestParent;
}
function scanFileArrayDuplicates(file, content, lines, domains, findings) {
	P_ANY_LITERAL_ARRAY.lastIndex = 0;
	let match;
	while ((match = P_ANY_LITERAL_ARRAY.exec(content)) !== null) {
		const cand = parseDomainCandidate(match, content, lines, file, domains.bySignature);
		if (!cand) continue;
		const { lineNum, col, name, literals, canonicalExact } = cand;
		if (canonicalExact) {
			findings.push({
				file,
				line: lineNum,
				col,
				ruleId: "canonical-domain-subset-mismatch",
				message: `Duplicate domain collection: '${name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and use '${canonicalExact.name}' directly instead of re-declaring domain literals`,
				snippet: match[0].slice(0, 100).replace(/\n/g, "↵")
			});
			continue;
		}
		const bestParent = findBestParentDomain(literals, domains.list, file);
		if (bestParent) findings.push({
			file,
			line: lineNum,
			col,
			ruleId: "canonical-domain-subset-mismatch",
			message: `Sub-collection of canonical domain: '${name}' (${literals.length} elements) is a sub-collection of canonical domain '${bestParent.name}' (${bestParent.literals.length} elements) from '${bestParent.file}:${bestParent.line}' — derive from '${bestParent.name}'`,
			snippet: match[0].slice(0, 100).replace(/\n/g, "↵")
		});
	}
}
function scanFileTypeUnionDuplicates(file, content, lines, domains, findings) {
	P_ANY_TYPE_UNION.lastIndex = 0;
	let match;
	while ((match = P_ANY_TYPE_UNION.exec(content)) !== null) {
		const cand = parseDomainCandidate(match, content, lines, file, domains.bySignature);
		if (!cand || !cand.canonicalExact) continue;
		const { lineNum, col, name, canonicalExact } = cand;
		findings.push({
			file,
			line: lineNum,
			col,
			ruleId: "canonical-domain-subset-mismatch",
			message: `Duplicate domain type union: type '${name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and alias '${canonicalExact.name}' directly`,
			snippet: match[0].slice(0, 100).replace(/\n/g, "↵")
		});
	}
}
function detectProjectDomainDuplicatesAndSubsets(files, domains) {
	const findings = [];
	if (domains.list.length === 0) return findings;
	for (const { file, content } of files) {
		if (file.endsWith(".d.ts")) continue;
		const lines = content.split("\n");
		scanFileArrayDuplicates(file, content, lines, domains, findings);
		scanFileTypeUnionDuplicates(file, content, lines, domains, findings);
	}
	return findings;
}
var ValidateCanonicalDomainsAuditor = class extends BaseAuditor {
	constructor(optionsOrTarget) {
		const options = typeof optionsOrTarget === "string" ? { projectRoot: optionsOrTarget } : optionsOrTarget ?? {};
		const projectRoot = options.projectRoot || process.cwd();
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = options.roots ?? config.paths.srcRoots ?? [];
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(CANONICAL_DOMAIN_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_canonical_domains",
			name: "Canonical Domain Catalogs & SSoT Validator",
			description: "Catalog collisions and repeated domain unions",
			family: "domain_data",
			ruleIds: CANONICAL_DOMAIN_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(CANONICAL_DOMAIN_RULES, "contracts"),
			packageName: "Catalogs",
			icon: "📚",
			configKey: "domain.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleDescriptions: {
				"canonical-domain-collision": "Canonical catalog collision",
				"canonical-domain-repeated-union": "Repeated union without canonical alias",
				"canonical-domain-library-duplicate": "Union duplicates library type",
				"canonical-domain-subset-mismatch": "Subset of canonical catalog"
			},
			ruleRemediations: {
				"canonical-domain-collision": "📖 REMEDIATION GUIDE: canonical-domain-collision\n1. Root Cause: Two or more identical canonical declarations (same set of literals) were detected across different project files, violating the Single Source of Truth (SSoT) principle.\n2. Diagnosis: The violation message indicates the file and line of the original and duplicate catalogs.\n3. Canonical Solution:\n   a) Unify the catalogs into a single contract file inside canonical types directory (e.g. src/types/ or src/domain/).\n   b) Delete the duplicate declaration and replace it with an import of the unified catalog.\n4. Example:\n   // ❌ Incorrect: Two or more files declare identical catalogs with different names\n   // ✅ Correct: Unify definition in src/types/ or src/domain/ and import it in consumers.",
				"canonical-domain-repeated-union": "📖 REMEDIATION GUIDE: canonical-domain-repeated-union\n1. Root Cause: An ad-hoc inline string literal union is used in multiple function signatures or interfaces instead of a named canonical type, dispersing the domain and causing desynchronization when a value is added.\n2. Diagnosis: Run \"npm run auditor:findings rule=canonical-domain-repeated-union\" to locate occurrences of the dispersed union.\n3. Canonical Solution:\n   a) Extract the union to a named canonical type alias with \"as const\" or \"type\" in the corresponding types file.\n   b) Replace repeated ad-hoc unions with the reference to the canonical type.\n4. Example:\n   // ❌ Incorrect: Repeat the same literal union inline across multiple functions\n   // ✅ Correct: Centralize in an exported canonical type alias and import it.",
				"canonical-domain-library-duplicate": "📖 REMEDIATION GUIDE: canonical-domain-library-duplicate\n1. Root Cause: The project re-declares locally a union or literal catalog that already exists and is provided by an installed dependency in node_modules.\n2. Diagnosis: The rule message specifies the library and exported type name in its .d.ts definitions that duplicates the local declaration.\n3. Canonical Solution:\n   a) Delete the redundant local declaration.\n   b) Import the type or collection directly from the corresponding package.\n4. Example:\n   // ❌ Incorrect: re-declare types already provided by the library\n   type MyHttpMethod = \"GET\" | \"POST\" | \"PUT\" | \"DELETE\";\n   // ✅ Correct: reuse canonical type from the library or environment\n   // import type { Method } from \"axios\"; or use the standard interface",
				"canonical-domain-subset-mismatch": "📖 REMEDIATION GUIDE: canonical-domain-subset-mismatch\n1. Root Cause: Declared an array or type union that exactly duplicates an existing catalog, or is a substantial subset of a master catalog without deriving from it.\n2. Diagnosis: Check the warning indicating the parent catalog from which the subset is bifurcating.\n3. Canonical Solution:\n   a) If an exact duplicate: delete it and import the master catalog.\n   b) If a subset: derive it via TypeScript utilities such as Extract<ParentType, ...> or constant filtering to preserve the inheritance relationship with master domain.\n4. Example:\n   // ❌ Incorrect: ad-hoc subset disconnected from master catalog\n   type ActivePhase = \"plan\" | \"execute\";\n   // ✅ Correct: safe derivation from master canonical type\n   type ActivePhase = Extract<Phase, \"plan\" | \"execute\">;"
			},
			coverage: {
				include: deriveCoverageFromRoots(effectiveRoots, EXTENSIONS).include,
				exclude: [
					"coverage/**",
					"dist/**",
					"scratch/**",
					".agents/**"
				]
			},
			roots: effectiveRoots,
			allowedExtensions: EXTENSIONS,
			extraIgnorePatterns: [
				"coverage/**",
				"dist/**",
				"scratch/**",
				".agents/**"
			],
			projectRoot
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Dominio desactivado en config")) {
			this.redeclareCoverage({
				include: ["src/**/*.ts"],
				source: "declared-only"
			});
			return;
		}
		const filePaths = this.context.collectFiles(this.roots, this.allowedExtensions);
		if (filePaths.length === 0) {
			for (const r of CANONICAL_DOMAIN_RULES) this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "No se encontraron archivos de código candidatos");
			});
			return;
		}
		const scannedFiles = [];
		for (const fp of filePaths) {
			const rel = toPosixRelative(this.projectRoot, fp);
			if (isTestFileForCodeAudit(rel, this.projectRoot)) continue;
			this.recordScanned(rel);
			try {
				const content = await fs.readFile(fp, "utf8");
				scannedFiles.push({
					file: rel,
					content
				});
			} catch {}
		}
		const allFindings = [];
		this.runSubAuditorSync("canonical-domain-repeated-union", () => {
			const repeatedUnions = detectRepeatedStringUnions(scannedFiles);
			for (const [, occurrences] of repeatedUnions) allFindings.push(...occurrences);
		});
		await this.runSubAuditor("canonical-domain-library-duplicate", async () => {
			const libraryTypes = await extractLibraryDomainTypes(this.projectRoot);
			const libDuplicates = detectLibraryDomainTypeDuplicates(scannedFiles, libraryTypes);
			allFindings.push(...libDuplicates);
		});
		let domainData = {
			bySignature: /* @__PURE__ */ new Map(),
			list: [],
			collisions: []
		};
		this.runSubAuditorSync("canonical-domain-collision", () => {
			domainData = extractProjectCanonicalDomains(scannedFiles, this.projectRoot);
			allFindings.push(...domainData.collisions);
		});
		this.runSubAuditorSync("canonical-domain-subset-mismatch", () => {
			const subsets = detectProjectDomainDuplicatesAndSubsets(scannedFiles, {
				bySignature: domainData.bySignature,
				list: domainData.list
			});
			allFindings.push(...subsets);
		});
		for (const finding of allFindings) this.addViolation({
			ruleId: finding.ruleId,
			severity: "error",
			file: finding.file,
			line: finding.line,
			column: finding.col,
			message: finding.message,
			context: finding.snippet
		});
		this.context.setMetric("Scanned files", scannedFiles.length);
		this.context.setMetric("Canonical findings", allFindings.length);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateCanonicalDomainsAuditor());
//#endregion
export { CANONICAL_DOMAIN_RULES, MAX_CANONICAL_DOMAIN_LITERAL_LENGTH, MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD, ValidateCanonicalDomainsAuditor, detectLibraryDomainTypeDuplicates, detectProjectDomainDuplicatesAndSubsets, detectRepeatedStringUnions, extractLibraryDomainTypes, extractProjectCanonicalDomains, extractSortedLiterals, extractSortedLiteralsSignature };
