import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import {
  ValidatePackageHygieneAuditor,
  parseKnipIssues,
  verifyLockfileIntegrity,
  tsconfigHasReferences,
  type KnipReport
} from '../src/suites/architecture/validate_package_hygiene.ts';

describe('ValidatePackageHygieneAuditor & parseKnipIssues', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-knip-test-'));
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

  describe('Rule Declarations & Metadata', () => {
    it('initializes with correct metadata and rules', () => {
      const auditor = new ValidatePackageHygieneAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_package_hygiene');
      expect(auditor.packageName).toBe('Dependencias');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds.length).toBeGreaterThan(0);
      expect(auditor.ruleDescriptions).toBeDefined();
    });
  });

  describe('parseKnipIssues parser', () => {
    it('returns empty findings for empty report', () => {
      const report: KnipReport = { issues: [] };
      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toEqual([]);
    });

    it('correctly maps unused dependencies to canonical AuditFinding objects', () => {
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'package.json'),
            dependencies: [{ name: 'unused-lib', line: 12, col: 4 }],
            devDependencies: [{ name: 'unused-dev-lib', line: 20, col: 4 }]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toHaveLength(2);

      const f1 = findings[0]!;
      expect(f1.suiteId).toBe('validate_package_hygiene');
      expect(f1.ruleId).toBe('package-unused-dependency');
      expect(f1.file).toBe('package.json');
      expect(f1.line).toBe(12);
      expect(f1.col).toBe(4);
      expect(f1.context).toBe('unused-lib');
      expect(f1.message).toContain('unused-lib');

      const f2 = findings[1]!;
      expect(f2.ruleId).toBe('package-unused-dependency');
      expect(f2.context).toBe('unused-dev-lib');
    });

    it('correctly maps unlisted phantom dependencies', () => {
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'src/service.ts'),
            unlisted: [{ name: 'phantom-pkg', line: 3, col: 8 }]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.ruleId).toBe('package-unlisted-dependency');
      expect(f.file).toBe('src/service.ts');
      expect(f.line).toBe(3);
      expect(f.col).toBe(8);
      expect(f.context).toBe('phantom-pkg');
      expect(f.message).toContain('phantom-pkg');
    });

    it('filters out unlisted dependencies in ignored paths via isPathIgnored', () => {
      const report: KnipReport = {
        issues: [
          {
            file: path.join(tempDir, 'external/vendored-lib/index.ts'),
            unlisted: [{ name: 'ignored-dep', line: 1, col: 1 }]
          },
          {
            file: path.join(tempDir, 'src/valid.ts'),
            unlisted: [{ name: 'legitimate-unlisted', line: 5, col: 2 }]
          }
        ]
      };

      const isPathIgnored = (rel: string) => rel.startsWith('external/');
      const findings = parseKnipIssues(report, tempDir, isPathIgnored);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.file).toBe('src/valid.ts');
      expect(findings[0]!.context).toBe('legitimate-unlisted');
    });

    it('correctly maps unused binaries', () => {
      const report: KnipReport = {
        issues: [
          {
            file: 'package.json',
            binaries: [{ name: 'orphan-bin', line: 1, col: 1 }]
          }
        ]
      };

      const findings = parseKnipIssues(report, tempDir);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.ruleId).toBe('package-unused-binary');
      expect(f.context).toBe('orphan-bin');
      expect(f.message).toContain('orphan-bin');
    });
  });

  describe('verifyLockfileIntegrity', () => {
    it('reports error when package.json exists but package-lock.json is missing', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('package-lockfile-integrity');
      expect(findings[0]!.message).toContain('No se encontró package-lock.json');
    });

    it('detects unresolved merge conflict markers in package-lock.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        '{\n<<<<<<< HEAD\n  "name": "foo"\n=======\n  "name": "bar"\n>>>>>>> main\n}\n'
      );
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings.some((f) => f.context === 'merge-conflict')).toBe(true);
    });

    it('detects obsolete lockfileVersion < 3', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({ name: 'pkg', lockfileVersion: 2 })
      );
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings.some((f) => f.message.includes('lockfileVersion obsoleto'))).toBe(true);
    });

    it('detects insecure http:// registry resolutions', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({
          name: 'pkg',
          lockfileVersion: 3,
          packages: {
            'node_modules/bad': {
              resolved: 'http://insecure-registry.internal/bad.tgz'
            }
          }
        })
      );
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings.some((f) => f.context === 'insecure-http-resolved')).toBe(true);
    });

    it('passes cleanly on valid modern lockfileVersion 3 with https', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({
          name: 'pkg',
          lockfileVersion: 3,
          packages: {
            '': {
              dependencies: {}
            },
            'node_modules/good': {
              resolved: 'https://registry.npmjs.org/good.tgz'
            }
          }
        })
      );
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings).toHaveLength(0);
    });

    it('detects floating git semver dependencies in package.json', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'pkg',
          devDependencies: {
            '@francogp/auditor': 'github:francogp/auditor#semver:*'
          }
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({
          name: 'pkg',
          lockfileVersion: 3,
          packages: {
            '': {
              devDependencies: {
                '@francogp/auditor': 'github:francogp/auditor#semver:*'
              }
            }
          }
        })
      );
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings.some((f) => f.context?.includes('#semver:*'))).toBe(true);
      expect(findings.some((f) => f.message.includes('rango git flotante'))).toBe(true);
    });

    it('detects desynchronization between package.json and package-lock.json', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'pkg',
          devDependencies: {
            '@francogp/auditor': 'github:francogp/auditor#v8.4.1'
          }
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({
          name: 'pkg',
          lockfileVersion: 3,
          packages: {
            '': {
              devDependencies: {
                '@francogp/auditor': 'github:francogp/auditor#v8.2.0'
              }
            }
          }
        })
      );
      const findings = verifyLockfileIntegrity(tempDir);
      expect(findings.some((f) => f.message.includes('difiere de package-lock.json'))).toBe(true);
    });

    it('auto-replaces floating #semver:* with #v<auditorVersion> when isFixMode is true (fix: true)', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'pkg',
          devDependencies: {
            '@francogp/auditor': 'github:francogp/auditor#semver:*'
          }
        })
      );
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({
          name: 'pkg',
          lockfileVersion: 3,
          packages: {
            '': {
              devDependencies: {
                '@francogp/auditor': 'github:francogp/auditor#semver:*'
              }
            }
          }
        })
      );
      verifyLockfileIntegrity(tempDir, true);
      const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
      expect(updatedPkg.devDependencies['@francogp/auditor']).toMatch(
        /^github:francogp\/auditor#v\d+/
      );
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with zero errors when packageHygiene is disabled', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Knip Disabled Project',
          packageHygiene: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageHygieneAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });
  });

  describe('Violation Detection in Sandbox', () => {
    it('detects violations and fails with status failed and severity error', async () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));
      fs.writeFileSync(
        path.join(tempDir, 'package-lock.json'),
        JSON.stringify({
          name: 'pkg',
          lockfileVersion: 3,
          packages: {
            'node_modules/bad': {
              resolved: 'http://insecure.internal/bad.tgz'
            }
          }
        })
      );
      setAuditConfig(
        defineAuditConfig({
          name: 'Test Lockfile Violation',
          packageHygiene: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          packageDistribution: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageHygieneAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();
      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.severity === 'error')).toBe(true);
    });

    it('generates ephemeral Knip configuration pointing to Knip v6 schema', () => {
      const auditor = new ValidatePackageHygieneAuditor({ projectRoot: tempDir });
      const scratchDir = path.join(tempDir, 'scratch');
      fs.mkdirSync(scratchDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }));

      const cfg = defineAuditConfig({
        name: 'Knip Schema Test',
        packageHygiene: { enabled: true }
      });

      const ephemeralConfigPath = (
        auditor as unknown as { buildEphemeralKnipConfig: (c: typeof cfg, s: string) => string }
      ).buildEphemeralKnipConfig(cfg, scratchDir);
      expect(fs.existsSync(ephemeralConfigPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(ephemeralConfigPath, 'utf-8'));
      expect(parsed.$schema).toContain('knip@6');
    });
  });
});

describe('tsconfigHasReferences', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsconfig-refs-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when tsconfig.json is missing', () => {
    expect(tsconfigHasReferences(tmpDir)).toBe(false);
  });

  it('returns false when tsconfig.json has no references', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{ "compilerOptions": {} }');
    expect(tsconfigHasReferences(tmpDir)).toBe(false);
  });

  it('returns true for JSONC tsconfig.json with references', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      '{\n  // project refs\n  "references": [{ "path": "./tsconfig.app.json" },],\n}\n'
    );
    expect(tsconfigHasReferences(tmpDir)).toBe(true);
  });
});
