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
import fs from 'node:fs/promises';
import { enableCompileCache } from 'node:module';
import path from 'node:path';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const CANONICAL_DOMAIN_RULES = [
    'canonical-domain-collision',
    'canonical-domain-repeated-union',
    'canonical-domain-library-duplicate',
    'canonical-domain-subset-mismatch'
];
const EXTENSIONS = new Set(['.ts', '.vue']); // runtime-set: Fast O(1) file extensions set
export const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH = 30;
export const MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD = 40;
const UNIVERSAL_SIGNATURE_EXEMPTIONS = [
    'error|warning',
    'error|suggestion|warning',
    'error|info|warning',
    'asc|desc',
    'delete|get|patch|post|put',
    'delete|get|post|put'
];
const UNIVERSAL_SIGNATURE_BLACKLIST = new Set(UNIVERSAL_SIGNATURE_EXEMPTIONS);
function getMatchCoordinates(content, matchIndex, lines) {
    const before = content.slice(0, matchIndex);
    const lineNum = (before.match(/\n/g) ?? []).length + 1;
    const lastNl = before.lastIndexOf('\n');
    const col = matchIndex - lastNl;
    const line = lines[lineNum - 1] ?? '';
    return { lineNum, col, line };
}
function hasEscapeHatch(line) {
    return line.includes('// domain-ok:') || line.includes('// lib-duplicate-ok:') || line.includes('// collision-ok:');
}
export function extractSortedLiterals(matchStr) {
    const rawLiterals = matchStr.match(/['"`][\w-]+['"`]/g);
    if (!rawLiterals || rawLiterals.length < 2)
        return null;
    const literals = Array.from(new Set(rawLiterals.map(l => l.replace(/['"`]/g, '')))).sort();
    if (literals.length < 2)
        return null;
    return literals;
}
export function extractSortedLiteralsSignature(matchStr) {
    const literals = extractSortedLiterals(matchStr);
    return literals ? literals.join('|') : null;
}
function extractValidDomainSignature(matchedSnippet) {
    const literals = extractSortedLiterals(matchedSnippet);
    if (!literals || literals.length < 2)
        return null;
    if (literals.some(l => l.includes('/') || l.includes(' ') || l.length > MAX_CANONICAL_DOMAIN_LITERAL_LENGTH))
        return null;
    return { literals, signature: literals.join('|') };
}
function forEachValidDomainMatch(content, regex, lines, callback) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const { lineNum, col, line } = getMatchCoordinates(content, match.index, lines);
        if (isCommentLine(line) || hasEscapeHatch(line))
            continue;
        callback(match, lineNum, col, line);
    }
}
export function detectRepeatedStringUnions(files) {
    const P_GENERIC_STRING_UNION = /(?:\bas\s+|:\s*|\btype\s+[A-Za-z]\w*\s*=\s*)(?:\(\s*)?(?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`]\s*\)?/g;
    const unionOccurrences = new Map();
    for (const { file, content } of files) {
        const lines = content.split('\n');
        P_GENERIC_STRING_UNION.lastIndex = 0;
        let match;
        while ((match = P_GENERIC_STRING_UNION.exec(content)) !== null) {
            const { lineNum, col, line } = getMatchCoordinates(content, match.index, lines);
            if (isCommentLine(line) || hasEscapeHatch(line))
                continue;
            const signatureKey = extractSortedLiteralsSignature(match[0]);
            if (!signatureKey)
                continue;
            const finding = {
                file,
                line: lineNum,
                col,
                ruleId: 'canonical-domain-repeated-union',
                message: `Repeated ad-hoc string literal union '${signatureKey}' — refactor into canonical domain type alias`,
                snippet: match[0].slice(0, 100).replace(/\n/g, '↵')
            };
            const existing = unionOccurrences.get(signatureKey);
            if (existing)
                existing.push(finding);
            else
                unionOccurrences.set(signatureKey, [finding]);
        }
    }
    const repeatedMap = new Map();
    for (const [signatureKey, occurrences] of unionOccurrences) {
        if (occurrences.length >= 2) {
            repeatedMap.set(signatureKey, occurrences);
        }
    }
    return repeatedMap;
}
const P_EXPORT_TYPE_UNION = /export\s+type\s+(\w+)\s*=\s*\(?((?:['"][\w-]+['"]\s*\|\s*)+['"][\w-]+['"])\)?/g;
function parseDtsDomainTypes(content, dep, targetMap) {
    P_EXPORT_TYPE_UNION.lastIndex = 0;
    let match;
    while ((match = P_EXPORT_TYPE_UNION.exec(content)) !== null) {
        const typeName = match[1];
        const rawUnion = match[2];
        const rawLiterals = rawUnion.match(/['"][\w-]+['"]/g);
        if (!rawLiterals)
            continue;
        const literals = Array.from(new Set(rawLiterals.map(l => l.replace(/['"]/g, '')))).sort();
        if (literals.length < 2)
            continue;
        const sigKey = literals.join('|');
        if (!UNIVERSAL_SIGNATURE_BLACKLIST.has(sigKey) && !targetMap.has(sigKey)) {
            targetMap.set(sigKey, { typeName, pkgName: dep, signature: sigKey });
        }
    }
}
async function scanDepEntries(depDir, dep, targetMap) {
    let entries;
    try {
        entries = await fs.readdir(depDir, { recursive: true, withFileTypes: true });
    }
    catch {
        return;
    }
    for (const ent of entries) {
        if (ent.isDirectory() || !ent.name.endsWith('.d.ts'))
            continue;
        const full = path.join(ent.parentPath ?? depDir, ent.name);
        try {
            const content = await fs.readFile(full, 'utf8');
            parseDtsDomainTypes(content, dep, targetMap);
        }
        catch {
            // catch-ok: unreadable file
        }
    }
}
export async function extractLibraryDomainTypes(root) {
    const libraryTypes = new Map();
    const nodeModulesDir = path.join(root, 'node_modules');
    const pkgJsonPath = path.join(root, 'package.json');
    let pkgJson;
    try {
        const raw = await fs.readFile(pkgJsonPath, 'utf8');
        pkgJson = JSON.parse(raw);
    }
    catch {
        return libraryTypes;
    }
    const allDeps = Object.keys(pkgJson.dependencies || {});
    for (const dep of allDeps) {
        const depDir = path.join(nodeModulesDir, dep);
        try {
            await fs.access(depDir);
        }
        catch {
            continue;
        }
        await scanDepEntries(depDir, dep, libraryTypes);
    }
    return libraryTypes;
}
export function detectLibraryDomainTypeDuplicates(files, libraryTypes) {
    const findings = [];
    if (libraryTypes.size === 0)
        return findings;
    const P_LITERAL_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*(?::[^=]+)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
    const P_TYPE_UNION_DECL = /\b(?:export\s+)?type\s+(\w+)\s*=\s*(?:\(\s*|\|\s*)?((?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`])/g;
    const P_PROP_UNION_DECL = /\b(\w+)\??:\s*(?:\(\s*|\|\s*)?((?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`])/g;
    const reportIfLibraryDuplicate = (sigKey, file, lineNum, col, snippet, messageBuilder) => {
        if (!sigKey)
            return;
        const libInfo = libraryTypes.get(sigKey);
        if (libInfo) {
            findings.push({
                file,
                line: lineNum,
                col,
                ruleId: 'canonical-domain-library-duplicate',
                message: messageBuilder(libInfo),
                snippet: snippet.slice(0, 100).replace(/\n/g, '↵')
            });
        }
    };
    for (const { file, content } of files) {
        const lines = content.split('\n');
        const scanDeclarations = (regex, getSignatureTarget, msgBuilder, extraFilter) => {
            forEachValidDomainMatch(content, regex, lines, (match, lineNum, col, line) => {
                if (extraFilter && !extraFilter(line))
                    return;
                const sigKey = extractSortedLiteralsSignature(getSignatureTarget(match));
                reportIfLibraryDuplicate(sigKey, file, lineNum, col, match[0], (lib) => msgBuilder(match[1] ?? '', lib));
            });
        };
        scanDeclarations(P_LITERAL_ARRAY_DECL, (m) => m[0], (name, lib) => `Duplicate of library domain type: '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and use '${lib.typeName}' directly instead of reinventing it locally`);
        scanDeclarations(P_TYPE_UNION_DECL, (m) => m[2] ?? m[0], (name, lib) => `Duplicate of library domain type: type '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and alias '${lib.typeName}' directly instead of re-declaring its union`, (line) => !/\bkeyof\b/.test(line));
        scanDeclarations(P_PROP_UNION_DECL, (m) => m[2] ?? '', (name, lib) => `Duplicate of library domain type: property '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and use '${lib.typeName}' directly instead of re-declaring its union literals`);
    }
    return findings;
}
export function extractProjectCanonicalDomains(files, projectRoot) {
    const bySignature = new Map();
    const list = [];
    const collisions = [];
    const P_CANONICAL_ARRAY = /\bexport\s+const\s+(\w+)\s*(?::[^=]+)?=\s*\[\s*['"`]([\s\S]*?)\]\s+as\s+const/g;
    const P_CANONICAL_TYPE = /\bexport\s+type\s+(\w+)\s*=\s*\(?((?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`])\)?/g;
    const config = getAuditConfig(projectRoot);
    const typesRoots = config.paths.typesRoots ?? ['src/types'];
    const dataRoots = config.paths.dataRoots ?? ['src/data'];
    const logicRoots = config.paths.logicRoots ?? ['src/logic'];
    const getFileScore = (file) => {
        if (typesRoots.some(r => file.startsWith(r)))
            return 3;
        if (dataRoots.some(r => file.startsWith(r)))
            return 2;
        if (logicRoots.some(r => file.startsWith(r)))
            return 1;
        return 0;
    };
    const sortedFiles = [...files].sort((a, b) => getFileScore(b.file) - getFileScore(a.file));
    for (const { file, content } of sortedFiles) {
        if (file.endsWith('.d.ts'))
            continue;
        const lines = content.split('\n');
        forEachValidDomainMatch(content, P_CANONICAL_ARRAY, lines, (match, lineNum, col, line) => {
            const name = match[1];
            if (['ROUTES', 'CONFIG', 'ITEMS', 'OPTIONS', 'STYLES', 'THEMES', 'MODALS'].includes(name))
                return;
            const domain = extractValidDomainSignature(match[0]);
            if (!domain)
                return;
            const { literals, signature } = domain;
            const isContract = typesRoots.some(r => file.startsWith(r)) || dataRoots.some(r => file.startsWith(r));
            const existing = bySignature.get(signature);
            if (existing) {
                if (existing.file !== file && !hasEscapeHatch(line) && !hasEscapeHatch(existing.file)) {
                    collisions.push({
                        file,
                        line: lineNum,
                        col,
                        ruleId: 'canonical-domain-collision',
                        message: `Canonical domain collision: '${name}' duplicates canonical domain '${existing.name}' from '${existing.file}:${existing.line}' (${signature}) — unify into a single SSoT contract`,
                        snippet: match[0].slice(0, 100).replace(/\n/g, '↵')
                    });
                }
            }
            else {
                registerDomain(name, file, lineNum, col, signature, literals, isContract);
            }
        });
        forEachValidDomainMatch(content, P_CANONICAL_TYPE, lines, (match, lineNum, col) => {
            const name = match[1];
            const domain = extractValidDomainSignature(match[0]);
            if (!domain)
                return;
            const { literals, signature } = domain;
            const isContract = typesRoots.some(r => file.startsWith(r)) || dataRoots.some(r => file.startsWith(r));
            if (!bySignature.has(signature)) {
                registerDomain(name, file, lineNum, col, signature, literals, isContract);
            }
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
    return { bySignature, list, collisions };
}
const P_ANY_LITERAL_ARRAY = /\b(?:(?:export\s+)?const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
const P_ANY_TYPE_UNION = /\b(?:export\s+)?type\s+(\w+)\s*=\s*(?:\(\s*)?(?:['"`][\w-]+['"`]\s*\|\s*)+['"`][\w-]+['"`]\s*\)?/g;
function parseDomainCandidate(m, rawContent, fileLines, targetFile, bySignature) {
    const { lineNum, col, line } = getMatchCoordinates(rawContent, m.index, fileLines);
    if (isCommentLine(line.trim()) || hasEscapeHatch(line))
        return null;
    const name = m[1];
    const literals = extractSortedLiterals(m[0]);
    if (!literals || literals.length < 2)
        return null;
    const signature = literals.join('|');
    const canonicalExact = bySignature.get(signature);
    if (canonicalExact && canonicalExact.file === targetFile && canonicalExact.name === name) {
        return null;
    }
    return { lineNum, col, name, literals, signature, canonicalExact };
}
function findBestParentDomain(literals, domainsList, currentFile) {
    let bestParent = null;
    for (const parent of domainsList) {
        if (parent.file === currentFile || parent.literals.length <= literals.length)
            continue;
        const isSubset = literals.every(l => parent.elements.has(l));
        if (!isSubset)
            continue;
        const ratio = literals.length / parent.literals.length;
        const diff = parent.literals.length - literals.length;
        const isSignificant = parent.literals.length <= MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD
            ? (literals.length >= 3 && (ratio >= 0.5 || diff <= 3))
            : (ratio >= 0.5);
        if (isSignificant && (!bestParent || parent.literals.length < bestParent.literals.length)) {
            bestParent = parent;
        }
    }
    return bestParent;
}
function scanFileArrayDuplicates(file, content, lines, domains, findings) {
    P_ANY_LITERAL_ARRAY.lastIndex = 0;
    let match;
    while ((match = P_ANY_LITERAL_ARRAY.exec(content)) !== null) {
        const cand = parseDomainCandidate(match, content, lines, file, domains.bySignature);
        if (!cand)
            continue;
        const { lineNum, col, name, literals, canonicalExact } = cand;
        if (canonicalExact) {
            findings.push({
                file,
                line: lineNum,
                col,
                ruleId: 'canonical-domain-subset-mismatch',
                message: `Duplicate domain collection: '${name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and use '${canonicalExact.name}' directly instead of re-declaring domain literals`,
                snippet: match[0].slice(0, 100).replace(/\n/g, '↵')
            });
            continue;
        }
        const bestParent = findBestParentDomain(literals, domains.list, file);
        if (bestParent) {
            findings.push({
                file,
                line: lineNum,
                col,
                ruleId: 'canonical-domain-subset-mismatch',
                message: `Sub-collection of canonical domain: '${name}' (${literals.length} elements) is a sub-collection of canonical domain '${bestParent.name}' (${bestParent.literals.length} elements) from '${bestParent.file}:${bestParent.line}' — derive from '${bestParent.name}'`,
                snippet: match[0].slice(0, 100).replace(/\n/g, '↵')
            });
        }
    }
}
function scanFileTypeUnionDuplicates(file, content, lines, domains, findings) {
    P_ANY_TYPE_UNION.lastIndex = 0;
    let match;
    while ((match = P_ANY_TYPE_UNION.exec(content)) !== null) {
        const cand = parseDomainCandidate(match, content, lines, file, domains.bySignature);
        if (!cand || !cand.canonicalExact)
            continue;
        const { lineNum, col, name, canonicalExact } = cand;
        findings.push({
            file,
            line: lineNum,
            col,
            ruleId: 'canonical-domain-subset-mismatch',
            message: `Duplicate domain type union: type '${name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and alias '${canonicalExact.name}' directly`,
            snippet: match[0].slice(0, 100).replace(/\n/g, '↵')
        });
    }
}
export function detectProjectDomainDuplicatesAndSubsets(files, domains) {
    const findings = [];
    if (domains.list.length === 0)
        return findings;
    for (const { file, content } of files) {
        if (file.endsWith('.d.ts'))
            continue;
        const lines = content.split('\n');
        scanFileArrayDuplicates(file, content, lines, domains, findings);
        scanFileTypeUnionDuplicates(file, content, lines, domains, findings);
    }
    return findings;
}
export class ValidateCanonicalDomainsAuditor extends BaseAuditor {
    constructor(optionsOrTarget) {
        const options = typeof optionsOrTarget === 'string'
            ? { projectRoot: optionsOrTarget }
            : (optionsOrTarget ?? {});
        const projectRoot = options.projectRoot || process.cwd();
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = options.roots ?? (config.paths.srcRoots ?? ['src']);
        super({
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            id: 'validate_canonical_domains',
            name: 'Canonical Domain Catalogs & SSoT Validator',
            description: 'Colisiones de catálogos y uniones de dominio repetidas',
            family: 'domain_data',
            ruleIds: CANONICAL_DOMAIN_RULES,
            packageName: 'Catálogos',
            icon: '📚',
            configKey: 'domain.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            ruleDescriptions: {
                'canonical-domain-collision': 'Colisión de catálogo canónico',
                'canonical-domain-repeated-union': 'Unión repetida sin alias canónico',
                'canonical-domain-library-duplicate': 'Unión duplica tipo de librería',
                'canonical-domain-subset-mismatch': 'Subconjunto de catálogo canónico'
            },
            coverage: {
                include: deriveCoverageFromRoots(effectiveRoots, EXTENSIONS).include,
                exclude: ['coverage/**', 'dist/**', 'scratch/**', '.agents/**']
            },
            roots: effectiveRoots,
            allowedExtensions: EXTENSIONS,
            extraIgnorePatterns: ['coverage/**', 'dist/**', 'scratch/**', '.agents/**'],
            projectRoot
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Dominio desactivado en config')) {
            this.redeclareCoverage({ include: ['src/**/*.ts'], source: 'declared-only' });
            return;
        }
        for (const r of CANONICAL_DOMAIN_RULES) {
            this.markRuleEvaluated(r);
        }
        const filePaths = this.context.collectFiles(this.roots, this.allowedExtensions);
        if (filePaths.length === 0) {
            for (const r of CANONICAL_DOMAIN_RULES) {
                this.markRuleNotApplicable(r, 'No se encontraron archivos de código candidatos');
            }
            return;
        }
        const scannedFiles = [];
        for (const fp of filePaths) {
            const rel = toPosixRelative(this.projectRoot, fp);
            if (isTestFileForCodeAudit(rel, this.projectRoot))
                continue;
            this.recordScanned(rel);
            try {
                const content = await fs.readFile(fp, 'utf8');
                scannedFiles.push({ file: rel, content });
            }
            catch {
                // catch-ok: unreadable file
            }
        }
        const allFindings = [];
        // 1. Repeated unions across files
        const repeatedUnions = detectRepeatedStringUnions(scannedFiles);
        for (const [, occurrences] of repeatedUnions) {
            allFindings.push(...occurrences);
        }
        // 2. Library domain duplicates
        const libraryTypes = await extractLibraryDomainTypes(this.projectRoot);
        const libDuplicates = detectLibraryDomainTypeDuplicates(scannedFiles, libraryTypes);
        allFindings.push(...libDuplicates);
        // 3. Project canonical domain collisions
        const { bySignature, list, collisions } = extractProjectCanonicalDomains(scannedFiles, this.projectRoot);
        allFindings.push(...collisions);
        // 4. Subsets and duplicates
        const subsets = detectProjectDomainDuplicatesAndSubsets(scannedFiles, { bySignature, list });
        allFindings.push(...subsets);
        for (const finding of allFindings) {
            this.addViolation({
                ruleId: finding.ruleId,
                severity: 'error',
                file: finding.file,
                line: finding.line,
                column: finding.col,
                message: finding.message,
                context: finding.snippet
            });
        }
        this.context.setMetric('Scanned files', scannedFiles.length);
        this.context.setMetric('Canonical findings', allFindings.length);
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateCanonicalDomainsAuditor());
//# sourceMappingURL=validate_canonical_domains.js.map