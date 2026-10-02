/**
 * scripts/maintenance/analyzers/doxAnalyzer.ts
 *
 * Checks AGENTS.md / DOX hierarchy, relative links, and documentation integrity.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { styleText } from 'node:util';
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
        /^[a-zA-Z]:/.test(targetUrl) ||
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
async function checkLinkTarget(targetUrl, line, agentsPath, dirPath, gitIgnoredPaths) {
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
        return {
            file: agentsPath,
            line,
            message: `Enlace roto: '${targetUrl}' apuntando a '${cleanTarget}' no existe en el disco.`,
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
async function validateSingleLink(targetUrl, label, line, agentsPath, dirPath, gitIgnoredPaths) {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('#')) {
        return null;
    }
    const syntaxViolation = checkLinkSyntax(targetUrl, label, line, agentsPath);
    if (syntaxViolation)
        return syntaxViolation;
    return checkLinkTarget(targetUrl, line, agentsPath, dirPath, gitIgnoredPaths);
}
async function validateFileLinks(agentsPath, dirPath, content, gitIgnoredPaths) {
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
            const violation = await validateSingleLink(targetUrl, label, i + 1, agentsPath, dirPath, gitIgnoredPaths);
            if (violation) {
                violations.push(violation);
            }
        }
    }
    return violations;
}
export async function checkDoxIntegrity(rootDir, ignoreDirs) {
    const gitIgnoredPaths = await loadGitIgnoredPaths(rootDir);
    const { doxDirs, doxFilesMap } = await scanDoxHierarchy(rootDir, ignoreDirs, gitIgnoredPaths);
    process.stderr.write(styleText('cyan', '📘 Escaneando jerarquía e integridad de índices AGENTS.md / DOX...\n'));
    const violations = [
        ...validateMissingAgentsFiles(rootDir, doxDirs, doxFilesMap),
        ...validateChildRegistration(rootDir, doxFilesMap)
    ];
    for (const [dirPath, content] of doxFilesMap.entries()) {
        const agentsPath = path.join(dirPath, 'AGENTS.md');
        const linkViolations = await validateFileLinks(agentsPath, dirPath, content, gitIgnoredPaths);
        violations.push(...linkViolations);
    }
    return violations;
}
//# sourceMappingURL=doxAnalyzer.js.map