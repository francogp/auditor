import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

import { runRefactorDomainCli } from '../../../src/cli/refactor_domain.ts';
import { runRefactorCli } from '../../../src/cli/refactor_dupes.ts';
import { runRefactorMagicCli } from '../../../src/cli/refactor_magic.ts';
import { runRefactorMotionCli } from '../../../src/cli/refactor_motion.ts';
import { runRefactorO1Cli } from '../../../src/cli/refactor_o1.ts';
import { runRefactorTypesCli } from '../../../src/cli/refactor_types.ts';
import {
  formatCliRelativeFilePath,
  runRefactorCliHarness
} from '../../../src/core/refactor/refactorCliHarness.ts';

describe('Refactor CLI Handlers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs refactor_motion CLI with --help flag without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorMotionCli(['--help'])).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('runs refactor_motion discover and inspect on target directory', async () => {
    const sample = path.join(tmpDir, 'motionSample.ts');
    fs.writeFileSync(sample, 'setTimeout(() => {}, 200);');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorMotionCli(['discover', '--project', tmpDir])).resolves.not.toThrow();
    await expect(
      runRefactorMotionCli(['inspect', '--file', sample, '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs refactor_o1 CLI with --help flag without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorO1Cli(['--help'])).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('runs refactor_o1 discover and inspect on target directory', async () => {
    const sample = path.join(tmpDir, 'o1Sample.ts');
    fs.writeFileSync(
      sample,
      'export function clone(x: any) { return JSON.parse(JSON.stringify(x)); }'
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorO1Cli(['discover', '--project', tmpDir])).resolves.not.toThrow();
    await expect(
      runRefactorO1Cli(['inspect', '--file', sample, '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs refactor_magic CLI with --help flag without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorMagicCli(['--help'])).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('runs refactor_magic discover on an empty directory gracefully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorMagicCli(['discover', '--project', tmpDir])).resolves.not.toThrow();
    logSpy.mockRestore();
  });

  it('runs refactor_magic inspect on a file without throwing', async () => {
    const filePath = path.join(tmpDir, 'sample.ts');
    fs.writeFileSync(filePath, 'export const val = 42;\nexport const delay = 300;');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runRefactorMagicCli(['inspect', 'sample.ts', '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs refactor_dupes CLI discover in json mode gracefully', async () => {
    const oldArgv = process.argv;
    process.argv = ['node', 'refactor_dupes.ts', 'discover', '--project', tmpDir, '--json'];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorCli()).resolves.not.toThrow();

    logSpy.mockRestore();
    process.argv = oldArgv;
  });

  it('runs refactor_dupes CLI discover with table output gracefully', async () => {
    const oldArgv = process.argv;
    process.argv = ['node', 'refactor_dupes.ts', 'discover', '--project', tmpDir];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorCli()).resolves.not.toThrow();

    logSpy.mockRestore();
    process.argv = oldArgv;
  });

  it('handles unknown command in refactor_dupes CLI without throwing', async () => {
    const oldArgv = process.argv;
    process.argv = ['node', 'refactor_dupes.ts', 'unknown_cmd'];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorCli()).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Available commands'));

    logSpy.mockRestore();
    process.argv = oldArgv;
  });

  it('runs refactor_magic apply command applying mutations to target files', async () => {
    const srcFile = path.join(tmpDir, 'testMath.ts');
    fs.writeFileSync(srcFile, 'export function getTimeout() { return 5000; }');
    const planPath = path.join(tmpDir, 'magic-plan.json');
    const plan = {
      planId: 'plan-magic-1',
      targetFiles: ['testMath.ts'],
      declarations: [
        {
          name: 'DEFAULT_TIMEOUT_MS',
          value: 5000,
          targetLocation: 'local-file-header' as const
        }
      ],
      fileReplacements: {
        'testMath.ts': [
          {
            startOffset: 38,
            endOffset: 42,
            replacement: 'DEFAULT_TIMEOUT_MS'
          }
        ]
      }
    };
    fs.writeFileSync(planPath, JSON.stringify(plan));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runRefactorMagicCli(['apply', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs refactor_magic CLI with help, discover, and inspect', async () => {
    const srcFile = path.join(tmpDir, 'sampleMagic.ts');
    fs.writeFileSync(srcFile, 'export function calc() { return 4200; }');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorMagicCli(['help'])).resolves.not.toThrow();
    await expect(runRefactorMagicCli(['discover', '--project', tmpDir])).resolves.not.toThrow();
    await expect(
      runRefactorMagicCli(['inspect', '--file', srcFile, '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('formats CLI relative file paths with ellipsis when exceeding max length', () => {
    expect(formatCliRelativeFilePath('short/path.ts')).toBe('short/path.ts');
    const longPath =
      'very/long/nested/path/to/some/deeply/nested/component/that/exceeds/the/limit/file.ts';
    const formatted = formatCliRelativeFilePath(longPath);
    expect(formatted.startsWith('...')).toBe(true);
    expect(formatted.length).toBeLessThanOrEqual(44);
  });

  it('runs refactor_dupes apply command applying refactoring plan', async () => {
    const srcFile = path.join(tmpDir, 'testClone.ts');
    fs.writeFileSync(srcFile, 'export function add(a: number, b: number) { return a + b; }');
    const planPath = path.join(tmpDir, 'dupes-plan.json');
    const plan = {
      version: 1,
      planId: 'plan-1',
      fingerprint: 'fp-1',
      action: 'extract-function-pure',
      sharedModulePath: 'utils.ts',
      functionName: 'add',
      parameters: [{ name: 'a' }, { name: 'b' }],
      sharedFunctionCode: 'function add(a: number, b: number) { return a + b; }',
      targetFiles: ['testClone.ts'],
      astPattern: '$A + $B',
      astRewrite: 'add($A, $B)'
    };
    fs.writeFileSync(planPath, JSON.stringify(plan));

    const oldArgv = process.argv;
    process.argv = ['node', 'refactor_dupes.ts', 'apply', planPath, '--project', tmpDir];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorCli()).resolves.not.toThrow();

    logSpy.mockRestore();
    process.argv = oldArgv;
  });

  it('handles refactor_dupes inspect command when fingerprint is missing', async () => {
    const oldArgv = process.argv;
    process.argv = ['node', 'refactor_dupes.ts', 'inspect', '--project', tmpDir];
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(runRefactorCli()).rejects.toThrow('exit called');

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('You must specify a fingerprint'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
    process.argv = oldArgv;
  });

  it('runs refactor_motion apply command applying plan to target files', async () => {
    const srcFile = path.join(tmpDir, 'timerTest.ts');
    fs.writeFileSync(srcFile, 'setTimeout(() => {}, 200);');
    const planPath = path.join(tmpDir, 'motion-plan.json');
    const plan = {
      version: 1,
      planId: 'motion-1',
      targetFiles: ['timerTest.ts'],
      timerReplacements: [
        {
          file: 'timerTest.ts',
          originalCall: 'setTimeout(() => {}, 200);',
          replacementCall: 'gsap.delayedCall(0.2, () => {});'
        }
      ]
    };
    fs.writeFileSync(planPath, JSON.stringify(plan));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runRefactorMotionCli(['apply', '--plan', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();

    const result = fs.readFileSync(srcFile, 'utf8');
    expect(result).toContain('gsap.delayedCall(0.2, () => {});');
    logSpy.mockRestore();
  });

  it('runs refactor_o1 apply command applying plan to target files', async () => {
    const srcFile = path.join(tmpDir, 'o1Test.ts');
    fs.writeFileSync(srcFile, 'const a = JSON.parse(JSON.stringify(b));');
    const planPath = path.join(tmpDir, 'o1-plan.json');
    const plan = {
      version: 1,
      planId: 'o1-1',
      targetFiles: ['o1Test.ts'],
      jsonCloneReplacements: [
        {
          file: 'o1Test.ts',
          originalExpression: 'JSON.parse(JSON.stringify(b))',
          replacementExpression: 'structuredClone(b)'
        }
      ]
    };
    fs.writeFileSync(planPath, JSON.stringify(plan));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runRefactorO1Cli(['apply', '--plan', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();

    const result = fs.readFileSync(srcFile, 'utf8');
    expect(result).toContain('structuredClone(b)');
    logSpy.mockRestore();
  });

  it('runs refactor_types CLI with --help flag without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorTypesCli(['--help'])).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('runs refactor_types discover and inspect on target directory', async () => {
    const sample = path.join(tmpDir, 'typesSample.ts');
    fs.writeFileSync(sample, 'const a = x as any;');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorTypesCli(['discover', '--project', tmpDir])).resolves.not.toThrow();
    await expect(
      runRefactorTypesCli(['inspect', '--file', sample, '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs refactor_domain CLI with --help flag without throwing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorDomainCli(['--help'])).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('runs refactor_domain discover and inspect on target directory', async () => {
    const sample = path.join(tmpDir, 'domainSample.ts');
    fs.writeFileSync(sample, "export const MODES = ['a', 'b'];");
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runRefactorDomainCli(['discover', '--project', tmpDir])).resolves.not.toThrow();
    await expect(
      runRefactorDomainCli(['inspect', '--file', sample, '--project', tmpDir])
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs refactor_motion apply command with declarative plan', async () => {
    const sample = path.join(tmpDir, 'motionSample.ts');
    fs.writeFileSync(sample, 'setTimeout(() => {}, 200);');
    const planPath = path.join(tmpDir, 'motionPlan.json');
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        planId: 'test-motion-plan',
        targetFiles: []
      })
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      runRefactorMotionCli(['apply', '--plan', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();
    logSpy.mockRestore();
  });

  it('runs refactor_o1 apply command with declarative plan', async () => {
    const planPath = path.join(tmpDir, 'o1Plan.json');
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        planId: 'test-o1-plan',
        targetFiles: []
      })
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      runRefactorO1Cli(['apply', '--plan', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();
    logSpy.mockRestore();
  });

  it('runs refactor_types apply command with declarative plan', async () => {
    const planPath = path.join(tmpDir, 'typesPlan.json');
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        planId: 'test-types-plan',
        targetFiles: []
      })
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      runRefactorTypesCli(['apply', '--plan', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();
    logSpy.mockRestore();
  });

  it('runs refactor_domain apply command with declarative plan', async () => {
    const planPath = path.join(tmpDir, 'domainPlan.json');
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        planId: 'test-domain-plan',
        targetFiles: []
      })
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      runRefactorDomainCli(['apply', '--plan', planPath, '--project', tmpDir])
    ).resolves.not.toThrow();
    logSpy.mockRestore();
  });

  it('runs inspect on clean file reporting zero findings', async () => {
    const sample = path.join(tmpDir, 'cleanSample.ts');
    fs.writeFileSync(sample, 'export const a: number = 1;');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runRefactorMotionCli(['inspect', '--file', sample, '--project', tmpDir])
    ).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('notifies and skips when engine is disabled in audit.config', async () => {
    const dummyDef = {
      toolName: 'auditor-test',
      toolDescription: 'test tool',
      bannerTitle: 'test',
      bannerSubtitle: 'test',
      scanningMessage: 'scanning',
      zeroFindingsMessage: 'zero',
      tableColumns: [],
      engineFactory: () =>
        ({
          toolId: 'testTool',
          isToolEnabled: () => false,
          getScannableFiles: () => []
        }) as any,
      discoverInFile: () => [],
      buildTableRow: () => ({}),
      buildSummaryMessage: () => '',
      toDiracItem: () => ({}) as any,
      createPlan: () => ({}),
      applyPlan: () => ({ filesChanged: 0, changesApplied: 0 })
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runRefactorCliHarness(dummyDef, ['discover'])).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    logSpy.mockRestore();
  });

  it('inspects file with findings and outputs Dirac micro-context', async () => {
    const sample = path.join(tmpDir, 'motionSampleWithFindings.ts');
    fs.writeFileSync(sample, 'setTimeout(() => {}, 200);\nsetInterval(() => {}, 500);\n');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runRefactorMotionCli(['inspect', '--file', sample, '--project', tmpDir])
    ).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Micro-Context'));
    logSpy.mockRestore();
  });

  it('exits with error when inspect is invoked without target file', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(runRefactorMotionCli(['inspect', '--project', tmpDir])).rejects.toThrow(
      'exit called'
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('You must specify a file'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error when apply is invoked without plan file', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(runRefactorMotionCli(['apply', '--project', tmpDir])).rejects.toThrow(
      'exit called'
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('You must specify a plan file'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error on unknown command in harness', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(runRefactorMotionCli(['invalid_command', '--project', tmpDir])).rejects.toThrow(
      'exit called'
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with error when inspect target file does not exist', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit called');
    }) as any);

    await expect(
      runRefactorMotionCli(['inspect', '--file', 'non_existent_file.ts', '--project', tmpDir])
    ).rejects.toThrow('exit called');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
