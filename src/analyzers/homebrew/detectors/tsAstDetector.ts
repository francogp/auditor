/**
 * src/analyzers/homebrew/detectors/tsAstDetector.ts
 *
 * Detects direct ts.createSourceFile() calls in sub-auditors and analyzers
 * instead of leveraging SharedAstContext, this.context.getAst(), or AuditedDocument.getScriptAst().
 */

import { createLineDetector } from '../homebrewTypes.ts';

export const tsAstDetector = createLineDetector({
  id: 'ts-ast',
  ruleId: 'auditor-manual-ts-ast',
  ruleDescription: 'Creación aislada de AST TypeScript',
  checkLine(line) {
    if (line.includes('ts.createSourceFile(')) {
      return "Llamada directa a 'ts.createSourceFile()'. Usa 'this.context.getAst()', 'SharedAstContext', 'FileScanAuditor' o 'AuditedDocument.getScriptAst()' para cachear y unificar el AST.";
    }
    return null;
  }
});
