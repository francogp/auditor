import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { appendMissingSectionsToConfigFile } from '../src/core/auditConfigAst.ts';
import type { AuditTaskDefinition } from '../src/core/auditContract.ts';
import { toPosixPath } from '../src/core/safePath.ts';
import {
  buildTaskExpectedConfigTree,
  collectConfigSectionsFromTasks
} from '../src/suites/architecture/validate_audit_config.ts';

const AUDIT_CONFIG_MODULE_PATH = toPosixPath(
  path.resolve(import.meta.dirname, '../src/core/auditConfig.ts')
);

function createMockTask(overrides: Partial<AuditTaskDefinition>): AuditTaskDefinition {
  return {
    id: overrides.id ?? 'mock_task',
    name: overrides.name ?? 'Mock Task',
    description: overrides.description ?? 'A mock subauditor for dynamic testing',
    family: overrides.family ?? 'architecture',
    scriptPath: overrides.scriptPath ?? 'src/mock.ts',
    command: overrides.command ?? 'node',
    args: overrides.args ?? [],
    fast: overrides.fast ?? true,
    timeoutMs: overrides.timeoutMs ?? 5000,
    order: overrides.order ?? 50,
    requiresAst: overrides.requiresAst ?? false,
    isBuiltin: overrides.isBuiltin ?? false,
    icon: overrides.icon ?? '🧪',
    capabilities: overrides.capabilities ?? {
      speed: 'light',
      phase: 'setup',
      md: false,
      ast: false,
      changedOnly: false,
      critical: false,
      fix: 'none'
    },
    gitIgnoreEntries: overrides.gitIgnoreEntries ?? [],
    scripts: overrides.scripts ?? [],
    manifest: overrides.manifest ?? ({} as any),
    configKey: overrides.configKey,
    defaultConfig: overrides.defaultConfig,
    criticalConfig: overrides.criticalConfig ?? {},
    ruleDescriptions: overrides.ruleDescriptions ?? {},
    ruleRemediations: overrides.ruleRemediations ?? {}
  };
}

describe('Dynamic Sub-auditor Configuration Contracts with Fictitious Suites', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-mock-subauditors-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('proves 100% dynamic tree aggregation from arbitrary fictitious subauditors with zero hardcoding', () => {
    const mockAlpha = createMockTask({
      id: 'fictitious_alpha',
      configKey: 'fictitiousAlpha.enabled',
      defaultConfig: {
        enabled: true,
        maxWorkers: 12,
        strategy: 'aggressive',
        nested: {
          deepFlag: true,
          subThreshold: 42
        }
      }
    });

    const mockBeta = createMockTask({
      id: 'fictitious_beta',
      configKey: 'fictitiousBeta.engine',
      defaultConfig: {
        enabled: true,
        features: ['quantum', 'matrix', 'warp'],
        tokens: ['ALPHA_', 'OMEGA_']
      }
    });

    const mockGamma = createMockTask({
      id: 'fictitious_gamma',
      configKey: 'fictitiousAlpha.extraBranch',
      defaultConfig: {
        extraFlag: true,
        customPatterns: ['**/*.fictitious']
      }
    });

    const expectedMap = buildTaskExpectedConfigTree([mockAlpha, mockBeta, mockGamma]);
    expect(expectedMap.has('fictitiousAlpha')).toBe(true);
    expect(expectedMap.has('fictitiousBeta')).toBe(true);

    const alphaTree = expectedMap.get('fictitiousAlpha')!.expectedTree;
    expect(alphaTree).toEqual({
      enabled: true,
      maxWorkers: 12,
      strategy: 'aggressive',
      nested: {
        deepFlag: true,
        subThreshold: 42
      },
      extraBranch: {
        extraFlag: true,
        customPatterns: ['**/*.fictitious']
      }
    });

    const betaTree = expectedMap.get('fictitiousBeta')!.expectedTree;
    expect(betaTree).toEqual({
      engine: {
        enabled: true,
        features: ['quantum', 'matrix', 'warp'],
        tokens: ['ALPHA_', 'OMEGA_']
      }
    });

    const collected = collectConfigSectionsFromTasks([mockAlpha, mockBeta, mockGamma]);
    expect(collected['fictitiousAlpha']).toEqual(alphaTree);
    expect(collected['fictitiousBeta']).toEqual(betaTree);
  });

  it('injects arbitrary fictitious subauditor configurations into an empty defineAuditConfig AST', async () => {
    const mockAlpha = createMockTask({
      id: 'fictitious_alpha',
      configKey: 'fictitiousAlpha.enabled',
      defaultConfig: {
        enabled: true,
        maxWorkers: 12,
        strategy: 'aggressive',
        nested: {
          deepFlag: true,
          subThreshold: 42
        }
      }
    });

    const mockBeta = createMockTask({
      id: 'fictitious_beta',
      configKey: 'fictitiousBeta.engine',
      defaultConfig: {
        enabled: true,
        features: ['quantum', 'matrix', 'warp'],
        tokens: ['ALPHA_', 'OMEGA_']
      }
    });

    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      `import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';\n\nexport default defineAuditConfig({});\n`,
      'utf-8'
    );

    const sectionsToInsert = collectConfigSectionsFromTasks([mockAlpha, mockBeta]);
    appendMissingSectionsToConfigFile(configPath, sectionsToInsert);

    const content = await fs.readFile(configPath, 'utf-8');

    // Verify fictitious Alpha properties
    expect(content).toContain('fictitiousAlpha: {');
    expect(content).toContain('enabled: true');
    expect(content).toContain('maxWorkers: 12');
    expect(content).toContain("strategy: 'aggressive'");
    expect(content).toContain('nested: {');
    expect(content).toContain('deepFlag: true');
    expect(content).toContain('subThreshold: 42');

    // Verify fictitious Beta properties
    expect(content).toContain('fictitiousBeta: {');
    expect(content).toContain('engine: {');
    expect(content).toContain("'quantum'");
    expect(content).toContain("'matrix'");
    expect(content).toContain("'warp'");
    expect(content).toContain("'ALPHA_'");
    expect(content).toContain("'OMEGA_'");
  });

  it('dynamically expands existing arrays with missing elements without duplicating existing items', async () => {
    const mockBeta = createMockTask({
      id: 'fictitious_beta',
      configKey: 'fictitiousBeta.engine',
      defaultConfig: {
        enabled: true,
        features: ['quantum', 'matrix', 'warp'],
        tokens: ['ALPHA_', 'OMEGA_']
      }
    });

    const initialConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  fictitiousBeta: {
    engine: {
      enabled: true,
      features: ['quantum'],
      tokens: ['ALPHA_']
    }
  }
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, initialConfig, 'utf-8');

    const sectionsToInsert = collectConfigSectionsFromTasks([mockBeta]);
    appendMissingSectionsToConfigFile(configPath, sectionsToInsert);

    const updatedContent = await fs.readFile(configPath, 'utf-8');

    // Features must now contain quantum, matrix, and warp
    expect(updatedContent).toContain("'quantum'");
    expect(updatedContent).toContain("'matrix'");
    expect(updatedContent).toContain("'warp'");

    // Tokens must now contain ALPHA_ and OMEGA_
    expect(updatedContent).toContain("'ALPHA_'");
    expect(updatedContent).toContain("'OMEGA_'");

    // Quantum must appear strictly once in features
    const quantumMatches = updatedContent.match(/'quantum'/g) ?? [];
    expect(quantumMatches).toHaveLength(1);

    // ALPHA_ must appear strictly once in tokens
    const alphaMatches = updatedContent.match(/'ALPHA_'/g) ?? [];
    expect(alphaMatches).toHaveLength(1);
  });

  it('is completely idempotent when run multiple times on an already synchronized configuration', async () => {
    const mockBeta = createMockTask({
      id: 'fictitious_beta',
      configKey: 'fictitiousBeta.engine',
      defaultConfig: {
        enabled: true,
        features: ['quantum', 'matrix', 'warp']
      }
    });

    const initialConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  fictitiousBeta: {
    engine: {
      enabled: true,
      features: ['quantum', 'matrix', 'warp']
    }
  }
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, initialConfig, 'utf-8');

    const sectionsToInsert = collectConfigSectionsFromTasks([mockBeta]);
    appendMissingSectionsToConfigFile(configPath, sectionsToInsert);

    const firstRunContent = await fs.readFile(configPath, 'utf-8');

    // Run again
    appendMissingSectionsToConfigFile(configPath, sectionsToInsert);
    const secondRunContent = await fs.readFile(configPath, 'utf-8');

    expect(secondRunContent).toBe(firstRunContent);
  });
});
