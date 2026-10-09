/**
 * src/analyzers/homebrew/detectors/pathContainmentDetector.ts
 *
 * Detects manual startsWith('..') path escape checks
 * instead of using canonical isPathContained() or safeResolve() from src/core/safePath.ts.
 */

import { createLineDetector } from '../homebrewTypes.ts';

export const pathContainmentDetector = createLineDetector({
  id: 'path-containment',
  ruleId: 'auditor-manual-path-containment',
  ruleDescription: 'Validación manual de rutas CWE-22',
  checkLine(line, _trimmed, _lineNum, context) {
    if (context.filePath.includes('validate_native_paths.ts')) return null;

    const hasManualCwe22 =
      (line.includes("startsWith('..')") || line.includes('startsWith("..")')) &&
      (line.includes('relative(') || line.includes('path') || line.includes('file'));

    if (hasManualCwe22 && !line.includes('isPathContained(')) {
      return "Comprobación manual de contención o escape de ruta (CWE-22) con 'startsWith(\"..')'. Usa 'isPathContained(baseDir, targetPath)' o 'safeResolve()' de 'src/core/safePath.ts'.";
    }
    return null;
  }
});
