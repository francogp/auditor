import { describe, it, expect } from 'vite-plus/test';

import {
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
});
