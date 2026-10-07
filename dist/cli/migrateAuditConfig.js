/**
 * src/cli/migrateAuditConfig.ts
 *
 * One-shot relocation of a root-level `audit.config.ts` / `audit.config.json` into `.auditor/`,
 * invoked by `auditor fix`. Relative module specifiers of the TypeScript config are rewritten through
 * the TypeScript AST so they keep resolving from the new directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { AUDITOR_DIR, LEGACY_ROOT_CONFIG_FILES } from "../core/auditConfig.js";
function collectRelativeSpecifiers(source) {
    const found = [];
    const visit = (node) => {
        const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0]
                : undefined;
        if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.startsWith('.'))
            found.push(specifier);
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
}
function rebaseSpecifier(specifier, fromDir, toDir) {
    const relative = path.relative(toDir, path.resolve(fromDir, specifier)).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
}
function rewriteRelativeImports(code, fileName, fromDir, toDir) {
    const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return collectRelativeSpecifiers(source)
        .sort((a, b) => b.getStart(source) - a.getStart(source))
        .reduce((acc, literal) => {
        const quote = acc[literal.getStart(source)];
        const replacement = `${quote}${rebaseSpecifier(literal.text, fromDir, toDir)}${quote}`;
        return acc.slice(0, literal.getStart(source)) + replacement + acc.slice(literal.getEnd());
    }, code);
}
/** Moves legacy root configuration files into `.auditor/`. Returns the moved file names. */
export function migrateLegacyAuditConfig(projectRoot) {
    const targetDir = path.resolve(projectRoot, AUDITOR_DIR);
    const moved = []; // no-domain: Non-domain utility collection or data structure
    for (const fileName of LEGACY_ROOT_CONFIG_FILES) {
        const legacyPath = path.resolve(projectRoot, fileName);
        if (!fs.existsSync(legacyPath))
            continue;
        const targetPath = path.join(targetDir, fileName);
        if (fs.existsSync(targetPath)) {
            throw new Error(`[AuditConfig] Both '${fileName}' and '${AUDITOR_DIR}/${fileName}' exist. Remove the stale copy manually before running 'auditor fix'.`);
        }
        const code = fs.readFileSync(legacyPath, 'utf-8');
        const migrated = fileName.endsWith('.ts') ? rewriteRelativeImports(code, fileName, projectRoot, targetDir) : code;
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(targetPath, migrated, 'utf-8');
        fs.rmSync(legacyPath);
        moved.push(fileName);
    }
    return moved;
}
//# sourceMappingURL=migrateAuditConfig.js.map