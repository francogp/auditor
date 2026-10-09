/**
 * @file validate_mermaid_syntax.test.ts
 * @description Dedicated unit test suite for ValidateMermaidSyntaxAuditor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  ValidateMermaidSyntaxAuditor,
  MERMAID_SYNTAX_RULES,
  type MermaidSyntaxRuleId
} from '../src/suites/documentation/validate_mermaid_syntax.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

class TestableMermaidSyntaxAuditor extends ValidateMermaidSyntaxAuditor {
  public readonly collectedViolations: ViolationInput<MermaidSyntaxRuleId>[] = [];

  public override addViolation(v: ViolationInput<MermaidSyntaxRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public async testScanFile(relPath: string, content: string): Promise<void> {
    await this.scanFile(relPath, content);
  }
}

describe('ValidateMermaidSyntaxAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Conformance', () => {
    it('declares all expected canonical rules', () => {
      expect(MERMAID_SYNTAX_RULES).toContain('mermaid-syntax-error');
      expect(MERMAID_SYNTAX_RULES).toContain('mermaid-unquoted-special-chars');
    });

    it('initializes with correct id and family metadata', () => {
      const auditor = new ValidateMermaidSyntaxAuditor([], PROJECT_ROOT);
      expect(auditor.id).toBe('validate_mermaid_syntax');
      expect(auditor.family).toBe('documentation');
      expect(auditor.packageName).toBe('Doc');
      expect(auditor.capabilities.md).toBe(true);
      expect(auditor.capabilities.lint).toBe(true);
      expect(auditor.ruleIds).toContain('mermaid-syntax-error');
      expect(auditor.ruleIds).toContain('mermaid-unquoted-special-chars');
    });

    it('ensures rule descriptions stay within length constraints', () => {
      const auditor = new ValidateMermaidSyntaxAuditor([], PROJECT_ROOT);
      for (const [ruleId, desc] of Object.entries(auditor.ruleDescriptions)) {
        const fullDesc = `${auditor.packageName}: ${desc}`;
        expect(fullDesc.length).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('Clean Path Testing', () => {
    it('passes cleanly on well-formed Mermaid diagrams with properly quoted nodes and edges', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Valid Guide',
        '```mermaid',
        'graph TD',
        '    A["Start Task"] --> B{"Is Valid?"}',
        '    B -->|"Yes, 100% Verified"| C["Proceed"]',
        '    B -->|"No (Rejected)"| D["Halt"]',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/guide.md', content);
      expect(auditor.collectedViolations).toHaveLength(0);
      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Violation Path: Unquoted Special Characters', () => {
    it('detects unquoted % in edge labels (mermaid-unquoted-special-chars)', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    A -->|100% Pass| B',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/spec.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-unquoted-special-chars');
      expect(violations).toHaveLength(1);
      expect(violations[0]?.severity).toBe('error');
      expect(violations[0]?.message).toContain('100% Pass');
    });

    it('detects unquoted &, <, and Unicode comparisons in edge labels', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    A -->|Score < 85| B',
        '    B -->|Build Exit 0 & Chunks OK| C',
        '    C -->|Exit code ≠ 0| D',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/spec.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-unquoted-special-chars');
      expect(violations).toHaveLength(3);
    });

    it('detects unquoted parentheses in node brackets (mermaid-unquoted-special-chars)', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    C0[2.1 git fetch origin (0 errors)] --> C2',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/spec.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-unquoted-special-chars');
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('2.1 git fetch origin (0 errors)');
    });

    it('detects unquoted slashes in edge labels', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    C4 -->|Chunk bloat / budget exceeded| REPAIR',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/spec.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-unquoted-special-chars');
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('Chunk bloat / budget exceeded');
    });

    it('detects unquoted question marks in decision brace nodes', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    STOP1{🛑 USER APPROVES learning_proposal.md?}',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/spec.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-unquoted-special-chars');
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain('learning_proposal.md?');
    });

    it('honors line escape hatch <!-- mermaid-ok -->', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    A -->|100% Pass| B <!-- mermaid-ok -->',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/spec.md', content);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Violation Path: Syntax Errors via Parser', () => {
    it('detects broken diagram syntax (mermaid-syntax-error)', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'graph TD',
        '    A --->>> invalid ??? <<<--- B',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/broken.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-syntax-error');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.severity).toBe('error');
    });
  });
});
