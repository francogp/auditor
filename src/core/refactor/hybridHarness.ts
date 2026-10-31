/**
 * src/core/refactor/hybridHarness.ts
 *
 * CANONICAL DETERMINISTIC HYBRID HARNESS (@ast-grep/napi + ts-morph + Vue SFC + MagicString)
 * Core automated refactoring engine for duplicate & triplicate remediation in @francogp/auditor.
 */

import fs from 'node:fs';
import path from 'node:path';

import MagicString from 'magic-string';
import { Project, SourceFile } from 'ts-morph';

import { toPosixRelative } from '../safePath.ts';
import { tryOrNull, tryOrNullAsync } from '../safeUtils.ts';
import { parseVueSfcBlocks } from '../vueSfcParser.ts';
import type { RefactorPlan } from './refactorContracts.ts';

type AstGrepModule = typeof import('@ast-grep/napi');
let cachedAstGrep: AstGrepModule | null = null;

async function getAstGrep(): Promise<AstGrepModule | null> {
  if (cachedAstGrep) return cachedAstGrep;
  cachedAstGrep = await tryOrNullAsync(async () => await import('@ast-grep/napi'));
  return cachedAstGrep;
}

export class HybridHarnessEngine {
  public static async execute(projectRoot: string, plan: RefactorPlan): Promise<void> {
    const absShared = path.resolve(projectRoot, plan.sharedModulePath);
    fs.mkdirSync(path.dirname(absShared), { recursive: true });

    // 1. Maintain in-memory ts-morph project for type-safe module creation & imports
    const tsconfigPath = path.resolve(projectRoot, 'tsconfig.json');
    const project = new Project({
      tsConfigFilePath: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
      skipAddingFilesFromTsConfig: true
    });

    const sharedFile = await this.ensureSharedModule(project, absShared, plan);

    // 2. Iterate through target files with surgical branch per file type
    for (const relFile of plan.targetFiles) {
      const absFile = path.resolve(projectRoot, relFile);
      if (!fs.existsSync(absFile)) continue;

      const fileContent = fs.readFileSync(absFile, 'utf8');
      if (relFile.endsWith('.vue')) {
        await this.rewriteVueSfc(absFile, fileContent, absShared, plan);
      } else {
        await this.rewriteTypeScriptFile(absFile, relFile, fileContent, sharedFile, project, plan);
      }
    }
  }

  private static async ensureSharedModule(
    project: Project,
    absShared: string,
    plan: RefactorPlan
  ): Promise<SourceFile> {
    let sharedFile = project.getSourceFile(absShared);
    if (!sharedFile) {
      const initialShared = fs.existsSync(absShared) ? fs.readFileSync(absShared, 'utf8') : '';
      sharedFile = project.createSourceFile(absShared, initialShared, { overwrite: true });
    }

    if (!sharedFile.getFunction(plan.functionName)) {
      sharedFile.addStatements(`\nexport ${plan.sharedFunctionCode}\n`);
    }
    await sharedFile.save();
    return sharedFile;
  }

  private static async rewriteVueSfc(
    absFile: string,
    fileContent: string,
    absShared: string,
    plan: RefactorPlan
  ): Promise<void> {
    const { scripts } = parseVueSfcBlocks(fileContent);
    const scriptBlock = scripts.find((s) => s.isSetup) ?? scripts[0];
    if (!scriptBlock) return;

    const s = new MagicString(fileContent);
    const scriptText = scriptBlock.content;
    const scriptOffset = scriptBlock.contentStartIndex;

    const updatedScript = await this.applyAstGrepPatternRewrite(
      'TypeScript',
      scriptText,
      plan.astPattern,
      plan.astRewrite
    );

    s.overwrite(scriptOffset, scriptOffset + scriptText.length, updatedScript);

    const rel = toPosixRelative(path.dirname(absFile), absShared);
    const relImport = rel.endsWith('.ts') ? rel.slice(0, -3) : rel;
    const importSpecifier = relImport.startsWith('.') ? relImport : `./${relImport}`;

    if (
      !updatedScript.includes(`import { ${plan.functionName}`) &&
      !updatedScript.includes(`import ${plan.functionName}`)
    ) {
      s.appendLeft(scriptOffset, `\nimport { ${plan.functionName} } from '${importSpecifier}';\n`);
    }

    fs.writeFileSync(absFile, s.toString(), 'utf8');
  }

  private static async rewriteTypeScriptFile(
    absFile: string,
    relFile: string,
    fileContent: string,
    sharedFile: SourceFile,
    project: Project,
    plan: RefactorPlan
  ): Promise<void> {
    let sourceFile = project.getSourceFile(absFile);
    if (!sourceFile) {
      sourceFile = project.createSourceFile(absFile, fileContent, { overwrite: true });
    }

    const currentText = sourceFile.getFullText();
    const lang = relFile.endsWith('.tsx') ? 'Tsx' : 'TypeScript';

    const updatedText = await this.applyAstGrepPatternRewrite(
      lang,
      currentText,
      plan.astPattern,
      plan.astRewrite
    );
    sourceFile.replaceWithText(updatedText);

    const moduleSpecifier = sourceFile.getRelativePathAsModuleSpecifierTo(sharedFile);
    this.ensureNamedImport(sourceFile, moduleSpecifier, plan.functionName);

    tryOrNull(() => sourceFile.organizeImports());

    await sourceFile.save();
  }

  public static expandMetavariables(
    rewrite: string,
    match: { getMatch?: (name: string) => { text: () => string } | null }
  ): string {
    let result = rewrite;
    const matches = rewrite.match(/\$[A-Z0-9_]+/g);
    if (matches) {
      for (const meta of matches) {
        const varName = meta.slice(1);
        const matchedNode = typeof match.getMatch === 'function' ? match.getMatch(varName) : null;
        if (matchedNode) {
          result = result.replaceAll(meta, matchedNode.text());
        }
      }
    }
    return result;
  }

  private static ensureNamedImport(
    sourceFile: SourceFile,
    moduleSpecifier: string,
    namedImport: string
  ): void {
    const existing = sourceFile
      .getImportDeclarations()
      .find((imp) => imp.getModuleSpecifierValue() === moduleSpecifier);

    if (existing) {
      if (!existing.getNamedImports().some((n) => n.getName() === namedImport)) {
        existing.addNamedImport(namedImport);
      }
    } else {
      sourceFile.addImportDeclaration({
        moduleSpecifier,
        namedImports: [namedImport]
      });
    }
  }

  private static async applyAstGrepPatternRewrite(
    lang: string,
    sourceCode: string,
    pattern: string,
    rewrite: string
  ): Promise<string> {
    const astGrep = await getAstGrep();
    if (astGrep) {
      const transformed = tryOrNull(() => {
        const rootNode = astGrep.parse(lang, sourceCode).root();
        const matches = rootNode.findAll(pattern);

        if (matches.length > 0) {
          const edits = matches
            .map((m) => m.replace(HybridHarnessEngine.expandMetavariables(rewrite, m)))
            .sort((a, b) => b.startPos - a.startPos);

          let updated = sourceCode;
          for (const edit of edits) {
            updated =
              updated.slice(0, edit.startPos) + edit.insertedText + updated.slice(edit.endPos);
          }
          return updated;
        }
        return null;
      });

      if (transformed !== null) {
        return transformed;
      }
    }

    return sourceCode.replace(pattern, rewrite);
  }
}
