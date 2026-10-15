import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidateCodeSimplificationAuditor,
  CODE_SIMPLIFICATION_RULES
} from '../src/suites/architecture/validate_code_simplification.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateCodeSimplificationAuditor Conformance & Rule Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplify-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Point 1: Construction & Metadata Conformance', () => {
    it('initializes with correct auditor metadata and Spanish rule descriptions', () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_code_simplification');
      expect(auditor.name).toBe('Code Complexity & Readability Simplifier Validator');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Simplify');
      expect(auditor.icon).toBe('🧹');
      expect(auditor.ruleIds).toEqual([...CODE_SIMPLIFICATION_RULES]);
      expect(auditor.ruleDescriptions['dead-code-accumulation']).toBe(
        'Bloques de código muerto comentados'
      );
      expect(auditor.ruleDescriptions['boolean-trap-parameters']).toBe(
        'Parámetros booleanos posicionales'
      );
      expect(auditor.ruleDescriptions['deep-nesting-control-flow']).toBe(
        'Anidamiento excesivo > 4 niveles'
      );
      expect(auditor.ruleDescriptions['redundant-else-after-return']).toBe(
        'Cláusula else tras return o throw'
      );
      expect(auditor.ruleDescriptions['premature-abstraction-wrapper']).toBe(
        'Wrapper innecesario sin lógica'
      );
      expect(auditor.ruleDescriptions['massive-switch-branching']).toBe(
        'Switch masivo con más de 10 casos'
      );

      const constructionErrors = validateAuditorConstruction(auditor);
      expect(constructionErrors).toHaveLength(0);
    });
  });

  describe('Point 2: Clean Path Verification', () => {
    it('passes cleanly reporting zero errors on clean code using guard clauses and map tables', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const cleanSnippet = [
        'export function calculateDiscount(price: number, options: { isVip?: boolean; isPromo?: boolean }): number {',
        '  if (price <= 0) return 0;',
        '  const rate = options.isVip ? 0.2 : 0.05;',
        '  return price * rate;',
        '}',
        'const ACTION_MAP = new Map<string, () => void>([',
        '  ["save", () => {}],',
        '  ["delete", () => {}]',
        ']);'
      ].join('\n');

      auditor.testScanFile('src/utils/calculator.ts', cleanSnippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Point 3: Violation Detection Path for All 6 Rules', () => {
    it('detects dead-code-accumulation when blocks of code are commented out', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const snippet = ['// const x = 10;', '// const y = 20;', '// return x + y;'].join('\n');

      auditor.testScanFile('src/services/legacy.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'dead-code-accumulation');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects boolean-trap-parameters when signature has multiple boolean arguments', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const snippet =
        'function sendNotification(msg: string, isUrgent: boolean, sendSms: boolean): void {}';

      auditor.testScanFile('src/services/notifier.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'boolean-trap-parameters');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects deep-nesting-control-flow when block nesting exceeds 4 levels', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const snippet = [
        'if (a) {',
        '  if (b) {',
        '    if (c) {',
        '      if (d) {',
        '        if (e) {',
        '          console.log("Too deep");',
        '        }',
        '      }',
        '    }',
        '  }',
        '}'
      ].join('\n');

      auditor.testScanFile('src/services/deep.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'deep-nesting-control-flow');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects redundant-else-after-return when else follows immediate return', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const snippet = [
        'function check(v: number): string {',
        '  if (v > 0) {',
        '    return "positive";',
        '  } else {',
        '    return "non-positive";',
        '  }',
        '}'
      ].join('\n');

      auditor.testScanFile('src/services/check.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'redundant-else-after-return');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects premature-abstraction-wrapper when function merely delegates identical arguments', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const snippet =
        'function wrapAdd(a: number, b: number): number { return originalAdd(a, b); }';

      auditor.testScanFile('src/services/mathWrapper.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'premature-abstraction-wrapper');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects massive-switch-branching when switch has more than 10 cases', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const cases = Array.from({ length: 12 }, (_, i) => `case ${i}: return ${i};`).join('\n');
      const snippet = `function getVal(x: number) { switch (x) { ${cases} default: return -1; } }`;

      auditor.testScanFile('src/services/hugeSwitch.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'massive-switch-branching');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('does not falsely trigger deep-nesting-control-flow on deeply nested object literals', async () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const snippet = [
        'export const deeplyNestedConfig = {',
        '  level1: {',
        '    level2: {',
        '      level3: {',
        '        level4: {',
        '          level5: {',
        '            key: "value"',
        '          }',
        '        }',
        '      }',
        '    }',
        '  }',
        '};'
      ].join('\n');

      auditor.testScanFile('src/config/deepObject.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('allows 2D matrix loops when allowMatrixLoops is configured', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          codeSimplification: {
            allowMatrixLoops: true,
            maxNestingDepth: 4
          }
        })
      );

      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const matrixLoopSnippet = [
        'export function renderGrid(width: number, height: number): void {',
        '  for (let y = 0; y < height; y++) {',
        '    for (let x = 0; x < width; x++) {',
        '      if (x > 0) {',
        '        if (y > 0) {',
        '          console.log(x, y);',
        '        }',
        '      }',
        '    }',
        '  }',
        '}'
      ].join('\n');

      auditor.testScanFile('src/game/grid.ts', matrixLoopSnippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('honors exemptPaths dynamically configured in audit.config.json', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          codeSimplification: {
            exemptPaths: ['src/generated/**']
          }
        })
      );

      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      const overNestedSnippet = [
        'if (a) { if (b) { if (c) { if (d) { if (e) { console.log(1); } } } } }'
      ].join('\n');

      auditor.testScanFile('src/generated/bundle.ts', overNestedSnippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Point 4 & 5: Duration Invariants & 100% Rule Coverage', () => {
    it('measures real empirical durations for 100% of declared rules', () => {
      const auditor = new ValidateCodeSimplificationAuditor({ projectRoot: tempDir });
      auditor.testScanFile('src/clean.ts', 'const x = 1;');

      for (const rule of CODE_SIMPLIFICATION_RULES) {
        const duration = auditor.getRuleDuration(rule);
        expect(duration).toBeDefined();
        expect(duration!).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
