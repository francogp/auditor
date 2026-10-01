/**
 * scripts/maintenance/analyzers/constantAnalyzer.ts
 *
 * Scans codebase files for duplicate constant declarations across modules using TypeScript AST.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';
import { SharedAstContext } from '../core/astContext.ts';
import { isPathIgnored } from '../core/auditorBase.ts';

export const CONSTANT_ANALYZER_DESCRIPTOR: RuleDescriptor = {
  id: 'duplicate-constants',
  name: 'Duplicate Constants Across Modules',
  category: 'Constantes duplicadas entre módulos',
  aliases: ['duplicate-constants', 'constants', 'constantes', 'constantes-duplicadas']
};

export const IGNORED_CONSTANT_NAMES: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  'ID', 'NAME', 'TYPE', 'KEY', 'INDEX', 'COUNT', 'DEFAULT', 'SIZE', 'MAX', 'MIN',
  'VAL', 'VALUE', 'ITEM', 'STATE', 'MODE', 'TAG', 'URL', 'PATH', 'ERR', 'ERROR',
  'MSG', 'DATA', 'INFO', 'OPTIONS', 'CONFIG', 'RESULT', 'RES', 'REQ', 'STATUS',
  'LEVEL', 'STEP', 'DELTA', 'WIDTH', 'HEIGHT', 'X', 'Y', 'Z', 'I', 'J', 'K',
  'TEST', 'MOCK', 'STUB', 'DUMMY', 'VERSION', 'DESC', 'TITLE', 'LABEL', 'ICON',
  'COLOR', 'THEME', 'STYLE', 'PROPS', 'EMITS', 'MAP', 'LIST', 'ITEMS', 'ACTIONS',
  'TYPES', 'KEYS', 'VALUES', 'ROLES', 'MODALS', 'VIEWS', 'COMPONENTS', 'STORE',
  'SCHEMA', 'KEY_CODES', 'REF', 'COMPOSABLE', 'PROVIDE', 'INJECT', 'SLOTS', 'SLOT'
]);

interface ConstDecl {
  name: string;
  file: string;
  line: number;
  valueStr: string;
  isExported: boolean;
}

/**
 * Extracts top-level const declarations using TypeScript AST.
 */
export function extractConstantsFromSource(
  sourceFile: ts.SourceFile,
  filePath: string
): ConstDecl[] {
  const decls: ConstDecl[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const isExported = !!statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (!isConst) continue;

      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const constName = decl.name.text;
          if (constName.length < 4) continue;
          if (IGNORED_CONSTANT_NAMES.has(constName)) continue;
          if (!/^[A-Z0-9_]+$/.test(constName)) continue;

          const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
          const rawValue = decl.initializer ? decl.initializer.getText(sourceFile).trim() : '';

          decls.push({
            name: constName,
            file: filePath,
            line,
            valueStr: rawValue,
            isExported
          });
        }
      }
    }
  }

  return decls;
}

export async function detectDuplicateConstants(
  files: string[],
  astContext?: SharedAstContext
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const declarations = new Map<string, ConstDecl[]>();
  const astEngine = astContext ?? new SharedAstContext();

  for (const filePath of files) {
    const isUnderCwd = !path.isAbsolute(filePath) || !path.relative(process.cwd(), filePath).startsWith('..');
    const rel = path.relative(process.cwd(), filePath).split(path.sep).join(path.posix.sep);
    if (
      (isUnderCwd && isPathIgnored(rel)) ||
      rel.includes('tests') ||
      rel.includes('scripts') ||
      rel.includes('official_servers.ts')
    ) {
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Fast string pre-filter to skip files with no const declarations
    if (!content.includes('const ')) continue;

    const sourceFile = astEngine.getSourceFile(filePath, content);
    const constDecls = extractConstantsFromSource(sourceFile, filePath);

    for (const decl of constDecls) {
      if (!declarations.has(decl.name)) {
        declarations.set(decl.name, []);
      }
      declarations.get(decl.name)!.push(decl);
    }
  }

  const fileContentCache = new Map<string, string>();

  for (const [constName, decls] of declarations.entries()) {
    const uniqueFiles = Array.from(new Set(decls.map(d => d.file)));
    if (uniqueFiles.length <= 1) continue;

    let isCrossImported = false;
    for (let i = 0; i < uniqueFiles.length; i++) {
      for (let j = i + 1; j < uniqueFiles.length; j++) {
        const fileA = uniqueFiles[i]!;
        const fileB = uniqueFiles[j]!;

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

        const importRegex = new RegExp(`import\\s+[^;]*\\b${constName}\\b`);
        if (importRegex.test(contentA) || importRegex.test(contentB)) {
          isCrossImported = true;
          break;
        }
      }
      if (isCrossImported) break;
    }
    const normalizedValueA = decls[0]!.valueStr.replace(/\s+/g, '');
    const hasIdenticalValues = decls.every(d => d.valueStr.replace(/\s+/g, '') === normalizedValueA);
    const fileList = uniqueFiles.map(f => path.relative(process.cwd(), f)).join(', ');

    if (!isCrossImported) {
      if (hasIdenticalValues) {
        for (const decl of decls) {
          violations.push({
            file: decl.file,
            line: decl.line,
            message: `Constante duplicada '${constName}' con valor idéntico declarada en múltiples módulos (${fileList}). DEBE modularizarse obligatoriamente en src/logic/constants/ para su reutilización.`,
            context: constName,
            severity: 'error',
            fixable: false,
          });
        }
      } else {
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
    }
  }

  return violations;
}
