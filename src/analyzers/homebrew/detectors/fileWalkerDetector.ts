/**
 * src/analyzers/homebrew/detectors/fileWalkerDetector.ts
 *
 * Detects custom recursive directory traversal functions (walkDir, getAllFiles)
 * instead of using BaseAuditor collectFiles() or collectRepositoryFiles().
 */

import type {
  HomebrewDetector,
  HomebrewInspectionContext,
  HomebrewFinding
} from '../homebrewTypes.ts';

function extractFunctionBody(lines: readonly string[], startIdx: number): string {
  let braceDepth = 0;
  let started = false;
  const bodyLines: string[] = [];
  const maxIdx = Math.min(lines.length, startIdx + 100);

  for (let j = startIdx; j < maxIdx; j++) {
    const curLine = lines[j]!;
    for (const ch of curLine) {
      if (ch === '{') {
        braceDepth++;
        started = true;
      } else if (ch === '}') {
        braceDepth--;
      }
    }
    if (j > startIdx) {
      bodyLines.push(curLine);
    }
    if (started && braceDepth <= 0) {
      break;
    }
  }

  return bodyLines.join('\n');
}

export const fileWalkerDetector: HomebrewDetector = {
  id: 'file-walker',
  ruleId: 'auditor-manual-file-walker',
  ruleDescription: 'Manual recursive directory walk',
  detect(context: HomebrewInspectionContext): HomebrewFinding[] {
    if (context.isCore && !context.filePath.startsWith('src/core/refactor/')) return [];

    const findings: HomebrewFinding[] = [];
    const lines = context.lines;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Skip AST node walkers, PostCSS walking, and visitor methods
      if (
        /\b(?:node|child)\s*:\s*(?:ts\.)?Node\b/.test(line) ||
        /\bts\.forEachChild\b/.test(line) ||
        /\.(?:walk|walkDecls|walkRules|walkComments|walkAtRules)\s*\(/.test(line)
      ) {
        continue;
      }

      // Canonical collection APIs are strictly allowed
      if (/\b(?:collectFiles|collectRepositoryFiles|scanFilesSinglePass)\b/.test(line)) {
        continue;
      }

      if (/\b(?:fs|nodeFs|fsSync)\.readdirSync\s*\([^)]*\{\s*recursive:\s*true/i.test(line)) {
        findings.push({
          ruleId: 'auditor-manual-file-walker',
          line: i + 1,
          context: line.trim(),
          message:
            "Direct recursive directory traversal with 'readdirSync({ recursive: true })' detected. Use 'this.context.collectFiles()', 'collectRepositoryFiles()' or extend 'FileScanAuditor'."
        });
        continue;
      }

      // Direct calls to known custom directory walkers
      const isWalkerCall =
        /(?<!\.)\b(?:walkDir|walkDirectory|walkFolder|getFilesRecursively|getAllFiles|getAll\w*Files|scanDirRecursively)\s*\(/.test(
          line
        );

      if (isWalkerCall) {
        findings.push({
          ruleId: 'auditor-manual-file-walker',
          line: i + 1,
          context: line.trim(),
          message:
            "Call to manual recursive directory walk function detected. Use 'this.context.collectFiles()', 'collectRepositoryFiles()' or extend 'FileScanAuditor'."
        });
        continue;
      }

      // Declarations of known custom directory walkers
      const isDeclaredWalker =
        /\b(?:function\s+|(?:const|let|var)\s+|(?:private|public|protected)\s+)(?:walk\b|walkDir|walkDirectory|walkFolder|walkTree|walkFiles|getFilesRecursively|getAllFiles|getAll\w*Files|scanDirRecursively)\b/i.test(
          line
        );

      if (isDeclaredWalker) {
        findings.push({
          ruleId: 'auditor-manual-file-walker',
          line: i + 1,
          context: line.trim(),
          message:
            "Manual recursive directory walk function detected. Use 'this.context.collectFiles()', 'collectRepositoryFiles()' or extend 'FileScanAuditor'."
        });
        continue;
      }

      // Generic walker taking directory parameter - only flag if it actually recurses or does recursive readdir
      const genericWalkMatch =
        /\b(?:function\s+|(?:const|let|var)\s+|(?:private|public|protected)\s+)(\w+)\s*(?:=\s*(?:async\s*)?\(\s*|\(\s*)(?:dir|directory|folder|dirPath|currentDir|targetDir)\b/i.exec(
          line
        );

      if (!genericWalkMatch) {
        continue;
      }

      const funcName = genericWalkMatch[1]!;
      const bodyContent = extractFunctionBody(lines, i);
      const usesCanonical =
        bodyContent.includes('collectRepositoryFiles') ||
        bodyContent.includes('collectFiles') ||
        bodyContent.includes('scanFilesSinglePass');

      // Does it call itself recursively INSIDE its own body or call recursive readdir?
      const recursesItself = new RegExp(`\\b${funcName}\\s*\\(`).test(bodyContent);
      const recursiveReaddir = /\breaddir(?:Sync)?\s*\([^)]*\{\s*recursive:\s*true/i.test(
        bodyContent
      );

      if ((recursesItself || recursiveReaddir) && !usesCanonical) {
        findings.push({
          ruleId: 'auditor-manual-file-walker',
          line: i + 1,
          context: line.trim(),
          message:
            "Manual recursive directory walk function detected. Use 'this.context.collectFiles()', 'collectRepositoryFiles()' or extend 'FileScanAuditor'."
        });
      }
    }

    return findings;
  }
};
