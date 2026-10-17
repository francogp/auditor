import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { defineAuditConfig, resetAuditConfig } from '../src/core/auditConfig.ts';
import {
  detectUnacknowledgedDegradations,
  applyAcknowledgedDegradationsFix,
  collectRelativeCodeFiles
} from '../src/core/auditConfigDegradations.ts';

describe('auditConfigDegradations', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'degradations-test-'));
  });

  afterEach(async () => {
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns empty array when coverage is disabled', () => {
    const config = defineAuditConfig({
      name: 'test',
      coverage: { enabled: false }
    });
    expect(detectUnacknowledgedDegradations(config, tempDir)).toEqual([]);
  });

  it('detects unacknowledged degradation for existing code files in scripts and data', async () => {
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'scripts', 'build.ts'), 'export const x = 1;', 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src/data'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src/data', 'items.ts'),
      'export const items = [];',
      'utf-8'
    );

    const config = defineAuditConfig({
      name: 'test',
      paths: {
        scriptsRoots: ['scripts'],
        dataRoots: ['src/data']
      },
      coverage: {
        enabled: true,
        acknowledgedDegradations: []
      }
    });

    const detected = detectUnacknowledgedDegradations(config, tempDir);
    expect(detected).toHaveLength(2);
    expect(detected.map((d) => d.policy)).toEqual(['scripts', 'data']);
  });

  it('returns empty array when code files are already acknowledged', async () => {
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'scripts', 'build.ts'), 'export const x = 1;', 'utf-8');

    const config = defineAuditConfig({
      name: 'test',
      paths: {
        scriptsRoots: ['scripts']
      },
      coverage: {
        enabled: true,
        acknowledgedDegradations: [
          {
            glob: 'scripts/**',
            policy: 'scripts',
            reason: 'Scripts de compilación, herramientas de desarrollo y mantenimiento'
          }
        ]
      }
    });

    const detected = detectUnacknowledgedDegradations(config, tempDir);
    expect(detected).toHaveLength(0);
  });

  it('applies acknowledged degradations fix to a JSON config file', async () => {
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    const jsonPath = path.join(tempDir, '.auditor', 'audit.config.json');
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ name: 'test', coverage: { enabled: true } }, null, 2),
      'utf-8'
    );

    applyAcknowledgedDegradationsFix(tempDir, [
      {
        policy: 'scripts',
        rootOrFile: 'scripts',
        suggestedGlob: 'scripts/**',
        reason: 'Scripts de compilación, herramientas de desarrollo y mantenimiento',
        filesCount: 1
      }
    ]);

    const updated = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    expect(updated.coverage.acknowledgedDegradations).toHaveLength(1);
    expect(updated.coverage.acknowledgedDegradations[0].glob).toBe('scripts/**');
  });

  it('collects relative code files while skipping node_modules and hidden files', async () => {
    await fs.mkdir(path.join(tempDir, 'demo', 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'demo', 'node_modules', 'mod.ts'), '// mod', 'utf-8');
    await fs.writeFile(path.join(tempDir, 'demo', '.hidden.ts'), '// hidden', 'utf-8');
    await fs.writeFile(path.join(tempDir, 'demo', 'main.ts'), 'export default 1;', 'utf-8');

    const files = collectRelativeCodeFiles(tempDir, 'demo');
    expect(files).toEqual(['demo/main.ts']);
  });
});
