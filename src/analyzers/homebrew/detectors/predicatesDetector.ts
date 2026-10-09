/**
 * src/analyzers/homebrew/detectors/predicatesDetector.ts
 *
 * Detects homebrew test path and repository identity predicates (.includes('.spec.'), endsWith('/auditor'))
 * instead of canonical isTestPath() and isSelfProviderProject().
 */

import { createLineDetector } from '../homebrewTypes.ts';

export const predicatesDetector = createLineDetector({
  id: 'predicates',
  ruleId: 'auditor-homebrew-predicates',
  ruleDescription: 'Predicados caseros de rutas o test',
  checkLine(line, _trimmed, _lineNum, context) {
    const hasHomebrewTestCheck =
      (line.includes("includes('.spec.')") || line.includes("includes('.test.')") || line.includes('includes(".spec.")') || line.includes('includes(".test.")')) &&
      !line.includes('isTestPath(') &&
      !context.filePath.includes('auditTestPredicates');

    const hasHomebrewSelfRepoCheck =
      line.includes("endsWith('/auditor')") || line.includes('endsWith("/auditor")');

    if (hasHomebrewTestCheck) {
      return "Comprobación manual de rutas de prueba detectada (.includes('.test.') / '.spec.'). Usa la utilidad canónica 'isTestPath(filePath)' de 'src/core/auditTestPredicates.ts'.";
    }

    if (hasHomebrewSelfRepoCheck) {
      return "Comprobación manual de identidad del repositorio (@francogp/auditor) detectada. Usa la utilidad canónica 'isSelfProviderProject(projectRoot)' de 'src/core/auditProjectIdentity.ts'.";
    }

    return null;
  }
});
