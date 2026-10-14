/**
 * src/analyzers/homebrew/detectors/inefficientFileScanDetector.ts
 *
 * Detects legacy inefficient file iteration patterns in sub-auditors and extensions:
 * 1. Rule-then-file nesting: Outer loop over rules with an inner loop reading files from disk.
 * 2. Blind wildcards: Passing recursive wildcard globs directly to external linters instead of passing discovered target files.
 */

import { type HomebrewDetector, type HomebrewFinding, type HomebrewInspectionContext } from '../homebrewTypes.ts';

export const inefficientFileScanDetector: HomebrewDetector = {
  id: 'inefficient-file-scan',
  ruleId: 'auditor-inefficient-file-scan',
  ruleDescription: 'Escaneo ineficiente de archivos',

  detect(context: HomebrewInspectionContext): HomebrewFinding[] {
    const findings: HomebrewFinding[] = [];
    const lines = context.lines;

    let inRuleLoop = false;
    let ruleLoopBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Ignore comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Check for blind wildcard passed to external CLI
      const isConfigObjectPattern = /^\s*files\s*:\s*\[/.test(trimmed) || line.includes('overrideConfig');

      if (
        /['"]\*\*\/\*\.(?:md|vue|html|ts|js)['"]/.test(trimmed) &&
        !isConfigObjectPattern &&
        !line.includes('// glob-ok:') &&
        !line.includes('coverage') &&
        !line.includes('include:') &&
        !line.includes('targetArgs') &&
        !context.filePath.includes('inefficientFileScanDetector')
      ) {
        findings.push({
          ruleId: 'auditor-inefficient-file-scan',
          line: lineNum,
          message:
            "Comodín ciego global ('**/*.ext') detectado en llamada a herramienta externa. Pasa la lista de archivos descubiertos por el auditor o usa targetArgs acotados.",
          context: trimmed.slice(0, 100),
          severity: 'error'
        });
      }

      // Track rule loop start
      if (
        !inRuleLoop &&
        /for\s*\(\s*(?:const|let|var)\s+\w+\s+of\s+(?:[A-Z_]+_RULES|this\.ruleIds|this\.getRuleCatalog\(\))\s*\)/.test(line)
      ) {
        inRuleLoop = true;
        ruleLoopBraceDepth = 0;
      }

      if (inRuleLoop) {
        // Track braces to know when rule loop ends
        for (const char of line) {
          if (char === '{') ruleLoopBraceDepth++;
          if (char === '}') ruleLoopBraceDepth--;
        }

        // Inside rule loop, check for inner file iteration reading disk
        if (
          /for\s*\(\s*(?:const|let|var)\s+\w+\s+of\s+(?:filePaths|files|allFiles|candidateFiles)\s*\)/.test(line) &&
          !line.includes('// nesting-ok:')
        ) {
          findings.push({
            ruleId: 'auditor-inefficient-file-scan',
            line: lineNum,
            message:
              "Bucle anidado de regla sobre archivos detectado. Invierte el bucle (recorre cada archivo una sola vez en RAM) o usa 'this.scanFilesSinglePass()'.",
            context: trimmed.slice(0, 100),
            severity: 'error'
          });
        }

        if (ruleLoopBraceDepth <= 0 && line.includes('}')) {
          inRuleLoop = false;
        }
      }
    }

    return findings;
  }
};
