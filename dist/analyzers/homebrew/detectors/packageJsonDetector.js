/**
 * src/analyzers/homebrew/detectors/packageJsonDetector.ts
 *
 * Detects manual reading or JSON parsing of package.json instead of canonical getPackageJson().
 */
import { createLineDetector } from "../homebrewTypes.js";
export const packageJsonDetector = createLineDetector({
    id: 'package-json',
    ruleId: 'auditor-manual-package-json',
    ruleDescription: 'Lectura manual de package.json',
    checkLine(line) {
        const readsManualPkg = (line.includes('readFileSync(') && line.includes('package.json')) ||
            (line.includes('JSON.parse(') && line.includes('package.json') && !line.includes('getPackageJson')) ||
            (/readFileSync\([^)]*\)/.test(line) && line.includes('pkgPath'));
        if (readsManualPkg && !line.includes('getPackageJson(')) {
            return "Lectura manual de 'package.json' detectada. Usa la utilidad canónica 'getPackageJson(projectRoot)' de 'src/core/packageJson.ts'.";
        }
        return null;
    }
});
//# sourceMappingURL=packageJsonDetector.js.map