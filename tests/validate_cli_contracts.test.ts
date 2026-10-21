/**
 * tests/validate_cli_contracts.test.ts
 *
 * Dedicated unit test suite for CliContractsAuditor (TypeScript AST, 6 rules):
 * - Metadata, AST capability, and 7-field rule capabilities contract
 * - Smoke tests per declared rule (100% rule coverage)
 * - Strings/comments immunity and escape hatch (`cli-ok`) support
 * - Case catalog runner (`tests/fixtures/cli_contracts/*.cases`) from Copilot, Deep Research, Gemini, and Grok
 * - Live repository audit verification (`auditCliContracts`)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  getProcessExecutedScript,
  parseCittyArgs,
  resolveHumanModeFromArgs
} from '../src/core/cli/cittyHarness.ts';
import {
  auditCliContracts,
  CLI_CONTRACT_EXTENSIONS,
  CLI_CONTRACT_RULES,
  CliContractsAuditor,
  scanFileForCliContractViolations,
  type CliContractRuleId
} from '../src/suites/architecture/validate_cli_contracts.ts';

describe('CliContractsAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('initializes with correct id, family, AST capability, and the 6 rules', () => {
      const auditor = new CliContractsAuditor();
      expect(auditor.id).toBe('validate_cli_contracts');
      expect(auditor.family).toBe('architecture');
      expect(auditor.requiresAst).toBe(true);
      expect([...auditor.ruleIds]).toEqual([...CLI_CONTRACT_RULES]);
      expect(CLI_CONTRACT_RULES).toHaveLength(7);
    });

    it('scans JSX flavors on top of canonical script extensions', () => {
      expect(CLI_CONTRACT_EXTENSIONS.has('.ts')).toBe(true);
      expect(CLI_CONTRACT_EXTENSIONS.has('.tsx')).toBe(true);
      expect(CLI_CONTRACT_EXTENSIONS.has('.jsx')).toBe(true);
    });
  });

  describe('Violation Detection', () => {
    it('detects direct process.argv access (cli-contracts-direct-argv-access)', () => {
      const code = 'const raw = process.argv.slice(2);';
      const violations = scanFileForCliContractViolations('src/logic/cli.ts', code);
      expect(violations.map((v) => v.ruleId)).toContain('cli-contracts-direct-argv-access');
      expect(violations[0]?.severity).toBe('error');
    });

    it('detects unauthorized CLI parser libraries (cli-contracts-banned-parser-library)', () => {
      const code = "import minimist from 'minimist';";
      const violations = scanFileForCliContractViolations('src/logic/parser.ts', code);
      expect(violations.map((v) => v.ruleId)).toContain('cli-contracts-banned-parser-library');
    });

    it('detects homebrew flag parsing heuristics (cli-contracts-homebrew-flag-parsing)', () => {
      const code = "const isDry = args.includes('--dry-run');";
      const violations = scanFileForCliContractViolations('src/logic/flags.ts', code);
      expect(violations.map((v) => v.ruleId)).toContain('cli-contracts-homebrew-flag-parsing');
    });

    it('detects dynamic eval or fd 0 stdin bypasses (cli-contracts-dynamic-eval-bypass)', () => {
      const code = "const input = fs.readFileSync(0, 'utf-8');";
      const violations = scanFileForCliContractViolations('src/logic/stdin.ts', code);
      expect(violations.map((v) => v.ruleId)).toContain('cli-contracts-dynamic-eval-bypass');
    });

    it('detects CLI entrypoints missing Citty contract (cli-contracts-missing-citty-contract)', () => {
      const code = [
        "import { isMainModule } from './cliUtils.ts';",
        "if (isMainModule(import.meta.url, ['auditor-custom'])) { console.log('run'); }"
      ].join('\n');
      const violations = scanFileForCliContractViolations('src/cli/custom_tool.ts', code);
      expect(violations.map((v) => v.ruleId)).toContain('cli-contracts-missing-citty-contract');
    });

    it('detects missing :human script registrations (cli-contracts-unregistered-script)', () => {
      const code =
        "export const CORE_PACKAGE_SCRIPT_REQUIREMENTS = [{ name: 'auditor', command: 'auditor' }];";
      const violations = scanFileForCliContractViolations(
        'src/core/packageScriptRegistry.ts',
        code
      );
      expect(violations.map((v) => v.ruleId)).toContain('cli-contracts-unregistered-script');
    });

    it('ignores occurrences inside strings and comments and respects cli-ok escape hatches', () => {
      const code = [
        '// process.argv.slice(2)',
        'const text = "process.argv";',
        'const allowed = process.argv.slice(2); // cli-ok: Authorized test harness'
      ].join('\n');
      expect(scanFileForCliContractViolations('src/logic/safe.ts', code)).toEqual([]);
    });
  });

  describe('Clean Execution', () => {
    it('runs on clean Citty command definitions and reports zero errors', () => {
      const cleanCode = [
        "import { defineCommand, runMain } from 'citty';",
        "import { isMainModule } from './cliUtils.ts';",
        'const main = defineCommand({',
        "  meta: { name: 'auditor-clean' },",
        "  args: { human: { type: 'boolean', default: false } },",
        '  run({ args }) { console.log(Boolean(args.human)); }',
        '});',
        "if (isMainModule(import.meta.url, ['auditor-clean'])) { runMain(main); }"
      ].join('\n');
      const violations = scanFileForCliContractViolations('src/cli/clean_tool.ts', cleanCode);
      expect(violations).toHaveLength(0);
    });

    it('detects missing citty dependency in package.json and repairs it in fix mode', async () => {
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'citty-dep-test-'));
      try {
        const dummyPkg = {
          name: 'test-host-project',
          version: '1.0.0',
          devDependencies: {
            vitest: '^5.0.0'
          }
        };
        await fs.promises.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify(dummyPkg, null, 2)
        );

        const auditorCheck = new CliContractsAuditor({ projectRoot: tempDir });
        const checkResult = await auditorCheck.execute();
        const depViolation = checkResult.findings.find(
          (f) => f.ruleId === 'cli-contracts-missing-citty-dependency'
        );
        expect(depViolation).toBeDefined();
        expect(depViolation?.message).toContain("Missing 'citty' dependency");

        // Run in fix mode
        const auditorFix = new CliContractsAuditor({ projectRoot: tempDir, fix: true });
        await auditorFix.execute();

        const updatedRaw = await fs.promises.readFile(path.join(tempDir, 'package.json'), 'utf8');
        const updatedPkg = JSON.parse(updatedRaw);
        expect(updatedPkg.devDependencies?.citty).toBe('^0.2.2');
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('auditCliContracts repository runner passes with zero homebrew CLI violations', () => {
      const result = auditCliContracts();
      expect(result.filesScanned).toBeGreaterThan(0);
      expect(result.violations).toEqual([]);
      expect(result.passed).toBe(true);
    });
  });

  describe('validate_cli_contracts case catalog', () => {
    interface CliContractCase {
      readonly id: string;
      readonly origin: string;
      readonly expected: CliContractRuleId | 'none';
      readonly line: number;
      readonly fileName: string;
      readonly code: string;
      readonly source: string;
    }

    const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'cli_contracts');
    const CASE_HEADER_PREFIX = '### ';
    const RULE_SET: ReadonlySet<string> = new Set<string>(CLI_CONTRACT_RULES);

    function readHeaderOption(tokens: readonly string[], key: string): string | undefined {
      const prefix = `${key}=`;
      return tokens.find((t) => t.startsWith(prefix))?.slice(prefix.length);
    }

    function toExpected(raw: string | undefined, header: string): CliContractRuleId | 'none' {
      if (raw === 'none') return 'none';
      if (raw && RULE_SET.has(raw)) return raw as CliContractRuleId; // type-ok: membership verified against CLI_CONTRACT_RULES
      throw new Error(`Invalid expect= value in case header: ${header}`);
    }

    function parseCaseHeader(header: string, body: string[], source: string): CliContractCase {
      const tokens = header.slice(CASE_HEADER_PREFIX.length).trim().split(' ');
      const fileName = readHeaderOption(tokens, 'file') ?? 'case.ts';
      return {
        id: tokens[0] ?? '',
        origin: tokens[1] ?? '',
        expected: toExpected(readHeaderOption(tokens, 'expect'), header),
        line: Number(readHeaderOption(tokens, 'line') ?? '1'),
        fileName,
        code: body.join('\n').trimEnd(),
        source
      };
    }

    function parseCasesFile(fileName: string): CliContractCase[] {
      const lines = fs.readFileSync(path.join(FIXTURES_DIR, fileName), 'utf-8').split('\n');
      const cases: CliContractCase[] = [];
      let header: string | undefined;
      let body: string[] = [];
      for (const line of lines) {
        if (line.startsWith(CASE_HEADER_PREFIX)) {
          if (header) cases.push(parseCaseHeader(header, body, fileName));
          header = line.trimEnd();
          body = [];
        } else if (header) {
          body.push(line.trimEnd());
        }
      }
      if (header) cases.push(parseCaseHeader(header, body, fileName));
      return cases;
    }

    const ALL_CASES: readonly CliContractCase[] = fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => path.extname(f) === '.cases')
      .sort()
      .flatMap(parseCasesFile);

    const POSITIVE_CASES = ALL_CASES.filter((c) => c.expected !== 'none');
    const NEGATIVE_CASES = ALL_CASES.filter((c) => c.expected === 'none');

    function scanCase(c: CliContractCase) {
      return scanFileForCliContractViolations(path.posix.join('src', c.fileName), c.code);
    }

    it('loads a comprehensive catalog with unique case ids', () => {
      expect(ALL_CASES.length).toBeGreaterThanOrEqual(50);
      expect(new Set(ALL_CASES.map((c) => c.id)).size).toBe(ALL_CASES.length);
    });

    it('covers every declared rule with at least 3 positive cases', () => {
      for (const rule of CLI_CONTRACT_RULES) {
        if (rule === 'cli-contracts-missing-citty-dependency') continue;
        const count = POSITIVE_CASES.filter((c) => c.expected === rule).length;
        expect(count, `positive cases for ${rule}`).toBeGreaterThanOrEqual(3);
      }
    });

    it.each(POSITIVE_CASES.map((c) => [`${c.id} (${c.origin}) → ${c.expected}`, c] as const))(
      'detects %s',
      (_label, c) => {
        const violations = scanCase(c);
        const hit = violations.find((v) => v.ruleId === c.expected);
        expect(
          hit,
          `${c.source} ${c.id}\n${c.code}\nfound: ${JSON.stringify(violations)}`
        ).toBeDefined();
        expect(hit?.line).toBe(c.line);
        expect(hit?.severity).toBe('error');
      }
    );

    it.each(NEGATIVE_CASES.map((c) => [`${c.id} (${c.origin})`, c] as const))(
      'ignores %s',
      (_label, c) => {
        const violations = scanCase(c);
        expect(violations, `${c.source} ${c.id}\n${c.code}`).toEqual([]);
      }
    );
  });

  describe('Citty CLI Harness & Human Mode Normalization', () => {
    it('normalizes bare boolean flags (human, json, verbose, help) and key=value pairs via parseCittyArgs', () => {
      const parsed = parseCittyArgs(COMMON_CLI_ARGS, [
        'human',
        'project=./host-app',
        'format=human',
        '--',
        'passthrough_token'
      ]);
      expect(parsed.human).toBe(true);
      expect(parsed.project).toBe('./host-app');
      expect(parsed.format).toBe('human');
      expect(resolveHumanModeFromArgs(parsed)).toBe(true);
      expect(resolveHumanModeFromArgs({}, ['human'])).toBe(true);
      expect(resolveHumanModeFromArgs({}, ['--verbose'])).toBe(true);
      expect(resolveHumanModeFromArgs({}, ['--json'])).toBe(false);
    });

    it('preserves subcommand names when subCommandNames set is provided', () => {
      const parsed = parseCittyArgs(
        COMMON_CLI_ARGS,
        ['discover', 'human'],
        new Set(['discover', 'inspect', 'apply'])
      );
      expect(parsed._[0]).toBe('discover');
      expect(parsed.human).toBe(true);
      expect(Array.isArray(getProcessCliArgs())).toBe(true);
      expect(typeof getProcessExecutedScript()).toBe('string');
    });
  });
});
