/**
 * tests/zero_backward_compatibility_mandate.test.ts
 *
 * Dedicated Vitest canary verifying absolute zero backward compatibility, zero shims,
 * zero legacy alias methods, and strict prototype interface conformance across the codebase.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { HomebrewDetectorRegistry } from '../src/analyzers/homebrew/homebrewRegistry.ts';
import { BaseEntityRegistry, type IBaseEntityRegistry } from '../src/core/baseRegistry.ts';
import { SuiteIgnoreRegistry } from '../src/core/canonicalIgnoreRegistry.ts';
import { ConfigFileRegistry } from '../src/core/configFileRegistry.ts';
import { GitIgnoreRegistry } from '../src/core/gitIgnoreRegistry.ts';
import { PackageScriptRegistry } from '../src/core/packageScriptRegistry.ts';
import { BaseRefactorEngine } from '../src/core/refactor/baseRefactorEngine.ts';
import { toPosixRelative } from '../src/core/safePath.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.resolve(PROJECT_ROOT, 'src');

const CANONICAL_BASE_REGISTRY_PROPERTIES = new Set([
  'constructor',
  'register',
  'registerMany',
  'get',
  'has',
  'delete',
  'size',
  'getAll',
  'reset',
  'dispose'
]);

const REGISTRY_ALLOWED_PROTO_METHODS = {
  SuiteIgnoreRegistry: new Set(['constructor']),
  GitIgnoreRegistry: new Set(['constructor', 'register']),
  ConfigFileRegistry: new Set(['constructor', 'register']),
  PackageScriptRegistry: new Set(['constructor', 'register', 'registerMany']),
  HomebrewDetectorRegistry: new Set([
    'constructor',
    'scanFile',
    'scanAll',
    'getRuleIds',
    'getRuleDescriptions',
    'getRuleRemediations',
    'run'
  ])
} as const;

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Zero Backward Compatibility & Strict Interface Mandate Canary', () => {
  describe('1. Static Codebase Verification (Zero Shims & Zero Backward Compatibility Annotations)', () => {
    it('ensures no source file in src/ contains backward-compatibility shims or annotations', () => {
      const files = collectSourceFiles(SRC_DIR);
      const violations: { file: string; line: number; match: string }[] = [];

      // Regex matches backward-compat annotations, excluding rule definitions and mandate validators
      const forbiddenPattern =
        /\b(?:for backward compatibility|backward-compatible shim|legacy fallback wrapper)\b/i;

      for (const file of files) {
        const relPath = toPosixRelative(PROJECT_ROOT, file);
        // Exempt mandate rule definers and analyzers that test for this text
        if (
          relPath.includes('validate_agents_config_mandate.ts') ||
          relPath.includes('analyzers/homebrew/')
        ) {
          continue;
        }

        const lines = fs.readFileSync(file, 'utf-8').split('\n');
        lines.forEach((line, idx) => {
          if (forbiddenPattern.test(line)) {
            violations.push({
              file: relPath,
              line: idx + 1,
              match: line.trim()
            });
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });

  describe('2. Prototype Introspection (Zero Uncontracted Alias Methods)', () => {
    it('BaseEntityRegistry strictly defines only canonical members and zero alias methods (like count)', () => {
      const protoKeys = Object.getOwnPropertyNames(BaseEntityRegistry.prototype);
      const rogueKeys = protoKeys.filter((key) => !CANONICAL_BASE_REGISTRY_PROPERTIES.has(key));

      expect(rogueKeys).toEqual([]);
      expect(protoKeys).not.toContain('count');
      expect(protoKeys).toContain('size');
      expect(protoKeys).toContain('dispose');
    });

    it('BaseEntityRegistry compile-time type strictly matches IBaseEntityRegistry with zero extra public keys', () => {
      // Architectural rationale: Compile-time type invariance assertion is placed in this dedicated
      // test canary rather than baseRegistry.ts to avoid TS6196 ('declared but never used') in production
      // code when compiling with noUnusedLocals: true.
      type AssertNever<T extends never> = T;
      type VerifyExact = AssertNever<
        Exclude<keyof BaseEntityRegistry<unknown>, keyof IBaseEntityRegistry<unknown>>
      >;
      const assertExact: VerifyExact = null as never;
      expect(assertExact).toBeNull();
    });

    it('All canonical singleton registries inherit from BaseEntityRegistry and lack rogue alias methods', () => {
      const registries = [
        { name: 'SuiteIgnoreRegistry' as const, reg: SuiteIgnoreRegistry },
        { name: 'GitIgnoreRegistry' as const, reg: GitIgnoreRegistry },
        { name: 'ConfigFileRegistry' as const, reg: ConfigFileRegistry },
        { name: 'PackageScriptRegistry' as const, reg: PackageScriptRegistry },
        { name: 'HomebrewDetectorRegistry' as const, reg: HomebrewDetectorRegistry }
      ];

      for (const { name, reg } of registries) {
        expect(
          reg instanceof BaseEntityRegistry,
          `${name} must inherit from BaseEntityRegistry`
        ).toBe(true);

        const proto = Object.getPrototypeOf(reg);
        const protoKeys = Object.getOwnPropertyNames(proto);
        const allowed = REGISTRY_ALLOWED_PROTO_METHODS[name];
        const rogueKeys = protoKeys.filter((key) => !allowed.has(key));

        expect(rogueKeys, `${name} prototype must not declare uncontracted methods`).toEqual([]);
        expect(protoKeys).not.toContain('count');
        expect(
          typeof (reg as unknown as { count?: unknown }).count,
          `${name} must not expose alias count()`
        ).toBe('undefined');

        expect(typeof reg.size, `${name}.size must be number`).toBe('number');
      }
    });

    it('BaseRefactorEngine conforms to IRefactorEngine contract without rogue shims', () => {
      const protoKeys = Object.getOwnPropertyNames(BaseRefactorEngine.prototype);

      expect(protoKeys).toContain('getAuditor');
      expect(protoKeys).toContain('getScannableFiles');
      expect(protoKeys).toContain('isPathScannable');
      expect(protoKeys).toContain('discoverAll');
    });
  });
});
