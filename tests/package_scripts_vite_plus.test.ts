import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { PackageScriptRegistry } from '../src/core/packageScriptRegistry.ts';
import {
  migrateViteCommandsToVp,
  syncPackageJsonForVitePlus
} from '../src/core/vitePlusConfigSync.ts';
import { ValidatePackageScriptsAuditor } from '../src/suites/architecture/validate_package_scripts.ts';

describe('package_scripts_vite_plus (6 Canary Matrix)', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-scripts-test-'));
    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    fs.writeFileSync(
      path.join(auditorDir, 'audit.config.json'),
      JSON.stringify({ ratchet: { enabled: false } }),
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    PackageScriptRegistry.reset();
  });

  it('C-SCR-01: PackageScriptRegistry contains canonical Vite+ script requirements', () => {
    expect(PackageScriptRegistry.has('check')).toBe(true);
    expect(PackageScriptRegistry.get('check')?.command).toBe('vp check');

    expect(PackageScriptRegistry.has('check:fix')).toBe(true);
    expect(PackageScriptRegistry.get('check:fix')?.command).toBe('vp check --fix');

    expect(PackageScriptRegistry.has('fmt')).toBe(true);
    expect(PackageScriptRegistry.get('fmt')?.command).toBe('vp fmt');

    expect(PackageScriptRegistry.has('fmt:check')).toBe(true);
    expect(PackageScriptRegistry.get('fmt:check')?.command).toBe('vp fmt --check');

    expect(PackageScriptRegistry.has('auditor:oxfmt')).toBe(true);
    expect(PackageScriptRegistry.get('auditor:oxfmt')?.command).toBe('auditor task=validate_oxfmt');
  });

  it('C-SCR-02: PackageScriptRegistry throws explicit collision error on conflicting script command', () => {
    expect(() => {
      PackageScriptRegistry.register(
        {
          name: 'check',
          command: 'eslint .',
          description: 'Conflict attempt',
          category: 'core'
        },
        'test-collision-plugin'
      );
    }).toThrow(/\[COMMAND COLLISION\]/);
  });

  it('C-SCR-03: ValidatePackageScriptsAuditor detects missing Vite+ recommended scripts', async () => {
    const pkgWithoutVitePlus = {
      name: 'test-consumer',
      version: '1.0.0',
      scripts: {
        build: 'npm run auditor:full && vite build && npm run auditor:post-build'
      }
    };
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(pkgWithoutVitePlus, null, 2),
      'utf-8'
    );

    const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
    await auditor.runAudit();
    const result = await auditor.finishAudit();

    expect(result.findings.some((f) => f.ruleId === 'package-scripts-missing-recommended')).toBe(
      true
    );
  });

  it('C-SCR-04: ValidatePackageScriptsAuditor auto-fixes missing scripts and passes cleanly', async () => {
    const initialPkg = {
      name: 'test-consumer',
      version: '1.0.0',
      scripts: {
        build: 'npm run auditor:full && vite build && npm run auditor:post-build'
      }
    };
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(initialPkg, null, 2),
      'utf-8'
    );

    // 1. Run in fix mode
    const fixAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    // 2. Verify scripts were injected in package.json
    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.scripts['check']).toBe('vp check');
    expect(updatedPkg.scripts['fmt']).toBe('vp fmt');

    // 3. Re-run in check mode to verify clean path
    const checkAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
    const checkResult = await checkAuditor.audit();

    expect(checkResult.summary.errors).toBe(0);
    expect(checkResult.status).toBe('passed');
  });

  it('C-SCR-05: migrateViteCommandsToVp cleanly transforms legacy vite commands without affecting files', () => {
    expect(
      migrateViteCommandsToVp(
        'npm run servers:configure && npm run auditor && vite build && npm run auditor:post-build'
      )
    ).toBe(
      'npm run servers:configure && npm run auditor && vp build && npm run auditor:post-build'
    );

    expect(migrateViteCommandsToVp('npm run servers:configure && node -e "..." && vite')).toBe(
      'npm run servers:configure && node -e "..." && vp dev'
    );

    expect(migrateViteCommandsToVp('vite preview')).toBe('vp preview');
    expect(migrateViteCommandsToVp('vite --open /ui-demo/index.html')).toBe(
      'vp dev --open /ui-demo/index.html'
    );
    expect(migrateViteCommandsToVp('node scripts/check.ts vite.config.ts')).toBe(
      'node scripts/check.ts vite.config.ts'
    );
  });

  it('C-SCR-06: syncPackageJsonForVitePlus migrates scripts calling vite into vp', () => {
    const pkgWithLegacyVite = {
      name: 'test-consumer',
      version: '1.0.0',
      scripts: {
        dev: 'npm run servers:configure && vite',
        build:
          'npm run servers:configure && npm run auditor && vite build && npm run auditor:post-build',
        preview: 'vite preview',
        'ui-demo': 'vite --open /ui-demo/index.html'
      }
    };
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(pkgWithLegacyVite, null, 2),
      'utf-8'
    );

    const modified = syncPackageJsonForVitePlus(tempDir);
    expect(modified).toBe(true);

    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.scripts.dev).toBe('npm run servers:configure && vp dev');
    expect(updatedPkg.scripts.build).toBe(
      'npm run servers:configure && npm run auditor && vp build && npm run auditor:post-build'
    );
    expect(updatedPkg.scripts.preview).toBe('vp preview');
    expect(updatedPkg.scripts['ui-demo']).toBe('vp dev --open /ui-demo/index.html');
  });

  it('C-SCR-07: syncPackageJsonForVitePlus preserves dynamic $vite overrides and higher security versions without downgrading', () => {
    const pkgWithCustomOverrides = {
      name: 'test-overrides-consumer',
      version: '1.0.0',
      devDependencies: {
        'vite-plus': '^1.4.0',
        vitest: '^5.0.5'
      },
      overrides: {
        vite: '$vite',
        vitest: '$vitest',
        'js-yaml': '^5.5.0',
        katex: '^0.19.1',
        'smol-toml': '^1.9.1',
        braces: '^3.0.3',
        micromatch: '^4.0.8'
      }
    };
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(pkgWithCustomOverrides, null, 2),
      'utf-8'
    );

    const modified = syncPackageJsonForVitePlus(tempDir);
    expect(modified).toBe(true); // Should remove obsolete braces and micromatch

    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.overrides.vite).toBe('$vite');
    expect(updatedPkg.overrides.vitest).toBe('$vitest');
    expect(updatedPkg.overrides['js-yaml']).toBe('^5.5.0');
    expect(updatedPkg.overrides.braces).toBeUndefined();
    expect(updatedPkg.overrides.micromatch).toBeUndefined();
  });

  it('C-SCR-08: syncPackageJsonForVitePlus migrates hardcoded exact vite override to $vite and normalizes exact devDependencies', () => {
    const pkgWithHardcodedVite = {
      name: 'test-hardcoded-consumer',
      version: '1.0.0',
      devDependencies: {
        'vite-plus': '1.4.0',
        vitest: '5.0.5'
      },
      overrides: {
        vite: 'npm:@voidzero-dev/vite-plus-core@1.3.0',
        vitest: '5.0.4'
      }
    };
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(pkgWithHardcodedVite, null, 2),
      'utf-8'
    );

    const modified = syncPackageJsonForVitePlus(tempDir);
    expect(modified).toBe(true);

    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.overrides.vite).toBe('$vite');
    expect(updatedPkg.overrides.vitest).toBe('$vitest');
    expect(updatedPkg.devDependencies['vite-plus']).toBe('^1.4.0');
    expect(updatedPkg.devDependencies.vitest).toBe('^5.0.5');
  });
});
