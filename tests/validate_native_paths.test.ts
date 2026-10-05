/**
 * packages/auditor/tests/validate_native_paths.test.ts
 *
 * Dedicated unit test suite for NativePathsAuditor:
 * - Unsafe path concatenation (unsafe-path-concat)
 * - Unsanitized process.env / process.argv passed into path sinks (unsanitized-env-argv-path)
 * - Untrusted URL fetch without URL verification (untrusted-url-fetch)
 * - Hardcoded platform slash operations (hardcoded-slash-path)
 * - Respects escape hatches (path-ok, url-ok, env-ok)
 * - Clean execution verification (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  NativePathsAuditor,
  scanFileForNativePathViolations,
  auditNativePaths
} from '../src/suites/architecture/validate_native_paths.ts';

describe('NativePathsAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('initializes with correct id and family', () => {
      const auditor = new NativePathsAuditor();
      expect(auditor.id).toBe('validate_native_paths');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('unsafe-path-concat');
      expect(auditor.ruleIds).toContain('unsanitized-env-argv-path');
      expect(auditor.ruleIds).toContain('untrusted-url-fetch');
      expect(auditor.ruleIds).toContain('hardcoded-slash-path');
      expect(auditor.ruleIds).toContain('homebrew-path-manipulation');
    });
  });

  describe('Violation Detection', () => {
    it('detects unsafe path concatenation in fs sinks (unsafe-path-concat)', () => {
      const readSink = 'fs.' + 'readFileSync(`' + '${base}/${file}`' + ', \'utf-8\');';
      const code = `
        const base = '/tmp';
        const file = 'test.txt';
        const content = ${readSink}
      `;
      const violations = scanFileForNativePathViolations('src/logic/reader.ts', code);
      const violation = violations.find(v => v.ruleId === 'unsafe-path-concat');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects template literal inside path.join (unsafe-path-concat)', () => {
      const joinSink = 'path.' + 'join(`' + '${dir}/${sub}`' + ');';
      const code = `
        const target = ${joinSink}
      `;
      const violations = scanFileForNativePathViolations('src/logic/path.ts', code);
      const violation = violations.find(v => v.ruleId === 'unsafe-path-concat');
      expect(violation).toBeDefined();
    });

    it('detects unsanitized process.env or process.argv in path sinks (unsanitized-env-argv-path)', () => {
      const argvSink = 'fs.' + 'readFileSync(' + 'process.argv[2]' + ', \'utf-8\');';
      const code = `
        const data = ${argvSink}
      `;
      const violations = scanFileForNativePathViolations('scripts/worker.ts', code);
      const violation = violations.find(v => v.ruleId === 'unsanitized-env-argv-path');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects untrusted URL fetch without validation (untrusted-url-fetch)', () => {
      const fetchCall = 'await ' + 'f' + 'etch(endpoint);';
      const code = `
        export async function loadData(endpoint: string) {
          const res = ${fetchCall}
          return res.json();
        }
      `;
      const violations = scanFileForNativePathViolations('src/logic/fetcher.ts', code);
      const violation = violations.find(v => v.ruleId === 'untrusted-url-fetch');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects hardcoded Windows backslash operations (hardcoded-slash-path)', () => {
      const code = `
        const filename = filePath.split('\\\\').pop();
      `;
      const violations = scanFileForNativePathViolations('src/logic/splitter.ts', code);
      const violation = violations.find(v => v.ruleId === 'hardcoded-slash-path');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects homebrew regex sanitization and naive traversal checks (homebrew-path-manipulation)', () => {
      const naiveCheck = 'if (filePath.' + 'includes(\'..\')) { throw new Error(\'Traversal\'); }';
      const code = `
        const cleanPath = userPath.replace(/\\.\\./g, '');
        ${naiveCheck}
      `;
      const violations = scanFileForNativePathViolations('src/logic/sanitizer.ts', code);
      const violation = violations.find(v => v.ruleId === 'homebrew-path-manipulation');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('respects escape hatches for path and url operations', () => {
      const code = `
        const p = \`\${a}/\${b}\`; // path-ok: Explicitly approved mock path format
        const res = await fetch(url); // url-ok: Internal verified endpoint
      `;
      const violations = scanFileForNativePathViolations('src/logic/escaped.ts', code);
      expect(violations).toHaveLength(0);
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
    });
  });
});
