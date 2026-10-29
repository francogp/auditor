import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import {
  auditConfigRatchet,
  computeRelaxationCode,
  readGitFile,
  type ConfigRelaxation,
  type RelaxationCode
} from '../src/core/configRatchet.ts';

describe('configRatchet', () => {
  it('computes deterministic RELAX-<8hex> branded code for relaxations', () => {
    const relaxations: ConfigRelaxation[] = [
      {
        file: '.auditor/audit.config.ts',
        path: 'coverage.minLineCoverage',
        description: 'Lowered coverage floor from 90 to 80',
        onlineValue: 90,
        localValue: 80
      }
    ];

    const code = computeRelaxationCode(relaxations);
    expect(code).toMatch(/^RELAX-[a-f0-9]{8}$/);

    // Verify branded type compatibility
    const typedCode: RelaxationCode = code;
    expect(typedCode.startsWith('RELAX-')).toBe(true);

    // Verify determinism: same input produces identical relaxation token
    const duplicateCode = computeRelaxationCode(relaxations);
    expect(duplicateCode).toBe(code);
  });

  it('orders relaxations stably regardless of input ordering', () => {
    const rel1: ConfigRelaxation = {
      file: 'a.json',
      path: 'foo',
      description: 'Relaxed foo'
    };
    const rel2: ConfigRelaxation = {
      file: 'b.json',
      path: 'bar',
      description: 'Relaxed bar'
    };

    const codeA = computeRelaxationCode([rel1, rel2]);
    const codeB = computeRelaxationCode([rel2, rel1]);

    expect(codeA).toBe(codeB);
  });

  it('produces different codes for different relaxation sets', () => {
    const relA: ConfigRelaxation = {
      file: 'config.json',
      path: 'rules.a',
      description: 'Relaxed a'
    };
    const relB: ConfigRelaxation = {
      file: 'config.json',
      path: 'rules.b',
      description: 'Relaxed b'
    };

    const codeA = computeRelaxationCode([relA]);
    const codeB = computeRelaxationCode([relB]);

    expect(codeA).not.toBe(codeB);
  });

  it('normalizes relative file paths cleanly when reading git files', () => {
    // Calling readGitFile with backslashes or non-existent commit fails gracefully with null
    const result = readGitFile(process.cwd(), 'non-existent-commit-hash', 'src\\core\\safePath.ts');
    expect(result).toBeNull();
  });

  it('detects unauthorized relaxations in .auditor/audit.config.ts against git HEAD', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-ratchet-test-'));
    try {
      childProcess.spawnSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
      childProcess.spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tempDir,
        stdio: 'ignore'
      });
      childProcess.spawnSync('git', ['config', 'user.name', 'Test User'], {
        cwd: tempDir,
        stdio: 'ignore'
      });

      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.ts'),
        `import { defineAuditConfig } from '@francogp/auditor';
export default defineAuditConfig({
  name: 'ratchet-test',
  testCoverage: {
    enabled: true,
    threshold: 85
  },
  oxlint: {
    enabled: true
  }
});
`,
        'utf-8'
      );

      childProcess.spawnSync('git', ['add', '.'], { cwd: tempDir, stdio: 'ignore' });
      childProcess.spawnSync('git', ['commit', '-m', 'chore: initial audit config'], {
        cwd: tempDir,
        stdio: 'ignore'
      });

      const localRelaxedConfig = {
        name: 'ratchet-test',
        testCoverage: {
          enabled: true,
          threshold: 60
        },
        oxlint: {
          enabled: false
        }
      };

      const result = auditConfigRatchet(tempDir, localRelaxedConfig, {
        productionRef: 'HEAD',
        skipNetwork: true
      });

      expect(result.passed).toBe(false);
      expect(result.relaxations.length).toBeGreaterThanOrEqual(2);
      expect(
        result.relaxations.some(
          (r) => r.file === '.auditor/audit.config.ts' && r.path === 'oxlint.enabled'
        )
      ).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
