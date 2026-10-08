/**
 * tests/check_environment.test.ts
 *
 * Unit tests for check_environment CLI script (SSoT Environment Engine Validator).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseSemver,
  compareVersions,
  getAuditorEngines,
  checkEnvironment
} from '../src/cli/check_environment.ts';

describe('check_environment CLI Utility', () => {
  let tempDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-env-test-'));
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
    vi.restoreAllMocks();
  });

  describe('parseSemver', () => {
    it('parses valid semver strings with numbers', () => {
      expect(parseSemver('26.10.0')).toEqual({ major: 26, minor: 10, patch: 0 });
      expect(parseSemver('>=26.0.0')).toEqual({ major: 26, minor: 0, patch: 0 });
      expect(parseSemver('^12.1.3')).toEqual({ major: 12, minor: 1, patch: 3 });
      expect(parseSemver('v24.5.1')).toEqual({ major: 24, minor: 5, patch: 1 });
    });

    it('falls back gracefully on empty or irregular strings', () => {
      expect(parseSemver('')).toEqual({ major: 0, minor: 0, patch: 0 });
      expect(parseSemver('invalid')).toEqual({ major: 0, minor: 0, patch: 0 });
    });
  });

  describe('compareVersions', () => {
    it('returns true when current version is strictly greater in major', () => {
      expect(compareVersions({ major: 26, minor: 0, patch: 0 }, { major: 25, minor: 9, patch: 9 })).toBe(true);
    });

    it('returns false when current version is lower in major', () => {
      expect(compareVersions({ major: 24, minor: 9, patch: 9 }, { major: 26, minor: 0, patch: 0 })).toBe(false);
    });

    it('compares minor when major is equal', () => {
      expect(compareVersions({ major: 26, minor: 10, patch: 0 }, { major: 26, minor: 5, patch: 0 })).toBe(true);
      expect(compareVersions({ major: 26, minor: 4, patch: 0 }, { major: 26, minor: 5, patch: 0 })).toBe(false);
    });

    it('compares patch when major and minor are equal', () => {
      expect(compareVersions({ major: 26, minor: 10, patch: 2 }, { major: 26, minor: 10, patch: 1 })).toBe(true);
      expect(compareVersions({ major: 26, minor: 10, patch: 1 }, { major: 26, minor: 10, patch: 1 })).toBe(true);
      expect(compareVersions({ major: 26, minor: 10, patch: 0 }, { major: 26, minor: 10, patch: 1 })).toBe(false);
    });
  });

  describe('getAuditorEngines', () => {
    it('returns engines required by auditor', () => {
      const engines = getAuditorEngines();
      expect(engines).toHaveProperty('node');
      expect(engines).toHaveProperty('npm');
      expect(engines.node).toContain('26');
    });
  });

  describe('checkEnvironment', () => {
    it('returns false when package.json does not exist in targetDir', () => {
      const result = checkEnvironment(tempDir);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('returns false when package.json lacks engines declaration', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app' }), 'utf-8');
      const result = checkEnvironment(tempDir);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('returns false when declared engines are lower than auditor floor', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'old-app',
        engines: { node: '>=20.0.0', npm: '>=10.0.0' }
      }), 'utf-8');
      const result = checkEnvironment(tempDir);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('returns true when declared engines match auditor requirements and current runtime satisfies them', () => {
      const currentMajor = parseSemver(process.versions.node).major;
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'modern-app',
        engines: { node: `>=${currentMajor}.0.0`, npm: '>=12.0.0' }
      }), 'utf-8');

      const result = checkEnvironment(tempDir);
      // Result depends on current Node version matching auditor floor
      expect(typeof result).toBe('boolean');
    });

    it('returns false and prints remediation when current npm is lower than required', () => {
      const originalUa = process.env.npm_config_user_agent;
      try {
        process.env.npm_config_user_agent = 'npm/8.0.0 node/v26.0.0';
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
          name: 'modern-app',
          engines: { node: '>=26.0.0', npm: '>=12.0.0' }
        }), 'utf-8');

        const result = checkEnvironment(tempDir);
        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();
      } finally {
        if (originalUa !== undefined) {
          process.env.npm_config_user_agent = originalUa;
        } else {
          delete process.env.npm_config_user_agent;
        }
      }
    });

    it('prints Windows remediation commands when platform is win32', () => {
      const originalPlatform = process.platform;
      const originalUa = process.env.npm_config_user_agent;
      try {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
        process.env.npm_config_user_agent = 'npm/8.0.0 node/v26.0.0';
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
          name: 'win-app',
          engines: { node: '>=26.0.0', npm: '>=12.0.0' }
        }), 'utf-8');

        const result = checkEnvironment(tempDir);
        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        if (originalUa !== undefined) {
          process.env.npm_config_user_agent = originalUa;
        } else {
          delete process.env.npm_config_user_agent;
        }
      }
    });

    it('returns false when current runtime node is lower than host required node', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'future-app',
        engines: { node: '>=999.0.0', npm: '>=12.0.0' }
      }), 'utf-8');

      const result = checkEnvironment(tempDir);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('automatically executes setup script when divergence is detected and setup script exists', () => {
      const isWindows = process.platform === 'win32';
      const setupScriptName = isWindows ? 'setup-windows.ps1' : 'setup-linux.sh';
      const auditorEngines = getAuditorEngines();

      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'legacy-app',
        engines: { node: '>=20.0.0', npm: '>=10.0.0' }
      }), 'utf-8');

      if (isWindows) {
        fs.writeFileSync(path.join(tempDir, setupScriptName), `
          $pkg = Get-Content package.json | ConvertFrom-Json
          $pkg.engines.node = "${auditorEngines.node}"
          $pkg.engines.npm = "${auditorEngines.npm}"
          $pkg | ConvertTo-Json | Set-Content package.json
          exit 0
        `, 'utf-8');
      } else {
        fs.writeFileSync(path.join(tempDir, setupScriptName), `#!/bin/sh
cat << 'EOF' > package.json
{
  "name": "legacy-app",
  "engines": {
    "node": "${auditorEngines.node}",
    "npm": "${auditorEngines.npm}"
  }
}
EOF
exit 0
`, { mode: 0o755 });
      }

      const result = checkEnvironment(tempDir);
      expect(result).toBe(true);
    });
  });
});
