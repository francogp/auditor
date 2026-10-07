/**
 * src/analyzers/agentsMandateAnalyzer.ts
 *
 * AGENTS.MD MANDATE ANALYZER & AUTO-REPAIR HELPER (Node.js 26+ Native)
 * Provides shared utilities to parse, validate, and inject canonical governance
 * mandates into the root AGENTS.md document without code duplication.
 */

import fsSync from 'node:fs';
import type { DocumentationLanguage } from '../core/auditConfigTypes.ts';

/**
 * Splits markdown content into structural contract sections / paragraph chunks,
 * properly respecting bullet lists and whitespace.
 */
export function extractContractSections(content: string): readonly string[] {
  const fileLines = content.split('\n');
  const sections: string[] = [];
  let currentLines: string[] = [];

  for (const line of fileLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed === '') {
      if (currentLines.length > 0) {
        sections.push(currentLines.join('\n'));
        currentLines = [];
      }
    }
    if (trimmed !== '') {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push(currentLines.join('\n'));
  }

  return sections;
}

/**
 * Checks whether text satisfies the expected documentation language constraint.
 */
export function matchesMandateLanguage(
  text: string,
  expectedLanguage: DocumentationLanguage | undefined,
  englishTokens: RegExp,
  spanishTokens: RegExp
): boolean {
  if (expectedLanguage === 'en') {
    return englishTokens.test(text) && !spanishTokens.test(text);
  }
  if (expectedLanguage === 'es') {
    return spanishTokens.test(text);
  }
  return true;
}

export interface InjectMandateOptions {
  agentsMdPath: string;
  content: string;
  canonicalSnippet: string;
  isExistingLine: (line: string) => boolean;
}

/**
 * Injects or updates a canonical mandate under `## Local Contracts` in AGENTS.md in-place.
 */
export function injectOrUpdateMandateInAgentsMd(options: InjectMandateOptions): void {
  const { agentsMdPath, content, canonicalSnippet, isExistingLine } = options;
  const lines = content.split('\n');
  const existingIndex = lines.findIndex(isExistingLine);

  if (existingIndex !== -1) {
    lines[existingIndex] = canonicalSnippet;
    fsSync.writeFileSync(agentsMdPath, lines.join('\n'), 'utf8');
    return;
  }

  const contractHeaderIndex = lines.findIndex(l => l.trim().startsWith('## Local Contracts'));
  if (contractHeaderIndex !== -1) {
    lines.splice(contractHeaderIndex + 1, 0, '', canonicalSnippet);
    fsSync.writeFileSync(agentsMdPath, lines.join('\n'), 'utf8');
    return;
  }

  const appended = content.trimEnd() + '\n\n## Local Contracts\n\n' + canonicalSnippet + '\n';
  fsSync.writeFileSync(agentsMdPath, appended, 'utf8');
}

/**
 * Finds the 1-indexed line number of the `## Local Contracts` header in AGENTS.md content.
 */
export function findLocalContractsHeaderLine(content: string): number {
  const fileLines = content.split('\n');
  const index = fileLines.findIndex(line => line.trim().startsWith('## Local Contracts'));
  return index !== -1 ? index + 1 : 1;
}
