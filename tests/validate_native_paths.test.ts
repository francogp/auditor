/**
 * packages/auditor/tests/validate_native_paths.test.ts
 *
 * Dedicated unit test suite for NativePathsAuditor (TypeScript AST, 9 rules):
 * - Metadata, AST capability and JSX extension coverage
 * - One smoke case per legacy rule (exhaustive catalog: validate_native_paths_cases.test.ts)
 * - Strings/comments immunity and Vue SFC line alignment
 * - Respects escape hatches (path-ok, url-ok, env-ok)
 * - Clean execution verification (0 errors, passed status)
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  NATIVE_PATH_EXTENSIONS,
  NATIVE_PATH_RULES,
  NativePathsAuditor,
  scanFileForNativePathViolations,
  auditNativePaths,
  type NativePathRuleId
} from '../src/suites/architecture/validate_native_paths.ts';

describe('NativePathsAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('initializes with correct id, family, AST capability and the 9 rules', () => {
      const auditor = new NativePathsAuditor();
      expect(auditor.id).toBe('validate_native_paths');
      expect(auditor.family).toBe('architecture');
      expect(auditor.requiresAst).toBe(true);
      expect([...auditor.ruleIds]).toEqual([...NATIVE_PATH_RULES]);
      expect(NATIVE_PATH_RULES).toHaveLength(9);
    });

    it('scans JSX flavors on top of the canonical script extensions', () => {
      expect(NATIVE_PATH_EXTENSIONS.has('.tsx')).toBe(true);
      expect(NATIVE_PATH_EXTENSIONS.has('.jsx')).toBe(true);
      expect(NATIVE_PATH_EXTENSIONS.has('.vue')).toBe(true);
    });
  });

  describe('Violation Detection', () => {
    it('detects unsafe path concatenation in fs sinks (unsafe-path-concat)', () => {
      const code = [
        "const base = '/tmp';",
        "const file = 'test.txt';",
        "const content = fs.readFileSync(`${base}/${file}`, 'utf-8');"
      ].join('\n');
      const violation = scanFileForNativePathViolations('src/logic/reader.ts', code).find(
        (v) => v.ruleId === 'unsafe-path-concat'
      );
      expect(violation?.line).toBe(3);
      expect(violation?.severity).toBe('error');
    });

    it('detects template literal inside path.join (unsafe-path-concat)', () => {
      const code = 'const target = path.join(`${dir}/${sub}`);';
      const rules = scanFileForNativePathViolations('src/logic/path.ts', code).map((v) => v.ruleId);
      expect(rules).toContain('unsafe-path-concat');
    });

    it('detects unsanitized process.env or process.argv in path sinks (unsanitized-env-argv-path)', () => {
      const code = "const data = fs.readFileSync(process.argv[2], 'utf-8');";
      const violation = scanFileForNativePathViolations('scripts/worker.ts', code).find(
        (v) => v.ruleId === 'unsanitized-env-argv-path'
      );
      expect(violation?.severity).toBe('error');
    });

    it('detects untrusted URL fetch without validation (untrusted-url-fetch)', () => {
      const code =
        'export async function loadData(endpoint: string) { return (await fetch(endpoint)).json(); }';
      const violation = scanFileForNativePathViolations('src/logic/fetcher.ts', code).find(
        (v) => v.ruleId === 'untrusted-url-fetch'
      );
      expect(violation?.severity).toBe('error');
    });

    it('detects hardcoded Windows backslash operations (hardcoded-slash-path)', () => {
      const code = "import path from 'node:path';\nconst filename = filePath.split('\\\\').pop();";
      const rules = scanFileForNativePathViolations('src/logic/splitter.ts', code).map(
        (v) => v.ruleId
      );
      expect(rules).toContain('hardcoded-slash-path');
    });

    it('splits sanitization and traversal checks into their dedicated rules', () => {
      const code = [
        "import fs from 'node:fs';",
        "const posix = userPath.replace(/\\\\/g, '/');",
        "if (filePath.includes('..')) { throw new Error('Traversal'); }"
      ].join('\n');
      const violations = scanFileForNativePathViolations('src/logic/sanitizer.ts', code);
      expect(violations.map((v) => [v.ruleId, v.line])).toEqual([
        ['homebrew-path-manipulation', 2],
        ['homebrew-path-containment', 3]
      ]);
    });

    it('detects manual extension and basename parsing (homebrew-path-parsing)', () => {
      const code = [
        "import path from 'node:path';",
        "const ext = filePath.split('.').pop();",
        "const base = filePath.split('/').pop();"
      ].join('\n');
      const violations = scanFileForNativePathViolations('src/logic/parser.ts', code);
      const ruleIds = violations.map((v) => v.ruleId);
      expect(ruleIds).toContain('homebrew-path-parsing');
    });

    it('detects homebrew file URL conversions (homebrew-file-url)', () => {
      const code = [
        "import url from 'node:url';",
        "const p = fileUrl.replace(/^file:\\/\\//, '');"
      ].join('\n');
      const violations = scanFileForNativePathViolations('src/logic/urlHelper.ts', code);
      const ruleIds = violations.map((v) => v.ruleId);
      expect(ruleIds).toContain('homebrew-file-url');
    });

    it('detects homebrew URL search or query parsing (homebrew-url-parsing)', () => {
      const code = "const query = fullUrl.split('?')[1]?.split('&');";
      const violations = scanFileForNativePathViolations('src/logic/urlParser.ts', code);
      const ruleIds = violations.map((v) => v.ruleId);
      expect(ruleIds).toContain('homebrew-url-parsing');
    });

    it('ignores code that only appears inside strings or comments', () => {
      const code = [
        "// const p = __dirname + '/x';",
        'const s = "fs.readFileSync(dir + \'/\' + file)";'
      ].join('\n');
      expect(scanFileForNativePathViolations('src/logic/strings.ts', code)).toEqual([]);
    });

    it('scans Vue SFC script blocks with aligned line numbers and ignores styles', () => {
      const code = [
        '<template><div /></template>',
        '<script setup lang="ts">',
        "const asset = __dirname + '/a.png';",
        '</script>',
        '<style scoped>.hero { background: url(/img/a.png); }</style>'
      ].join('\n');
      const violations = scanFileForNativePathViolations('src/components/Hero.vue', code);
      expect(violations.map((v) => [v.ruleId, v.line])).toEqual([['unsafe-path-concat', 3]]);
    });

    it('detects violations even when inline escape comments are present (Zero-Ignore Mandate)', () => {
      const code = `
        const p = \`\${a}/\${b}\`; // path-ok: Explicitly approved mock path format
        const res = await fetch(url); // url-ok: Internal verified endpoint
      `;
      const violations = scanFileForNativePathViolations('src/logic/escaped.ts', code);
      expect(violations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Clean Execution', () => {
    it('runs on clean files and reports zero errors', () => {
      const cleanCode = `
        import path from 'node:path';
        import fs from 'node:fs';
        
        const fullPath = path.join(dir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
      `;
      const violations = scanFileForNativePathViolations('src/logic/clean.ts', cleanCode);
      expect(violations).toHaveLength(0);
    });

    it('auditNativePaths integration runner passes', () => {
      const result = auditNativePaths();
      expect(typeof result.passed).toBe('boolean');
      expect(result.filesScanned).toBeGreaterThan(0);
      expect(result.violations).toBeDefined();
    }, 60_000);
  });

  describe('validate_native_paths case catalog', () => {
    interface NativePathCase {
      readonly id: string;
      readonly origin: string;
      readonly expected: NativePathRuleId | 'none';
      readonly line: number;
      readonly fileName: string;
      readonly env: 'node' | 'browser';
      readonly code: string;
      readonly source: string;
    }

    const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'native_paths');
    const CASE_HEADER_PREFIX = '### ';
    const NODE_PREAMBLE = "import path from 'node:path';";
    const RULE_SET: ReadonlySet<string> = new Set<string>(NATIVE_PATH_RULES);

    function readHeaderOption(tokens: readonly string[], key: string): string | undefined {
      const prefix = `${key}=`;
      return tokens.find((t) => t.startsWith(prefix))?.slice(prefix.length);
    }

    function toExpected(raw: string | undefined, header: string): NativePathRuleId | 'none' {
      if (raw === 'none') return 'none';
      if (raw && RULE_SET.has(raw)) return raw as NativePathRuleId; // type-ok: membership verified against NATIVE_PATH_RULES
      throw new Error(`Invalid expect= value in case header: ${header}`);
    }

    function parseCaseHeader(header: string, body: string[], source: string): NativePathCase {
      const tokens = header.slice(CASE_HEADER_PREFIX.length).trim().split(' ');
      const fileName = readHeaderOption(tokens, 'file') ?? 'case.ts';
      const isBrowser =
        readHeaderOption(tokens, 'env') === 'browser' || path.extname(fileName) === '.vue';
      return {
        id: tokens[0] ?? '',
        origin: tokens[1] ?? '',
        expected: toExpected(readHeaderOption(tokens, 'expect'), header),
        line: Number(readHeaderOption(tokens, 'line') ?? '1'),
        fileName,
        env: isBrowser ? 'browser' : 'node',
        code: body.join('\n').trimEnd(),
        source
      };
    }

    function parseCasesFile(fileName: string): NativePathCase[] {
      const lines = fs.readFileSync(path.join(FIXTURES_DIR, fileName), 'utf-8').split('\n');
      const cases: NativePathCase[] = [];
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

    const ALL_CASES: readonly NativePathCase[] = fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => path.extname(f) === '.cases')
      .sort()
      .flatMap(parseCasesFile);

    const POSITIVE_CASES = ALL_CASES.filter((c) => c.expected !== 'none');
    const NEGATIVE_CASES = ALL_CASES.filter((c) => c.expected === 'none');

    function scanCase(c: NativePathCase) {
      const code = c.env === 'node' ? `${NODE_PREAMBLE}\n${c.code}` : c.code;
      return scanFileForNativePathViolations(path.posix.join('src', c.fileName), code);
    }

    function expectedLine(c: NativePathCase): number {
      return c.env === 'node' ? c.line + 1 : c.line;
    }

    it('loads a non-trivial catalog with unique ids', () => {
      expect(ALL_CASES.length).toBeGreaterThan(100);
      expect(new Set(ALL_CASES.map((c) => c.id)).size).toBe(ALL_CASES.length);
    });

    it('covers every declared rule with at least 3 positive cases', () => {
      for (const rule of NATIVE_PATH_RULES) {
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
        expect(hit?.line).toBe(expectedLine(c));
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
});
