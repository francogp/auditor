import { spawn } from 'node:child_process';
import path from 'node:path';

function parseArgs(): { target: string; isCoverage: boolean; json: boolean } {
  const args = process.argv.slice(2);
  const json = args.includes('--json') || args.includes('json');
  const isCoverage = args.includes('--coverage');
  const target = args.find(a => !a.startsWith('-') && a !== 'json') ?? 'node';
  return { target, isCoverage, json };
}

function runTests(target: string, isCoverage: boolean): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const projectRoot = process.cwd();
    const runnerScript = path.join(projectRoot, 'scripts', 'testing', 'run_tests.ts');

    const nodeArgs = [
      '--permission',
      '--experimental-strip-types',
      '--allow-fs-read=*',
      '--allow-fs-write=*',
      '--allow-child-process',
      '--allow-addons',
      '--allow-net',
      runnerScript,
      target,
    ];

    if (isCoverage) {
      nodeArgs.push('--coverage');
    }

    const child = spawn(process.execPath, nodeArgs, {
      cwd: projectRoot,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stdout.write(str);
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stderr.write(str);
    });

    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, output });
    });
  });
}

async function main(): Promise<void> {
  const { target, isCoverage, json } = parseArgs();

  if (!json) {
    console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│                  ENTERPRISE ARCHITECTURE - UNIFIED TEST RUNNER                       │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Target Suite:                   ${target.padEnd(44)} │`);
    console.log(`│ Coverage:                       ${(isCoverage ? 'Enabled' : 'Disabled').padEnd(44)} │`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');
  }

  const { exitCode } = await runTests(target, isCoverage);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error('[TEST_RUNNER_ERROR]', err);
  process.exit(1);
});
