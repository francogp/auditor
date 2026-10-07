/**
 * tests/agents_mandate_analyzer.test.ts
 *
 * HERMETIC UNIT TESTS FOR AGENTS MANDATE ANALYZER
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  extractContractSections,
  matchesMandateLanguage,
  injectOrUpdateMandateInAgentsMd,
  findLocalContractsHeaderLine
} from '../src/analyzers/agentsMandateAnalyzer.ts';

describe('agentsMandateAnalyzer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-mandate-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractContractSections', () => {
    it('splits markdown content into bullet sections and paragraphs', () => {
      const markdown = `
# Title

Some introductory text.

## Local Contracts

- **Contract 1**: Details about contract 1.
- **Contract 2**: Details about contract 2.
  Continuation of contract 2.

Another paragraph.
`;
      const sections = extractContractSections(markdown);
      expect(sections.length).toBeGreaterThanOrEqual(4);
      expect(sections.some(s => s.includes('Contract 1'))).toBe(true);
      expect(sections.some(s => s.includes('Contract 2'))).toBe(true);
    });
  });

  describe('matchesMandateLanguage', () => {
    const enTokens = /prohibit|consult/i;
    const esTokens = /prohibido|consultar/i;

    it('returns true when language matches english without spanish tokens', () => {
      expect(matchesMandateLanguage('You must consult developers before making changes.', 'en', enTokens, esTokens)).toBe(true);
    });

    it('returns false when language is english but contains spanish tokens', () => {
      expect(matchesMandateLanguage('You must consult developers pero esto está prohibido.', 'en', enTokens, esTokens)).toBe(false);
    });

    it('returns true when language is spanish and contains spanish tokens', () => {
      expect(matchesMandateLanguage('Está prohibido realizar cambios sin consultar.', 'es', enTokens, esTokens)).toBe(true);
    });

    it('returns true when expectedLanguage is undefined', () => {
      expect(matchesMandateLanguage('Arbitrary text', undefined, enTokens, esTokens)).toBe(true);
    });
  });

  describe('injectOrUpdateMandateInAgentsMd', () => {
    it('updates existing mandate in place', () => {
      const agentsMdPath = path.join(tempDir, 'AGENTS.md');
      const initialContent = `# Title\n\n## Local Contracts\n\n- Old mandate text\n- Another rule\n`;
      fs.writeFileSync(agentsMdPath, initialContent, 'utf8');

      injectOrUpdateMandateInAgentsMd({
        agentsMdPath,
        content: initialContent,
        canonicalSnippet: '- Canonical mandate text',
        isExistingLine: line => line.includes('Old mandate text')
      });

      const updated = fs.readFileSync(agentsMdPath, 'utf8');
      expect(updated).toContain('- Canonical mandate text');
      expect(updated).not.toContain('- Old mandate text');
      expect(updated).toContain('- Another rule');
    });

    it('injects under ## Local Contracts when mandate is absent', () => {
      const agentsMdPath = path.join(tempDir, 'AGENTS.md');
      const initialContent = `# Title\n\n## Local Contracts\n\n- Another rule\n`;
      fs.writeFileSync(agentsMdPath, initialContent, 'utf8');

      injectOrUpdateMandateInAgentsMd({
        agentsMdPath,
        content: initialContent,
        canonicalSnippet: '- Canonical mandate text',
        isExistingLine: line => line.includes('Old mandate text')
      });

      const updated = fs.readFileSync(agentsMdPath, 'utf8');
      expect(updated).toContain('- Canonical mandate text');
      expect(updated).toContain('- Another rule');
    });

    it('appends ## Local Contracts when header is absent', () => {
      const agentsMdPath = path.join(tempDir, 'AGENTS.md');
      const initialContent = `# Title\n\nSome description.\n`;
      fs.writeFileSync(agentsMdPath, initialContent, 'utf8');

      injectOrUpdateMandateInAgentsMd({
        agentsMdPath,
        content: initialContent,
        canonicalSnippet: '- Canonical mandate text',
        isExistingLine: line => line.includes('Old mandate text')
      });

      const updated = fs.readFileSync(agentsMdPath, 'utf8');
      expect(updated).toContain('## Local Contracts');
      expect(updated).toContain('- Canonical mandate text');
    });
  });

  describe('findLocalContractsHeaderLine', () => {
    it('returns line number when header is present', () => {
      const content = '# Title\n\n## Ownership\n\n## Local Contracts\n\n- rule';
      expect(findLocalContractsHeaderLine(content)).toBe(5);
    });

    it('returns line 1 when header is missing', () => {
      const content = '# Title\n\nSome text';
      expect(findLocalContractsHeaderLine(content)).toBe(1);
    });
  });
});
