/**
 * src/core/refactor/hybridHarness.ts
 *
 * CANONICAL DETERMINISTIC HYBRID HARNESS (@ast-grep/napi + ts-morph + Vue SFC + MagicString)
 * Core automated refactoring engine for duplicate & triplicate remediation in @francogp/auditor.
 */

import fs from 'node:fs';
import path from 'node:path';
import MagicString from 'magic-string';
import { parse as parseAstGrep, Lang } from '@ast-grep/napi';
import { Project, SourceFile } from 'ts-morph';
import { parseVueSfcBlocks } from '../vueSfcParser.ts';
import type { RefactorPlan } from './refactorContracts.ts';

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

    let sharedFile = project.getSourceFile(absShared);
    if (!sharedFile) {
      const initialShared = fs.existsSync(absShared) ? fs.readFileSync(absShared, 'utf8') : '';
      sharedFile = project.createSourceFile(absShared, initialShared, { overwrite: true });
    }

    if (!sharedFile.getFunction(plan.functionName)) {
      sharedFile.addStatements(`\nexport ${plan.sharedFunctionCode}\n`);
    }
    await sharedFile.save();

    // 2. Iterate through target files with surgical branch per file type
    for (const relFile of plan.targetFiles) {
      const absFile = path.resolve(projectRoot, relFile);
      if (!fs.existsSync(absFile)) continue;

      const fileContent = fs.readFileSync(absFile, 'utf8');
      const isVue = relFile.endsWith('.vue');

      if (isVue) {
        // --- VUE SFC SURGICAL REWRITE ---
        const { scripts } = parseVueSfcBlocks(fileContent);
        const scriptBlock = scripts.find((s) => s.isSetup) ?? scripts[0];
        if (!scriptBlock) continue;

        const s = new MagicString(fileContent);
        const scriptText = scriptBlock.content;
        const scriptOffset = scriptBlock.contentStartIndex;

        // Apply pattern replacement on scriptText using @ast-grep/napi
        const updatedScript = this.applyAstGrepPatternRewrite(
          Lang.TypeScript,
          scriptText,
          plan.astPattern,
          plan.astRewrite
        );

        s.overwrite(scriptOffset, scriptOffset + scriptText.length, updatedScript);

        // Inject relative import at top of script block
        const relImport = path
          .relative(path.dirname(absFile), absShared)
          .replace(/\\/g, '/')
          .replace(/\.ts$/, '');
        const importSpecifier = relImport.startsWith('.') ? relImport : `./${relImport}`;

        if (
          !updatedScript.includes(`import { ${plan.functionName}`) &&
          !updatedScript.includes(`import ${plan.functionName}`)
        ) {
          s.appendLeft(
            scriptOffset,
            `\nimport { ${plan.functionName} } from '${importSpecifier}';\n`
          );
        }

        fs.writeFileSync(absFile, s.toString(), 'utf8');
      } else {
        // --- TYPESCRIPT FILE STRUCTURAL & SEMANTIC REWRITE ---
        let sourceFile = project.getSourceFile(absFile);
        if (!sourceFile) {
          sourceFile = project.createSourceFile(absFile, fileContent, { overwrite: true });
        }

        const currentText = sourceFile.getFullText();
        const lang = relFile.endsWith('.tsx') ? Lang.Tsx : Lang.TypeScript;

        const updatedText = this.applyAstGrepPatternRewrite(
          lang,
          currentText,
          plan.astPattern,
          plan.astRewrite
        );
        sourceFile.replaceWithText(updatedText);

        // Add import via ts-morph relative path calculation
        const moduleSpecifier = sourceFile.getRelativePathAsModuleSpecifierTo(sharedFile);
        this.ensureNamedImport(sourceFile, moduleSpecifier, plan.functionName);

        try {
          sourceFile.organizeImports();
        } catch {
          // catch-ok: organizeImports can fail harmlessly on incomplete syntax trees
        }

        await sourceFile.save();
      }
    }
  }

  public static expandMetavariables(rewrite: string, match: any): string {
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

  private static applyAstGrepPatternRewrite(
    lang: Lang,
    sourceCode: string,
    pattern: string,
    rewrite: string
  ): string {
    try {
      const rootNode = parseAstGrep(lang, sourceCode).root();
      const matches = rootNode.findAll(pattern);

      if (matches.length > 0) {
        const edits = matches
          .map((m) => m.replace(HybridHarnessEngine.expandMetavariables(rewrite, m)))
          .sort((a, b) => b.startPos - a.startPos);

        let updated = sourceCode;
        for (const edit of edits) {
          updated = updated.slice(0, edit.startPos) + edit.insertedText + updated.slice(edit.endPos);
        }
        return updated;
      }
    } catch {
      // catch-ok: fallback to direct pattern replacement on syntax/parse errors
    }

    return sourceCode.replace(pattern, rewrite);
  }
}
