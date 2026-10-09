/**
 * @file validate_mermaid_syntax.test.ts
 * @description Dedicated unit test suite for ValidateMermaidSyntaxAuditor and native Mermaid validator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  ValidateMermaidSyntaxAuditor,
  MERMAID_SYNTAX_RULES,
  validateMermaid,
  validate,
  type MermaidSyntaxRuleId
} from '../src/suites/documentation/validate_mermaid_syntax.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
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

    it('satisfies 100% of BaseAuditor metadata contracts via validateAuditorConstruction', () => {
      const auditor = new ValidateMermaidSyntaxAuditor([], PROJECT_ROOT);
      const errors = validateAuditorConstruction(auditor, 'validate_mermaid_syntax');
      expect(errors).toHaveLength(0);
    });

    it('ensures rule descriptions stay within length constraints', () => {
      const auditor = new ValidateMermaidSyntaxAuditor([], PROJECT_ROOT);
      for (const [, desc] of Object.entries(auditor.ruleDescriptions)) {
        const fullDesc = `${auditor.packageName}: ${desc}`;
        expect(fullDesc.length).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('Official Mermaid Validator Engine (Unit)', () => {
    it('validates well-formed flowcharts and graphs', async () => {
      const flowchartCode = [
        'graph TD',
        '    A["Start"] --> B{"Decision"}',
        '    B -->|"Yes"| C["Done"]',
        '    B -->|"No"| D["Retry"]'
      ].join('\n');

      const result = await validateMermaid(flowchartCode);
      expect(result.valid).toBe(true);
      expect(result.diagramType).toContain('flowchart');
    });

    it('validates subgraphs and direction keywords', async () => {
      const code = [
        'flowchart LR',
        '    subgraph Core ["Core Engine"]',
        '        direction TB',
        '        A --> B',
        '    end',
        '    B --> C'
      ].join('\n');

      const result = await validateMermaid(code);
      expect(result.valid).toBe(true);
    });

    it('validates diagrams with frontmatter and directives', async () => {
      const code = [
        '---',
        'title: System Architecture',
        '---',
        '%%{init: {"theme": "neutral"}}%%',
        'flowchart TD',
        '    A --> B'
      ].join('\n');

      const result = await validateMermaid(code);
      expect(result.valid).toBe(true);
      expect(result.diagramType).toContain('flowchart');
    });

    it('validates sequence diagrams with nested blocks', async () => {
      const seqCode = [
        'sequenceDiagram',
        '    autonumber',
        '    actor User',
        '    participant Server',
        '    User->>Server: Request',
        '    loop Polling',
        '        Server-->>User: Status 200',
        '    end',
        '    alt Success',
        '        Server->>User: OK',
        '    else Failure',
        '        Server->>User: Error',
        '    end'
      ].join('\n');

      const result = await validateMermaid(seqCode);
      expect(result.valid).toBe(true);
      expect(result.diagramType).toBe('sequence');
    });

    it('validates class, state, and er diagrams', async () => {
      const classCode = 'classDiagram\n    class Animal {\n        +String name\n        +makeSound()\n    }';
      expect((await validateMermaid(classCode)).valid).toBe(true);

      const stateCode = 'stateDiagram-v2\n    [*] --> Still\n    Still --> [*]';
      expect((await validateMermaid(stateCode)).valid).toBe(true);

      const erCode = 'erDiagram\n    CUSTOMER ||--o{ ORDER : places';
      expect((await validateMermaid(erCode)).valid).toBe(true);
    });

    it('validates pie charts and git graphs', async () => {
      const pieCode = 'pie title Browser Usage\n    "Chrome" : 65.2\n    "Firefox" : 12.8';
      expect((await validateMermaid(pieCode)).valid).toBe(true);

      const gitCode = 'gitGraph\n    commit\n    branch dev\n    checkout dev\n    commit\n    checkout main\n    merge dev';
      expect((await validateMermaid(gitCode)).valid).toBe(true);
    });

    it('rejects empty diagrams', async () => {
      const res = await validateMermaid('');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toContain('vacío');
    });

    it('rejects unknown diagram headers', async () => {
      const res = await validateMermaid('foobarDiagram\n    A --> B');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/No diagram type detected|Parse error/i);
    });

    it('rejects unclosed subgraphs in flowcharts', async () => {
      const res = await validateMermaid('flowchart TD\n    subgraph Unfinished\n        A --> B');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/Parse error|Expecting/i);
    });

    it('rejects orphan end instructions', async () => {
      const res = await validateMermaid('flowchart TD\n    A --> B\n    end');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/Parse error/i);
    });

    it('rejects unbalanced brackets in node definitions', async () => {
      const res = await validateMermaid('flowchart TD\n    A[Unclosed bracket --> B');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/Parse error/i);
    });

    it('rejects unclosed blocks in sequence diagrams', async () => {
      const res = await validateMermaid('sequenceDiagram\n    loop Every 5s\n        A->>B: Ping');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/Parse error/i);
    });

    it('rejects orphan else outside alt/critical in sequence diagrams', async () => {
      const res = await validateMermaid('sequenceDiagram\n    A->>B: Ping\n    else Stray');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/Parse error/i);
    });

    it('rejects invalid pie slices', async () => {
      const res = await validateMermaid('pie title Test\n    "InvalidSlice" : not_a_number');
      expect(res.valid).toBe(false);
      expect(res.error?.message).toMatch(/Parse error/i);
    });

    it('supports backward-compatible validate async helper', async () => {
      const validRes = await validate('graph TD\n    A --> B');
      expect(validRes).toEqual({ diagramType: 'flowchart-v2', valid: true });

      await expect(validate('graph TD\n    A --->>> B')).rejects.toThrow(/Parse error/i);
      const suppressed = await validate('graph TD\n    A --->>> B', { suppressErrors: true });
      expect(suppressed).toBe(false);
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

    it('passes cleanly on multiple valid diagrams across Markdown documents', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Flowchart Section',
        '```mermaid',
        'flowchart TD',
        '    NodeA["Alpha"] --> NodeB["Beta"]',
        '```',
        '',
        '# Sequence Section',
        '```mermaid',
        'sequenceDiagram',
        '    Alice->>Bob: Hello',
        '    Bob-->>Alice: Hi',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/multi.md', content);
      expect(auditor.collectedViolations).toHaveLength(0);
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

    it('detects unknown diagram headers in markdown files', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'invalidDiagramHeader',
        '    A --> B',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/invalid_header.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-syntax-error');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.message).toContain('Error de sintaxis en diagrama Mermaid');
    });

    it('detects unclosed subgraphs in markdown diagrams', async () => {
      const auditor = new TestableMermaidSyntaxAuditor([], PROJECT_ROOT);
      const content = [
        '# Document',
        '```mermaid',
        'flowchart TD',
        '    subgraph Core',
        '        A --> B',
        '```'
      ].join('\n');

      await auditor.testScanFile('docs/unclosed_subgraph.md', content);
      const violations = auditor.collectedViolations.filter(v => v.ruleId === 'mermaid-syntax-error');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.message).toContain('subgraph');
    });
  });
});
