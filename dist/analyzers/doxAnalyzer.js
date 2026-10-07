/**
 * scripts/maintenance/analyzers/doxAnalyzer.ts
 *
 * Checks AGENTS.md / DOX hierarchy, relative links, and documentation integrity.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { isTestPath } from "../core/auditConfig.js";
import { buildRepositoryFileIndex } from "../core/safePath.js";
export const DOX_ANALYZER_DESCRIPTOR = {
    id: 'dox',
    name: 'DOX / AGENTS.md Integrity',
    category: 'DOX / AGENTS.md',
    aliases: ['dox', 'agents', 'agents.md', 'documentation', 'dox-integrity', 'doxindexintegrity']
};
const CODE_EXTENSIONS = new Set(['.ts', '.vue', '.js', '.scss', '.css']);
async function loadGitIgnoredPaths(rootDir) {
    const gitIgnoredPaths = new Set();
    try {
        const gitignoreRaw = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf-8');
        for (const line of gitignoreRaw.split('\n')) {
            const trimmed = line.trim().replace(/\/$/, '');
            if (!trimmed || trimmed.startsWith('#') || trimmed.includes('*') || trimmed.includes('?'))
                continue;
            gitIgnoredPaths.add(path.resolve(rootDir, trimmed));
        }
    }
    catch {
        // catch-ok: no .gitignore found — skip silently
    }
    return gitIgnoredPaths;
}
function isPathIgnored(dir, ignoreDirs, gitIgnoredPaths) {
    const dirName = path.basename(dir);
    if (ignoreDirs.has(dirName) || (dirName.startsWith('.') && dirName !== '.')) {
        return true;
    }
    const absDir = path.resolve(dir);
    for (const ignored of gitIgnoredPaths) {
        if (absDir === ignored || absDir.startsWith(ignored + path.sep)) {
            return true;
        }
    }
    return false;
}
function checkDirContainsCodeOrAgentsMd(entries) {
    let hasCode = false;
    let hasAgentsMd = false;
    for (const entry of entries) {
        if (entry.isFile()) {
            if (entry.name === 'AGENTS.md')
                hasAgentsMd = true;
            const ext = path.extname(entry.name).toLowerCase();
            if (CODE_EXTENSIONS.has(ext))
                hasCode = true;
        }
    }
    return { hasCode, hasAgentsMd };
}
async function tryReadAgentsMd(dir) {
    try {
        return await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    }
    catch {
        // catch-ok: unreadable AGENTS.md
        return null;
    }
}
async function scanDoxHierarchy(rootDir, ignoreDirs, gitIgnoredPaths) {
    const doxDirs = [];
    const doxFilesMap = new Map();
    async function traverse(dir) {
        if (isPathIgnored(dir, ignoreDirs, gitIgnoredPaths))
            return;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            // catch-ok: unreadable directory
            return;
        }
        const relPath = path.relative(rootDir, dir);
        const { hasCode, hasAgentsMd } = checkDirContainsCodeOrAgentsMd(entries);
        if (relPath !== '' && relPath !== 'src' && hasCode) {
            doxDirs.push(dir);
        }
        if (hasAgentsMd) {
            const content = await tryReadAgentsMd(dir);
            if (content !== null) {
                doxFilesMap.set(dir, content);
            }
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                await traverse(path.join(dir, entry.name));
            }
        }
    }
    await traverse(rootDir);
    return { doxDirs, doxFilesMap };
}
function findNearestAncestorDoxDir(dir, rootDir, doxFilesMap) {
    let current = path.dirname(dir);
    while (current !== rootDir) {
        if (doxFilesMap.has(current)) {
            return current;
        }
        current = path.dirname(current);
    }
    return rootDir;
}
function validateMissingAgentsFiles(rootDir, doxDirs, doxFilesMap) {
    const violations = [];
    for (const dir of doxDirs) {
        const agentsPath = path.join(dir, 'AGENTS.md');
        if (!doxFilesMap.has(dir)) {
            violations.push({
                file: agentsPath,
                line: 1,
                message: `Falta el archivo obligatorio de documentación 'AGENTS.md' en el directorio '${path.relative(rootDir, dir)}'.`,
                context: 'AGENTS.md',
                severity: 'error',
                fixable: false,
                packageName: 'DOX',
                ruleId: 'dox-missing-agents-md',
                ruleDescription: 'Falta archivo AGENTS.md'
            });
        }
    }
    const rootAgentsPath = path.join(rootDir, 'AGENTS.md');
    if (!doxFilesMap.has(rootDir)) {
        violations.push({
            file: rootAgentsPath,
            line: 1,
            message: `Falta el archivo de documentación raíz 'AGENTS.md'.`,
            context: 'AGENTS.md',
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-missing-agents-md',
            ruleDescription: 'Falta AGENTS.md en la raíz'
        });
    }
    return violations;
}
function validateChildRegistration(rootDir, doxFilesMap) {
    const violations = [];
    for (const [dirPath] of doxFilesMap.entries()) {
        if (dirPath === rootDir)
            continue;
        const agentsPath = path.join(dirPath, 'AGENTS.md');
        const parentDoxDir = findNearestAncestorDoxDir(dirPath, rootDir, doxFilesMap);
        if (!parentDoxDir)
            continue;
        const parentContent = doxFilesMap.get(parentDoxDir);
        if (!parentContent)
            continue;
        const relativeChildPath = path.relative(parentDoxDir, agentsPath);
        const posixPath = relativeChildPath.split(path.sep).join(path.posix.sep);
        const cleanPath = posixPath.startsWith('./') ? posixPath.slice(2) : posixPath;
        const dirOnlyPath = path.dirname(posixPath);
        const hasLink = parentContent.includes(cleanPath) ||
            parentContent.includes('./' + cleanPath) ||
            parentContent.includes(encodeURI(cleanPath)) ||
            parentContent.includes('./' + encodeURI(cleanPath)) ||
            parentContent.includes('[' + dirOnlyPath + '/]') ||
            parentContent.includes('(' + dirOnlyPath + '/') ||
            parentContent.includes('./' + dirOnlyPath + '/');
        if (!hasLink) {
            const parentFile = path.join(parentDoxDir, 'AGENTS.md');
            violations.push({
                file: parentFile,
                line: 1,
                message: `El archivo '${path.relative(rootDir, agentsPath)}' no está registrado en el índice DOX de '${path.relative(rootDir, parentFile)}'.`,
                context: cleanPath,
                severity: 'error',
                fixable: false,
                packageName: 'DOX',
                ruleId: 'dox-unregistered-child',
                ruleDescription: 'AGENTS.md hijo no registrado'
            });
        }
    }
    return violations;
}
function checkLinkSyntax(targetUrl, label, line, agentsPath) {
    const isFullPath = targetUrl.startsWith('file://') ||
        targetUrl.startsWith('/') ||
        targetUrl.startsWith('\\') ||
        /^[a-z]:/i.test(targetUrl) ||
        path.isAbsolute(targetUrl);
    if (isFullPath) {
        return {
            file: agentsPath,
            line,
            message: `Enlace absoluto o ruta completa prohibida '${targetUrl}' detectada en '${label}'. Se exige el uso exclusivo de rutas relativas (RULE 10).`,
            context: targetUrl,
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-absolute-link',
            ruleDescription: 'Enlace con ruta absoluta'
        };
    }
    return null;
}
async function checkLinkTarget(targetUrl, line, agentsPath, dirPath, rootDir, gitIgnoredPaths, repoFileIndex) {
    const rawTarget = targetUrl.split('#')[0] ?? '';
    let cleanTarget;
    try {
        cleanTarget = decodeURIComponent(rawTarget);
    }
    catch {
        // catch-ok: malformed URI component fallback
        cleanTarget = rawTarget;
    }
    if (!cleanTarget)
        return null;
    const absoluteTarget = path.resolve(dirPath, cleanTarget);
    const isGitIgnored = gitIgnoredPaths.has(absoluteTarget) ||
        [...gitIgnoredPaths].some(p => absoluteTarget.startsWith(p + path.sep));
    if (isGitIgnored) {
        return {
            file: agentsPath,
            line,
            message: `Enlace a ruta ignorada por Git (.gitignore): '${targetUrl}' apunta a una ruta no versionada que no existirá en clones o CI.`,
            context: targetUrl,
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-gitignore-target',
            ruleDescription: 'Enlace a ruta ignorada en git'
        };
    }
    try {
        await fs.stat(absoluteTarget);
    }
    catch {
        // catch-ok: non-existent file target check
        const basename = path.basename(cleanTarget);
        const candidateMatches = (repoFileIndex.get(basename) ?? []).filter(cand => !gitIgnoredPaths.has(cand) && ![...gitIgnoredPaths].some(p => cand.startsWith(p + path.sep)));
        let message = `Enlace roto: '${targetUrl}' apuntando a '${cleanTarget}' no existe en el disco.`;
        if (candidateMatches.length > 0) {
            const suggestions = candidateMatches.map(cand => {
                let rel = path.relative(dirPath, cand).split(path.sep).join(path.posix.sep);
                if (!rel.startsWith('.'))
                    rel = './' + rel;
                return rel;
            });
            const foundIn = candidateMatches.map(cand => path.relative(rootDir, cand).split(path.sep).join(path.posix.sep)).join(', ');
            message = `Enlace roto: '${targetUrl}' no existe en esa ruta, pero aparentemente fue localizado en '${foundIn}'. Verifica si corresponde corregir el enlace a: '${suggestions.join("' o '")}'.`;
        }
        return {
            file: agentsPath,
            line,
            message,
            context: targetUrl,
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-broken-link',
            ruleDescription: 'Enlace roto a archivo inexistente'
        };
    }
    return null;
}
async function validateSingleLink(targetUrl, label, line, agentsPath, dirPath, rootDir, gitIgnoredPaths, repoFileIndex) {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('#')) {
        return null;
    }
    const syntaxViolation = checkLinkSyntax(targetUrl, label, line, agentsPath);
    if (syntaxViolation)
        return syntaxViolation;
    return checkLinkTarget(targetUrl, line, agentsPath, dirPath, rootDir, gitIgnoredPaths, repoFileIndex);
}
async function validateFileLinks(agentsPath, dirPath, rootDir, content, gitIgnoredPaths, repoFileIndex) {
    const violations = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (lineText === undefined)
            continue;
        let match;
        while ((match = linkRegex.exec(lineText)) !== null) {
            const label = match[1] ?? '';
            const targetUrl = (match[2] ?? '').trim();
            const violation = await validateSingleLink(targetUrl, label, i + 1, agentsPath, dirPath, rootDir, gitIgnoredPaths, repoFileIndex);
            if (violation) {
                violations.push(violation);
            }
        }
    }
    return violations;
}
const ALLOWED_CODE_EXTS = new Set(['.ts', '.vue', '.js', '.cjs', '.mjs', '.jsx', '.tsx', '.scss', '.css']);
function isIndexableCodeFile(fileName, fullPath, gitIgnoredPaths) {
    if (fileName === 'AGENTS.md')
        return false;
    if (fileName.endsWith('.d.ts') || fileName.endsWith('.map'))
        return false;
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_CODE_EXTS.has(ext))
        return false;
    if (isTestPath(fullPath))
        return false;
    const isIgnored = gitIgnoredPaths.has(fullPath) ||
        [...gitIgnoredPaths].some(p => fullPath.startsWith(p + path.sep));
    return !isIgnored;
}
async function checkDirUnindexedCodeFiles(dirPath, content, rootDir, gitIgnoredPaths) {
    const violations = [];
    let entries;
    try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
    }
    catch {
        // catch-ok: unreadable directory
        return [];
    }
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        const fullPath = path.join(dirPath, entry.name);
        if (!isIndexableCodeFile(entry.name, fullPath, gitIgnoredPaths))
            continue;
        if (!content.includes(entry.name)) {
            const agentsPath = path.join(dirPath, 'AGENTS.md');
            violations.push({
                file: agentsPath,
                line: 1,
                message: `El archivo de código '${path.relative(rootDir, fullPath)}' no está indexado en el AGENTS.md local ('${path.relative(rootDir, agentsPath)}').`,
                context: entry.name,
                severity: 'error',
                fixable: false,
                packageName: 'DOX',
                ruleId: 'dox-unindexed-file',
                ruleDescription: 'Archivo de código no indexado en DOX'
            });
        }
    }
    return violations;
}
async function validateUnindexedCodeFiles(rootDir, doxFilesMap, gitIgnoredPaths) {
    const violations = [];
    for (const [dirPath, content] of doxFilesMap.entries()) {
        if (dirPath === rootDir)
            continue;
        violations.push(...(await checkDirUnindexedCodeFiles(dirPath, content, rootDir, gitIgnoredPaths)));
    }
    return violations;
}
function createSectionOrderViolation(agentsPath, line, rawHeader, message) {
    return {
        file: agentsPath,
        line,
        message,
        context: rawHeader,
        severity: 'error',
        fixable: false,
        packageName: 'DOX',
        ruleId: 'dox-section-order',
        ruleDescription: 'Orden incorrecto de secciones en AGENTS.md'
    };
}
const MANDATORY_DOX_SECTIONS = [
    { level: 1, title: 'Purpose', normalized: 'purpose', raw: '# Purpose' },
    { level: 2, title: 'Ownership', normalized: 'ownership', raw: '## Ownership' },
    { level: 2, title: 'Local Contracts', normalized: 'local contracts', raw: '## Local Contracts' },
    { level: 2, title: 'Work Guidance', normalized: 'work guidance', raw: '## Work Guidance' },
    { level: 2, title: 'Verification', normalized: 'verification', raw: '## Verification' },
    { level: 2, title: 'Child DOX Index', normalized: 'child dox index', raw: '## Child DOX Index' }
];
const PLACEHOLDER_KEYWORDS = new Set([
    'todo',
    'tbd',
    'na',
    'n/a',
    'none',
    'ninguno',
    'ninguna',
    'vacio',
    'vacío',
    'empty',
    'pendiente',
    'placeholder',
    'lorem ipsum',
    'coming soon'
]);
const MIN_TODO_STUB_CHARS = 25;
const MIN_MEANINGFUL_SECTION_CHARS = 10;
const DOX_SECTION_RANK = {
    PURPOSE: 10,
    OWNERSHIP: 20,
    LOCAL_CONTRACTS: 30,
    KEY_FILES_EARLY: 35,
    WORK_GUIDANCE: 40,
    VERIFICATION: 50,
    KEY_FILES_LATE: 55,
    CHILD_DOX_INDEX: 60
};
function maskCodeBlocksPreservingLines(content) {
    return content.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, match => {
        return match.replace(/[^\n]/g, ' ');
    });
}
function isGarbageOrEmptyContent(rawContent) {
    // Strip HTML comments <!-- ... -->
    const stripped = rawContent.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!stripped)
        return true;
    // Single-line placeholder check
    const cleanOneLiner = stripped
        .toLowerCase()
        .replace(/^[-*_\s]+/, '')
        .replace(/[:.?!]+$/, '')
        .trim();
    if (PLACEHOLDER_KEYWORDS.has(cleanOneLiner))
        return true;
    if (cleanOneLiner.startsWith('todo') || cleanOneLiner.startsWith('tbd') || cleanOneLiner.startsWith('pendiente')) {
        const alphaNumericOnly = stripped.replace(/[^a-z0-9áéíóúñ]/gi, '');
        if (alphaNumericOnly.length < MIN_TODO_STUB_CHARS)
            return true;
    }
    // If every non-empty line is a placeholder or filler
    const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0)
        return true;
    const allLinesPlaceholder = lines.every(line => {
        const cleaned = line
            .toLowerCase()
            .replace(/^[-*_\s]+/, '')
            .replace(/[:.?!]+$/, '')
            .trim();
        return PLACEHOLDER_KEYWORDS.has(cleaned) || /^(?:\.{3,}|\?+|-+|_+)$/.test(cleaned);
    });
    if (allLinesPlaceholder)
        return true;
    // Check alphanumeric characters length
    const alphaNumericOnly = stripped.replace(/[^a-z0-9áéíóúñ]/gi, '');
    if (alphaNumericOnly.length < MIN_MEANINGFUL_SECTION_CHARS)
        return true;
    return false;
}
function getHeaderRank(normalized, prevRank) {
    if (normalized === 'purpose')
        return DOX_SECTION_RANK.PURPOSE;
    if (normalized === 'ownership')
        return DOX_SECTION_RANK.OWNERSHIP;
    if (normalized === 'local contracts')
        return DOX_SECTION_RANK.LOCAL_CONTRACTS;
    if (normalized === 'key files') {
        if (prevRank >= DOX_SECTION_RANK.LOCAL_CONTRACTS && prevRank < DOX_SECTION_RANK.WORK_GUIDANCE) {
            return DOX_SECTION_RANK.KEY_FILES_EARLY;
        }
        if (prevRank >= DOX_SECTION_RANK.VERIFICATION && prevRank < DOX_SECTION_RANK.CHILD_DOX_INDEX) {
            return DOX_SECTION_RANK.KEY_FILES_LATE;
        }
        return DOX_SECTION_RANK.KEY_FILES_EARLY;
    }
    if (normalized === 'work guidance')
        return DOX_SECTION_RANK.WORK_GUIDANCE;
    if (normalized === 'verification')
        return DOX_SECTION_RANK.VERIFICATION;
    if (normalized === 'child dox index')
        return DOX_SECTION_RANK.CHILD_DOX_INDEX;
    return null;
}
function parseDoxHeaders(maskedLines) {
    const headerInfos = [];
    for (let i = 0; i < maskedLines.length; i++) {
        const lineText = maskedLines[i];
        if (lineText === undefined)
            continue;
        const match = /^(#{1,2})\s+(\S.*)$/.exec(lineText);
        if (match) {
            const level = match[1]?.length ?? 1;
            const rawTitle = (match[2] ?? '').trim();
            headerInfos.push({
                level,
                title: rawTitle,
                normalizedTitle: rawTitle.toLowerCase(),
                line: i + 1,
                rawHeader: `${match[1]} ${rawTitle}`,
                lineIndex: i
            });
        }
    }
    return headerInfos;
}
function checkMandatoryDoxSections(headerInfos, agentsPath, rootDir) {
    const violations = [];
    for (const mandatory of MANDATORY_DOX_SECTIONS) {
        const found = headerInfos.find(h => h.level === mandatory.level && h.normalizedTitle === mandatory.normalized);
        if (!found) {
            violations.push({
                file: agentsPath,
                line: 1,
                message: `Falta la sección obligatoria '${mandatory.raw}' en '${path.relative(rootDir, agentsPath)}'.`,
                context: mandatory.raw,
                severity: 'error',
                fixable: false,
                packageName: 'DOX',
                ruleId: 'dox-missing-section',
                ruleDescription: 'Sección obligatoria ausente en AGENTS.md'
            });
        }
    }
    return violations;
}
function checkDoxSectionOrder(headerInfos, agentsPath, rootDir) {
    const violations = [];
    let lastRank = 0;
    let lastHeader = null;
    const seenSections = new Set();
    for (const h of headerInfos) {
        if (seenSections.has(h.normalizedTitle)) {
            violations.push(createSectionOrderViolation(agentsPath, h.line, h.rawHeader, `Sección duplicada '${h.rawHeader}' en '${path.relative(rootDir, agentsPath)}' (línea ${h.line}).`));
            continue;
        }
        seenSections.add(h.normalizedTitle);
        const rank = getHeaderRank(h.normalizedTitle, lastRank);
        if (rank === null) {
            violations.push(createSectionOrderViolation(agentsPath, h.line, h.rawHeader, `Sección no reconocida o no canónica '${h.rawHeader}' en '${path.relative(rootDir, agentsPath)}' (línea ${h.line}). Estructura permitida: # Purpose -> ## Ownership -> ## Local Contracts -> [## Key Files] -> ## Work Guidance -> ## Verification -> ## Child DOX Index.`));
            continue;
        }
        if (rank <= lastRank) {
            violations.push(createSectionOrderViolation(agentsPath, h.line, h.rawHeader, `Orden incorrecto de secciones en '${path.relative(rootDir, agentsPath)}': '${h.rawHeader}' (línea ${h.line}) no debe aparecer después de '${lastHeader?.rawHeader ?? 'inicio'}' (línea ${lastHeader?.line ?? 1}). Se exige el orden canónico: # Purpose -> ## Ownership -> ## Local Contracts -> ## Work Guidance -> ## Verification -> ## Child DOX Index.`));
        }
        else {
            lastRank = rank;
            lastHeader = h;
        }
    }
    return violations;
}
function checkDoxSectionContent(headerInfos, originalLines, agentsPath, rootDir) {
    const violations = [];
    for (let idx = 0; idx < headerInfos.length; idx++) {
        const h = headerInfos[idx];
        const nextH = headerInfos[idx + 1];
        const endLineIndex = nextH ? nextH.lineIndex : originalLines.length;
        const bodyLines = originalLines.slice(h.lineIndex + 1, endLineIndex);
        const bodyText = bodyLines.join('\n');
        if (isGarbageOrEmptyContent(bodyText)) {
            violations.push({
                file: agentsPath,
                line: h.line,
                message: `La sección obligatoria '${h.rawHeader}' en '${path.relative(rootDir, agentsPath)}' (línea ${h.line}) está vacía o contiene texto de relleno/basura. Debe contener información sustancial y útil.`,
                context: h.rawHeader,
                severity: 'error',
                fixable: false,
                packageName: 'DOX',
                ruleId: 'dox-empty-section',
                ruleDescription: 'Sección vacía o con contenido basura'
            });
        }
    }
    return violations;
}
export function validateDoxSectionStructure(agentsPath, rootDir, content) {
    const maskedLines = maskCodeBlocksPreservingLines(content).split('\n');
    const originalLines = content.split('\n');
    const headerInfos = parseDoxHeaders(maskedLines);
    return [
        ...checkMandatoryDoxSections(headerInfos, agentsPath, rootDir),
        ...checkDoxSectionOrder(headerInfos, agentsPath, rootDir),
        ...checkDoxSectionContent(headerInfos, originalLines, agentsPath, rootDir)
    ];
}
export async function checkDoxIntegrity(rootDir, ignoreDirs) {
    const gitIgnoredPaths = await loadGitIgnoredPaths(rootDir);
    const { doxDirs, doxFilesMap } = await scanDoxHierarchy(rootDir, ignoreDirs, gitIgnoredPaths);
    const repoFileIndex = buildRepositoryFileIndex(rootDir, p => isPathIgnored(p, ignoreDirs, gitIgnoredPaths));
    const violations = [
        ...validateMissingAgentsFiles(rootDir, doxDirs, doxFilesMap),
        ...validateChildRegistration(rootDir, doxFilesMap),
        ...(await validateUnindexedCodeFiles(rootDir, doxFilesMap, gitIgnoredPaths))
    ];
    for (const [dirPath, content] of doxFilesMap.entries()) {
        const agentsPath = path.join(dirPath, 'AGENTS.md');
        violations.push(...validateDoxSectionStructure(agentsPath, rootDir, content));
        const linkViolations = await validateFileLinks(agentsPath, dirPath, rootDir, content, gitIgnoredPaths, repoFileIndex);
        violations.push(...linkViolations);
    }
    return violations;
}
//# sourceMappingURL=doxAnalyzer.js.map