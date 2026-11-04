/**
 * tests/audit_config_ast_validator.test.ts
 *
 * Verifies AST structural validation and schema/DTD enforcement for .auditor/audit.config.ts:
 * 1. Duplicate property keys in object literals (preventing silent JavaScript overwrites)
 * 2. Duplicate array entries (redundant items in unique sets)
 * 3. Declared subsystems missing explicit 'enabled: boolean'
 * 4. AST auto-fix transformations
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  injectMissingEnabledAst,
  deduplicateArrayElementsInFileAst
} from '../src/core/auditConfigAst.ts';
import {
  validateAuditConfigAst,
  assertNoDuplicateKeysInAuditConfig,
  assertNoDuplicateKeysInAuditConfigFile
} from '../src/core/auditConfigAstValidator.ts';
import { defineAuditConfig } from '../src/core/auditConfigBuilders.ts';
import { loadAuditConfig, resetAuditConfig } from '../src/core/auditConfigLoader.ts';

describe('auditConfigAstValidator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-ast-test-'));
    resetAuditConfig();
  });

  afterEach(() => {
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('detects duplicate top-level subsystem keys and reports line numbers', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    enabled: true,
    acknowledgedDegradations: []
  },
  dependencyVulnerabilities: {
    enabled: true
  },
  coverage: {
    enabled: true,
    exemptGlobs: []
  }
});`;

    const violations = validateAuditConfigAst(code, '.auditor/audit.config.ts');
    const dupKeys = violations.filter((v) => v.ruleId === 'audit-config-duplicate-key');

    expect(dupKeys).toHaveLength(1);
    expect(dupKeys[0]!.key).toBe('coverage');
    expect(dupKeys[0]!.path).toBe('coverage');
    expect(dupKeys[0]!.line).toBe(12);
    expect(dupKeys[0]!.originalLine).toBe(5);
    expect(dupKeys[0]!.message).toContain("Duplicate property 'coverage'");
    expect(dupKeys[0]!.message).toContain('line 12');
    expect(dupKeys[0]!.message).toContain('line 5');
  });

  it('detects duplicate nested property keys inside subsystem objects', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  paths: {
    srcRoots: ['src'],
    srcRoots: ['lib']
  }
});`;

    const violations = validateAuditConfigAst(code);
    const dupKeys = violations.filter((v) => v.ruleId === 'audit-config-duplicate-key');

    expect(dupKeys).toHaveLength(1);
    expect(dupKeys[0]!.key).toBe('srcRoots');
    expect(dupKeys[0]!.path).toBe('paths.srcRoots');
    expect(dupKeys[0]!.line).toBe(7);
    expect(dupKeys[0]!.originalLine).toBe(6);
  });

  it('throws descriptive error in assertNoDuplicateKeysInAuditConfig', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  styles: { enabled: true },
  styles: { enabled: false }
});`;

    expect(() => assertNoDuplicateKeysInAuditConfig(code, '.auditor/audit.config.ts')).toThrow(
      /Duplicate property keys detected in \.auditor\/audit\.config\.ts/
    );
  });

  it('throws descriptive error in assertNoDuplicateKeysInAuditConfigFile when file on disk has duplicates', () => {
    const configPath = path.join(tempDir, 'audit.config.ts');
    fs.writeFileSync(
      configPath,
      `import { defineAuditConfig } from '@francogp/auditor';
export default defineAuditConfig({
  styles: { enabled: true },
  styles: { enabled: false }
});`,
      'utf-8'
    );
    expect(() => assertNoDuplicateKeysInAuditConfigFile(configPath)).toThrow(
      /Duplicate property keys detected/
    );
  });

  it('detects duplicate string entries in unique arrays', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  paths: {
    srcRoots: ['src', 'src'],
    ignoreGlobs: ['dist/**', 'build/**', 'dist/**']
  }
});`;

    const violations = validateAuditConfigAst(code);
    const dupEntries = violations.filter((v) => v.ruleId === 'audit-config-duplicate-entry');

    expect(dupEntries).toHaveLength(2);
    expect(dupEntries[0]!.key).toBe('src');
    expect(dupEntries[0]!.path).toBe('paths.srcRoots');
    expect(dupEntries[1]!.key).toBe('dist/**');
    expect(dupEntries[1]!.path).toBe('paths.ignoreGlobs');
  });

  it('detects duplicate object entries in coverage.acknowledgedDegradations', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    enabled: true,
    acknowledgedDegradations: [
      { policy: 'scripts', glob: 'scripts/**', reason: 'maintenance' },
      { policy: 'scripts', glob: 'scripts/**', reason: 'duplicate reason' }
    ]
  }
});`;

    const violations = validateAuditConfigAst(code);
    const dupEntries = violations.filter((v) => v.ruleId === 'audit-config-duplicate-entry');

    expect(dupEntries).toHaveLength(1);
    expect(dupEntries[0]!.key).toBe('scripts:scripts/**');
    expect(dupEntries[0]!.path).toBe('coverage.acknowledgedDegradations');
  });

  it('detects missing enabled in declared subsystems', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  paths: {
    srcRoots: ['src']
  },
  coverage: {
    acknowledgedDegradations: []
  },
  persistence: {
    engine: 'sqlite'
  },
  styles: {
    enabled: true
  }
});`;

    const violations = validateAuditConfigAst(code);
    const missingEnabled = violations.filter((v) => v.ruleId === 'audit-config-missing-enabled');

    expect(missingEnabled).toHaveLength(2);
    expect(missingEnabled.map((m) => m.key)).toEqual(['coverage', 'persistence']);
    // paths and name must NOT be flagged as missing enabled
    expect(missingEnabled.some((m) => m.key === 'paths' || m.key === 'name')).toBe(false);
  });

  it('auto-injects missing enabled property via injectMissingEnabledAst', () => {
    const configDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'audit.config.ts');

    fs.writeFileSync(
      configPath,
      `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    acknowledgedDegradations: []
  }
});
`,
      'utf-8'
    );

    const success = injectMissingEnabledAst(configPath, 'coverage');
    expect(success).toBe(true);

    const updated = fs.readFileSync(configPath, 'utf-8');
    expect(updated).toContain('enabled: true');

    const violationsAfter = validateAuditConfigAst(updated);
    expect(violationsAfter.filter((v) => v.ruleId === 'audit-config-missing-enabled')).toHaveLength(
      0
    );
  });

  it('auto-deduplicates array elements via deduplicateArrayElementsInFileAst', () => {
    const configDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'audit.config.ts');

    fs.writeFileSync(
      configPath,
      `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  paths: {
    srcRoots: ['src', 'src']
  }
});
`,
      'utf-8'
    );

    const success = deduplicateArrayElementsInFileAst(configPath, 'paths.srcRoots');
    expect(success).toBe(true);

    const updated = fs.readFileSync(configPath, 'utf-8');
    const violationsAfter = validateAuditConfigAst(updated);
    expect(violationsAfter.filter((v) => v.ruleId === 'audit-config-duplicate-entry')).toHaveLength(
      0
    );
  });

  it('auto-deduplicates object array elements with unordered keys via deduplicateArrayElementsInFileAst', () => {
    const configDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'audit.config.ts');

    fs.writeFileSync(
      configPath,
      `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    enabled: true,
    exemptGlobs: [
      { maxLimit: 10, active: true },
      { active: true, maxLimit: 10 }
    ]
  }
});
`,
      'utf-8'
    );

    const success = deduplicateArrayElementsInFileAst(configPath, 'coverage.exemptGlobs');
    expect(success).toBe(true);

    const updated = fs.readFileSync(configPath, 'utf-8');
    const violationsAfter = validateAuditConfigAst(updated);
    expect(violationsAfter.filter((v) => v.ruleId === 'audit-config-duplicate-entry')).toHaveLength(
      0
    );
  });

  it('passes completely clean on canonical configuration without duplicate keys', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'canonical-clean',
  auditorVersion: '10.7.6',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    ignoreGlobs: ['node_modules/**', 'dist/**']
  },
  coverage: {
    enabled: true,
    acknowledgedDegradations: [
      { policy: 'scripts', glob: 'scripts/**', reason: 'maintenance' }
    ]
  },
  styles: {
    enabled: true,
    zLayersEnabled: true
  }
});`;

    const violations = validateAuditConfigAst(code);
    expect(violations).toHaveLength(0);
  });

  it('prevents loadAuditConfig from importing configs with duplicate keys', async () => {
    const configDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'audit.config.ts');

    fs.writeFileSync(
      configPath,
      `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'duplicate-fail',
  coverage: { enabled: true },
  coverage: { enabled: false }
});
`,
      'utf-8'
    );

    await expect(loadAuditConfig(tempDir)).rejects.toThrow(/Duplicate property keys detected/);
  });

  it('dynamically resolves paths.migrationsDir to database/migrations when persistence.engine is sqlite', () => {
    const config = defineAuditConfig({
      name: 'sqlite-project',
      persistence: {
        engine: 'sqlite'
      }
    });

    expect(config.paths.migrationsDir).toBe('database/migrations');
  });

  it('dynamically resolves paths.migrationsDir to supabase/migrations when persistence.engine is supabase', () => {
    const config = defineAuditConfig({
      name: 'supabase-project',
      persistence: {
        engine: 'supabase'
      }
    });

    expect(config.paths.migrationsDir).toBe('supabase/migrations');
  });

  it('preserves explicit paths.migrationsDir override regardless of persistence engine', () => {
    const config = defineAuditConfig({
      name: 'custom-project',
      paths: {
        migrationsDir: 'custom/db/migrations'
      },
      persistence: {
        engine: 'sqlite'
      }
    });

    expect(config.paths.migrationsDir).toBe('custom/db/migrations');
  });

  it('falls back to default migrationsDir when paths.migrationsDir is explicitly undefined', () => {
    const config = defineAuditConfig({
      name: 'undefined-migrations-project',
      paths: {
        migrationsDir: undefined
      },
      persistence: {
        engine: 'sqlite'
      }
    });

    expect(config.paths.migrationsDir).toBe('database/migrations');
  });

  it('reproduces codex incident: catching appended duplicate coverage block that would clobber acknowledgedDegradations', () => {
    const codexFaultyConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'mock-consumer-app',
  coverage: {
    enabled: true,
    acknowledgedDegradations: [
      { policy: 'scripts', glob: 'scripts/**', reason: 'maintenance tooling' }
    ]
  },
  persistence: {
    engine: 'sqlite'
  },
  coverage: {
    enabled: true,
    exemptGlobs: ['database/migrations/001_initial_schema.sql']
  }
});`;

    const violations = validateAuditConfigAst(codexFaultyConfig, '.auditor/audit.config.ts');
    const dupKeys = violations.filter((v) => v.ruleId === 'audit-config-duplicate-key');

    expect(dupKeys).toHaveLength(1);
    expect(dupKeys[0]!.key).toBe('coverage');
    expect(dupKeys[0]!.line).toBe(14);
    expect(dupKeys[0]!.originalLine).toBe(5);

    expect(() =>
      assertNoDuplicateKeysInAuditConfig(codexFaultyConfig, '.auditor/audit.config.ts')
    ).toThrow(/'coverage' on line 14:3 \(originally declared on line 5:3\)/);
  });

  it('detects duplicate array entries with complex objects (name, file, path, or arbitrary keys)', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    enabled: true,
    exemptGlobs: [
      { path: 'src/canaries/alpha.ts', reason: 'first' },
      { path: 'src/canaries/alpha.ts', reason: 'second' }
    ]
  },
  extensions: [
    { name: 'custom-check', file: 'ext/check.ts' },
    { name: 'custom-check', file: 'ext/check.ts' }
  ]
});`;

    const violations = validateAuditConfigAst(code);
    const dupEntries = violations.filter((v) => v.ruleId === 'audit-config-duplicate-entry');

    expect(dupEntries).toHaveLength(2);
    expect(dupEntries[0]!.key).toBe('src/canaries/alpha.ts');
    expect(dupEntries[0]!.path).toBe('coverage.exemptGlobs');
    expect(dupEntries[1]!.key).toBe('custom-check');
    expect(dupEntries[1]!.path).toBe('extensions');
  });

  it('unwraps as const and satisfies expressions in subsystem declarations and array items', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    exemptGlobs: ['a.ts', 'a.ts'] as const
  } as const,
  styles: {
    enabled: true
  } satisfies Record<string, unknown>
});`;

    const violations = validateAuditConfigAst(code);
    const missingEnabled = violations.filter((v) => v.ruleId === 'audit-config-missing-enabled');
    const dupEntries = violations.filter((v) => v.ruleId === 'audit-config-duplicate-entry');

    expect(missingEnabled).toHaveLength(1);
    expect(missingEnabled[0]!.key).toBe('coverage');
    expect(dupEntries).toHaveLength(1);
    expect(dupEntries[0]!.key).toBe('a.ts');
    expect(dupEntries[0]!.path).toBe('coverage.exemptGlobs');
  });

  it('detects duplicate object entries with unordered keys, numbers, and booleans', () => {
    const code = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'test-project',
  coverage: {
    enabled: true,
    exemptGlobs: [
      { maxLimit: 10, active: true, tag: 'legacy' },
      { active: true, tag: 'legacy', maxLimit: 10 }
    ]
  }
});`;

    const violations = validateAuditConfigAst(code);
    const dupEntries = violations.filter((v) => v.ruleId === 'audit-config-duplicate-entry');

    expect(dupEntries).toHaveLength(1);
    expect(dupEntries[0]!.key).toBe('active:true;maxLimit:10;tag:legacy');
    expect(dupEntries[0]!.path).toBe('coverage.exemptGlobs');
  });
});
