/**
 * scripts/maintenance/analyzers/constantAnalyzer.ts
 *
 * Scans codebase files for duplicate constant declarations across modules using TypeScript AST.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { SharedAstContext } from "../core/astContext.js";
import { isPathIgnored } from "../core/auditorBase.js";
import { getAuditConfig, isInCodeRoots, isScriptPath, isExemptFile, isDataPath, isDemoPath } from "../core/auditConfig.js";
export const CONSTANT_ANALYZER_DESCRIPTOR = {
    id: 'duplicate-constants',
    name: 'Duplicate Constants Across Modules',
    category: 'Constantes duplicadas entre módulos',
    aliases: ['duplicate-constants', 'constants', 'constantes', 'constantes-duplicadas']
};
export const DEFAULT_IGNORED_CONSTANT_NAMES = [
    'ID', 'NAME', 'TYPE', 'KEY', 'INDEX', 'COUNT', 'DEFAULT', 'SIZE', 'MAX', 'MIN',
    'VAL', 'VALUE', 'ITEM', 'STATE', 'MODE', 'TAG', 'URL', 'PATH', 'ERR', 'ERROR',
    'MSG', 'DATA', 'INFO', 'OPTIONS', 'CONFIG', 'RESULT', 'RES', 'REQ', 'STATUS',
    'LEVEL', 'STEP', 'DELTA', 'WIDTH', 'HEIGHT', 'X', 'Y', 'Z', 'I', 'J', 'K',
    'TEST', 'MOCK', 'STUB', 'DUMMY', 'VERSION', 'DESC', 'TITLE', 'LABEL', 'ICON',
    'COLOR', 'THEME', 'STYLE', 'PROPS', 'EMITS', 'MAP', 'LIST', 'ITEMS', 'ACTIONS',
    'TYPES', 'KEYS', 'VALUES', 'ROLES', 'MODALS', 'VIEWS', 'COMPONENTS', 'STORE',
    'SCHEMA', 'KEY_CODES', 'REF', 'COMPOSABLE', 'PROVIDE', 'INJECT', 'SLOTS', 'SLOT'
];
export function getEffectiveIgnoredConstantNames(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const custom = config.constants?.ignoredNames ?? [];
    return new Set([...DEFAULT_IGNORED_CONSTANT_NAMES, ...custom]);
}
export const IGNORED_CONSTANT_NAMES = new Set(DEFAULT_IGNORED_CONSTANT_NAMES);
function isValidConstantIdentifier(name, ignoredNames) {
    if (name.length < 4)
        return false;
    if (ignoredNames.has(name))
        return false;
    return /^[A-Z0-9_]+$/.test(name);
}
function unwrapExpression(expr) {
    let current = expr;
    while (ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isParenthesizedExpression(current) ||
        ts.isNonNullExpression(current)) {
        current = current.expression;
    }
    return current;
}
function processVariableDeclaration(decl, sourceFile, filePath, isExported, ignoredNames) {
    if (!ts.isIdentifier(decl.name))
        return null;
    const constName = decl.name.text;
    if (!isValidConstantIdentifier(constName, ignoredNames))
        return null;
    const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
    const unwrappedInitializer = decl.initializer ? unwrapExpression(decl.initializer) : null;
    const rawValue = unwrappedInitializer ? unwrappedInitializer.getText(sourceFile).trim() : '';
    return {
        name: constName,
        file: filePath,
        line,
        valueStr: rawValue,
        isExported
    };
}
function extractConstantsFromStatement(statement, sourceFile, filePath, ignoredNames) {
    if (!ts.isVariableStatement(statement))
        return [];
    const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
    if (!isConst)
        return [];
    const isExported = !!statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const decls = [];
    for (const decl of statement.declarationList.declarations) {
        const constDecl = processVariableDeclaration(decl, sourceFile, filePath, isExported, ignoredNames);
        if (constDecl) {
            decls.push(constDecl);
        }
    }
    return decls;
}
/**
 * Extracts top-level const declarations using TypeScript AST.
 */
export function extractConstantsFromSource(sourceFile, filePath, ignoredNames) {
    const decls = [];
    const effectiveIgnored = ignoredNames ?? IGNORED_CONSTANT_NAMES;
    for (const statement of sourceFile.statements) {
        decls.push(...extractConstantsFromStatement(statement, sourceFile, filePath, effectiveIgnored));
    }
    return decls;
}
function isConstantAuditCandidate(filePath, projectRoot, config) {
    const isUnderRoot = !path.isAbsolute(filePath) || !path.relative(projectRoot, filePath).startsWith('..');
    const rel = path.relative(projectRoot, filePath).split(path.sep).join(path.posix.sep);
    if (isUnderRoot && isPathIgnored(rel))
        return false;
    if (isDataPath(rel) || isDemoPath(rel))
        return false;
    if (!isInCodeRoots(rel, config))
        return false;
    if (isScriptPath(rel, config))
        return false;
    if (isExemptFile(rel, config))
        return false;
    if (rel.startsWith('src/suites/') || rel.startsWith('src/cli/'))
        return false;
    return true;
}
async function collectFileConstants(filePath, astEngine, effectiveIgnored, declarations) {
    let content;
    try {
        content = await fs.readFile(filePath, 'utf-8');
    }
    catch {
        return;
    }
    // Fast string pre-filter to skip files with no const declarations
    if (!content.includes('const '))
        return;
    const sourceFile = astEngine.getSourceFile(filePath, content);
    const constDecls = extractConstantsFromSource(sourceFile, filePath, effectiveIgnored);
    for (const decl of constDecls) {
        if (!declarations.has(decl.name)) {
            declarations.set(decl.name, []);
        }
        declarations.get(decl.name).push(decl);
    }
}
async function checkIsCrossImported(constName, uniqueFiles, fileContentCache) {
    const importRegex = new RegExp(`import\\s+[^;]*\\b${constName}\\b`);
    for (let i = 0; i < uniqueFiles.length; i++) {
        for (let j = i + 1; j < uniqueFiles.length; j++) {
            const fileA = uniqueFiles[i];
            const fileB = uniqueFiles[j];
            let contentA = fileContentCache.get(fileA);
            if (contentA === undefined) {
                contentA = await fs.readFile(fileA, 'utf-8').catch(() => '');
                fileContentCache.set(fileA, contentA);
            }
            let contentB = fileContentCache.get(fileB);
            if (contentB === undefined) {
                contentB = await fs.readFile(fileB, 'utf-8').catch(() => '');
                fileContentCache.set(fileB, contentB);
            }
            if (importRegex.test(contentA) || importRegex.test(contentB)) {
                return true;
            }
        }
    }
    return false;
}
function createConstantViolations(constName, decls, uniqueFiles, targetConstantsDir) {
    const normalizedValueA = decls[0].valueStr.replace(/\s+/g, '');
    const hasIdenticalValues = decls.every(d => d.valueStr.replace(/\s+/g, '') === normalizedValueA);
    const fileList = uniqueFiles.map(f => path.relative(process.cwd(), f)).join(', ');
    const violations = [];
    if (hasIdenticalValues) {
        for (const decl of decls) {
            violations.push({
                file: decl.file,
                line: decl.line,
                message: `Constante duplicada '${constName}' con valor idéntico declarada en múltiples módulos (${fileList}). DEBE modularizarse obligatoriamente en ${targetConstantsDir} para su reutilización.`,
                context: constName,
                severity: 'error',
                fixable: false,
            });
        }
    }
    else {
        for (const decl of decls) {
            violations.push({
                file: decl.file,
                line: decl.line,
                message: `Constante '${constName}' declarada con valores diferentes en múltiples módulos (${fileList}). Revisa si es un posible bug o si se debe unificar/renombrar según su subdominio.`,
                context: constName,
                severity: 'error',
                fixable: false,
            });
        }
    }
    return violations;
}
export async function detectDuplicateConstants(files, astContext, projectRoot = process.cwd()) {
    const declarations = new Map();
    const astEngine = astContext ?? new SharedAstContext();
    const config = getAuditConfig(projectRoot);
    const targetConstantsDir = config.paths.constantsRoots?.[0] ?? 'un módulo compartido de constantes';
    const effectiveIgnored = getEffectiveIgnoredConstantNames(projectRoot);
    for (const filePath of files) {
        if (!isConstantAuditCandidate(filePath, projectRoot, config))
            continue;
        await collectFileConstants(filePath, astEngine, effectiveIgnored, declarations);
    }
    const fileContentCache = new Map();
    const violations = [];
    for (const [constName, decls] of declarations.entries()) {
        const uniqueFiles = Array.from(new Set(decls.map(d => d.file)));
        if (uniqueFiles.length <= 1)
            continue;
        const isCrossImported = await checkIsCrossImported(constName, uniqueFiles, fileContentCache);
        if (!isCrossImported) {
            violations.push(...createConstantViolations(constName, decls, uniqueFiles, targetConstantsDir));
        }
    }
    return violations;
}
//# sourceMappingURL=constantAnalyzer.js.map