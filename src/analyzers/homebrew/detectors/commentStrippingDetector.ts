/**
 * src/analyzers/homebrew/detectors/commentStrippingDetector.ts
 *
 * Detects homebrew regular expressions for stripping comments
 * instead of using canonical stripComments() from src/core/scannerUtils.ts or AuditedDocument.
 */

import { createLineDetector } from '../homebrewTypes.ts';

export const commentStrippingDetector = createLineDetector({
  id: 'comment-stripping',
  ruleId: 'auditor-manual-comment-stripping',
  ruleDescription: 'Limpieza manual de comentarios',
  checkLine(line) {
    const hasManualCommentRegex =
      line.includes('replace(') &&
      (line.includes('\\/\\*') || line.includes('\\/\\/')) &&
      (line.includes('comment') || line.includes("''") || line.includes('""') || line.includes('`'));

    if (hasManualCommentRegex) {
      return "Regex casero para remover comentarios detectado. Usa la utilidad canónica 'stripComments(code)' o 'stripCommentsAndStrings(code)' de 'src/core/scannerUtils.ts'.";
    }
    return null;
  }
});
