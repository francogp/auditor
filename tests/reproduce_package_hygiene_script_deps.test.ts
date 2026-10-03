/**
 * tests/reproduce_package_hygiene_script_deps.test.ts
 *
 * Reproduction test for package.json scripts dependency cross-referencing.
 * Strictly adheres to Gate 1 of /systematic-debugging:
 * Assert that dependencies used in package.json scripts (e.g. vue-tsc, markdownlint-cli)
 * are NOT flagged as package-unused-dependency.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  parseKnipIssues,
  type KnipReport
} from '../src/suites/architecture/validate_package_hygiene.ts';

describe('Package Hygiene Scripts Cross-Referencing (package-unused-dependency)', () => {
  it('does NOT flag dependencies referenced in package.json scripts as unused', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-script-deps-'));
    try {
      const pkgJson = {
        name: 'test-app',
        scripts: {
          typecheck: 'vue-tsc --noEmit',
          'lint:md': 'markdownlint-cli .',
          build: 'vite build'
        },
        devDependencies: {
          'vue-tsc': '^2.0.0',
          'markdownlint-cli': '^0.44.0',
          'unused-lib': '^1.0.0'
        }
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');

      // Simulated Knip report where Knip missed indirect script usage
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'package.json'),
            devDependencies: [
              { name: 'vue-tsc', line: 10, col: 4 },
              { name: 'markdownlint-cli', line: 11, col: 4 },
              { name: 'unused-lib', line: 12, col: 4 }
            ]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      const unusedNames = findings.map(f => f.context);

      expect(unusedNames).not.toContain('vue-tsc');
      expect(unusedNames).not.toContain('markdownlint-cli');
      expect(unusedNames).toContain('unused-lib');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
