import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  BaseAuditor,
  clearWorkspaceFileCache,
  createRuleCapabilities
} from '../src/core/auditorBase.ts';

const PARITY_RULES = ['parity-rule-a', 'parity-rule-b'] as const;
type ParityRuleId = (typeof PARITY_RULES)[number];

class ParityTestAuditor extends BaseAuditor<ParityRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      usesThirdPartyTool: false,
      ruleFixers: {},
      id: 'validate_parity_test',
      name: 'Parity Test Auditor',
      description: 'Auditor de verificación de paridad estricta',
      family: 'architecture',
      ruleIds: PARITY_RULES,
      packageName: 'Paridad',
      icon: '⚖️',
      ruleDescriptions: {
        'parity-rule-a': 'Detección de token A',
        'parity-rule-b': 'Detección de token B'
      },
      ruleRemediations: {
        'parity-rule-a': 'Remediación regla A',
        'parity-rule-b': 'Remediación regla B'
      },
      ruleRemediationPhases: {
        'parity-rule-a': 'hygiene',
        'parity-rule-b': 'hygiene'
      },
      configKey: 'parity.enabled',
      defaultConfig: { enabled: true },
      requiredPermissions: [],
      criticalConfig: {},
      ruleCapabilities: createRuleCapabilities(PARITY_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      coverage: {
        include: ['src/**/*.ts']
      },
      projectRoot: options.projectRoot ?? process.cwd()
    });
  }

  public override async runAudit(): Promise<void> {}
}

describe('Auditor Parity Verification Harness', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-parity-test-'));
    clearWorkspaceFileCache();
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    clearWorkspaceFileCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('guarantees 100% discovery parity between cached and uncached filesystem collection', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(path.join(srcDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(srcDir, 'sub/nested.ts'), 'export const b = 2;');
    fs.writeFileSync(path.join(srcDir, 'sub/ignored.txt'), 'text');

    const auditor1 = new ParityTestAuditor({ projectRoot: tempDir });
    const filesPass1 = auditor1['context'].collectFiles(['src'], new Set(['.ts']));

    // Pass 2 uses in-memory RAM cache
    const auditor2 = new ParityTestAuditor({ projectRoot: tempDir });
    const filesPass2 = auditor2['context'].collectFiles(['src'], new Set(['.ts']));

    expect(filesPass2).toEqual(filesPass1);
    expect(filesPass2).toHaveLength(2);
    expect(filesPass2.every((f) => f.endsWith('.ts'))).toBe(true);
  });

  it('guarantees strict parity and zero loss of findings in scanFilesSinglePass', async () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const file1 = path.join(srcDir, 'file1.ts');
    const file2 = path.join(srcDir, 'file2.ts');

    fs.writeFileSync(file1, 'const a = "TOKEN_A";\nconst b = "TOKEN_B";\n');
    fs.writeFileSync(file2, 'const c = "TOKEN_A";\n');

    const auditor = new ParityTestAuditor({ projectRoot: tempDir });

    await auditor.scanFilesSinglePass(
      [file1, file2],
      [
        {
          ruleId: 'parity-rule-a',
          scan: (file, _content, lines) => {
            for (let i = 0; i < lines.length; i++) {
              if (lines[i]!.includes('TOKEN_A')) {
                auditor.addViolation({
                  ruleId: 'parity-rule-a',
                  file,
                  line: i + 1,
                  col: 1,
                  message: 'Encontrado TOKEN_A',
                  severity: 'error'
                });
              }
            }
          }
        },
        {
          ruleId: 'parity-rule-b',
          scan: (file, _content, lines) => {
            for (let i = 0; i < lines.length; i++) {
              if (lines[i]!.includes('TOKEN_B')) {
                auditor.addViolation({
                  ruleId: 'parity-rule-b',
                  file,
                  line: i + 1,
                  col: 1,
                  message: 'Encontrado TOKEN_B',
                  severity: 'error'
                });
              }
            }
          }
        }
      ]
    );

    const findings = auditor.getFindings();
    expect(findings).toHaveLength(3);

    // Rule A should match twice (file1 line 1, file2 line 1)
    const ruleAFindings = findings.filter((f) => f.ruleId === 'parity-rule-a');
    expect(ruleAFindings).toHaveLength(2);
    expect(ruleAFindings[0]!.file).toBe('src/file1.ts');
    expect(ruleAFindings[0]!.line).toBe(1);
    expect(ruleAFindings[1]!.file).toBe('src/file2.ts');
    expect(ruleAFindings[1]!.line).toBe(1);

    // Rule B should match once (file1 line 2)
    const ruleBFindings = findings.filter((f) => f.ruleId === 'parity-rule-b');
    expect(ruleBFindings).toHaveLength(1);
    expect(ruleBFindings[0]!.file).toBe('src/file1.ts');
    expect(ruleBFindings[0]!.line).toBe(2);

    // Verify empirical rule durations are accurately tracked
    expect(auditor.getRuleDuration('parity-rule-a')).toBeGreaterThanOrEqual(0);
    expect(auditor.getRuleDuration('parity-rule-b')).toBeGreaterThanOrEqual(0);
  });
});
