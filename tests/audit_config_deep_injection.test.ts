/**
 * tests/audit_config_deep_injection.test.ts
 *
 * Tests for Deep Leaf AST Property Injection, User Config Preservation,
 * and Eradication of Empty Placeholder Objects.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { appendMissingSectionsToConfigFile } from '../src/core/auditConfigAst.ts';
import { evaluateProjectConfig, parseAuditConfigFileToRecord } from '../src/core/configAdvisor.ts';

describe('Deep Leaf AST Property Injection & User Config Preservation', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-deep-test-'));
    const auditorDir = path.join(tmpDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    configPath = path.join(auditorDir, 'audit.config.ts');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup error ignored in temp dir
    }
  });

  it('injects missing leaf properties into existing section without clobbering existing keys', () => {
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Test Project',
  auditorVersion: '10.6.1',
  paths: {
    srcRoots: ['src']
  }
});
`;
    fs.writeFileSync(configPath, initialConfig, 'utf-8');

    appendMissingSectionsToConfigFile(configPath, {
      paths: {
        codeRoots: ['src'],
        includeTestsInCodeAudit: false
      },
      styles: {
        lineHeightOverlapCheck: true
      }
    });

    const parsed = parseAuditConfigFileToRecord(configPath);
    expect(parsed).toBeDefined();

    const paths = parsed?.paths as Record<string, unknown>;
    expect(paths).toBeDefined();
    expect(paths.srcRoots).toEqual(['src']);
    expect(paths.codeRoots).toEqual(['src']);
    expect(paths.includeTestsInCodeAudit).toBe(false);

    const styles = parsed?.styles as Record<string, unknown>;
    expect(styles).toBeDefined();
    expect(styles.lineHeightOverlapCheck).toBe(true);
  });

  it('strictly preserves preexisting user configuration and NEVER overwrites primitives', () => {
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Test Project',
  auditorVersion: '10.6.1',
  scssArchitecture: {
    maxNestingDepth: 5
  }
});
`;
    fs.writeFileSync(configPath, initialConfig, 'utf-8');

    appendMissingSectionsToConfigFile(configPath, {
      scssArchitecture: {
        maxNestingDepth: 3, // Should NOT overwrite 5
        scopedMaxNestingDepth: 3 // Should be added because missing
      }
    });

    const parsed = parseAuditConfigFileToRecord(configPath);
    const scss = parsed?.scssArchitecture as Record<string, unknown>;

    expect(scss).toBeDefined();
    expect(scss.maxNestingDepth).toBe(5);
    expect(scss.scopedMaxNestingDepth).toBe(3);
  });

  it('eradicates empty placeholder objects and empty arrays from injection', () => {
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Test Project',
  auditorVersion: '10.6.1'
});
`;
    fs.writeFileSync(configPath, initialConfig, 'utf-8');

    appendMissingSectionsToConfigFile(configPath, {
      presets: {},
      stylelint: {
        rules: {}
      }
    });

    const parsed = parseAuditConfigFileToRecord(configPath);
    expect(parsed?.presets).toBeUndefined();
    expect(parsed?.stylelint).toBeUndefined();
  });

  it('is completely idempotent when executed multiple times', () => {
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Test Project',
  auditorVersion: '10.6.1',
  paths: {
    srcRoots: ['src']
  }
});
`;
    fs.writeFileSync(configPath, initialConfig, 'utf-8');

    const sections = {
      paths: {
        codeRoots: ['src'],
        includeTestsInCodeAudit: false
      }
    };

    appendMissingSectionsToConfigFile(configPath, sections);
    const contentFirstPass = fs.readFileSync(configPath, 'utf-8');

    appendMissingSectionsToConfigFile(configPath, sections);
    const contentSecondPass = fs.readFileSync(configPath, 'utf-8');

    expect(contentSecondPass).toBe(contentFirstPass);
  });

  it('evaluates SQLite persistence without Supabase docker or RLS false positive recommendations', () => {
    const rawConfigOverride: Record<string, unknown> = {
      persistence: {
        enabled: true,
        engine: 'sqlite'
      }
    };

    const report = evaluateProjectConfig(tmpDir, {
      targetSubsystem: 'persistence',
      rawConfigOverride,
      tasks: []
    });

    const dockerRec = report.recommendations.find((r) => r.path === 'persistence.dockerContainer');
    const rlsRec = report.recommendations.find((r) => r.path === 'persistence.exemptRlsTables');
    const supabaseDirRec = report.recommendations.find((r) => r.path === 'persistence.supabaseDir');
    const schemaQualifiedRec = report.recommendations.find(
      (r) => r.path === 'persistence.schemaQualified'
    );

    expect(dockerRec).toBeUndefined();
    expect(rlsRec).toBeUndefined();
    expect(supabaseDirRec).toBeUndefined();
    expect(schemaQualifiedRec).toBeUndefined();
  });
});
