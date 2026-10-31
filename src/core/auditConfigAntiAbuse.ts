/**
 * packages/auditor/src/core/auditConfigAntiAbuse.ts
 *
 * Anti-abuse assertions, glob constraints, and root exemptions
 * for the audit configuration engine.
 */

import path from 'node:path';

import type { AuditEngineConfig } from './auditConfigTypes.ts';

export const FORBIDDEN_PRODUCTION_ROOTS: readonly string[] = [
  'src/logic',
  'src/domain',
  'src/stores',
  'src/components',
  'src/views',
  'src/composables',
  'src/services',
  'src/models',
  'src/controllers',
  'src/api',
  'src/server'
];

const FORBIDDEN_ROOT_PATTERNS: readonly RegExp[] = FORBIDDEN_PRODUCTION_ROOTS.map(
  (root) => new RegExp(`(^|/|\\*\\*/)${root.replaceAll('/', '\\/')}(/|$)`, 'i')
);

export const MAX_CONSTANTS_EXEMPT_GLOBS = 15;
export const MIN_COVERAGE_REASON_LENGTH = 15;

const BLOCKED_WILDCARD_LITERALS = ['', '*', '**', '*.*', '.*'] as const;
const BLOCKED_WILDCARD_PATTERNS = [/^src(?:\/\*+|\/)?$/i, /^scripts(?:\/\*+|\/)?$/i, /^\*+\/\*+$/];

const UNIVERSAL_COVERAGE_REGEX = /^(?:\*\*?\/?)+(?:\*(?:\.\*)?)?$/;
const NARROW_EXTENSION_REGEX = /^\*\*\/\*\.\w+$/;

export function normalizeRootPath(p: string): string {
  const converted = p.replaceAll(path.win32.sep, path.posix.sep);
  const resolved = path.posix.resolve('/', converted);
  return resolved === '/' ? '' : resolved.slice(1);
}

export function getExemptRootsForPolicy(
  policy: string,
  paths: AuditEngineConfig['paths']
): readonly string[] {
  switch (policy) {
    case 'scripts':
      return paths.scriptsRoots ?? ['scripts'];
    case 'cli':
      return paths.cliRoots ?? ['scripts'];
    case 'demo':
      return paths.demoRoots ?? [];
    case 'data':
      return paths.dataRoots ?? [];
    default:
      return [];
  }
}

export function filterOutExemptRoots(
  roots: readonly string[],
  exemptRoots: readonly string[]
): string[] {
  const exemptSet = new Set(exemptRoots.map(normalizeRootPath));
  return roots.filter((r) => !exemptSet.has(normalizeRootPath(r)));
}

function isBlanketCoverageGlob(glob: string): boolean {
  if (!glob || glob.includes('\\') || path.posix.isAbsolute(glob) || glob === '*.*') {
    return true;
  }
  return UNIVERSAL_COVERAGE_REGEX.test(glob) || NARROW_EXTENSION_REGEX.test(glob);
}

/**
 * Rejects globs that would blanket-exempt the repository, a whole extension, or a whole code/test root.
 */
export function assertNarrowCoverageGlob(
  field: string,
  rawGlob: string,
  protectedRoots: readonly string[]
): void {
  const glob = (rawGlob ?? '').trim();
  if (isBlanketCoverageGlob(glob)) {
    throw new Error(
      `[AuditConfig Anti-Abuse] '${field}' contains a global or invalid blanket glob: '${rawGlob}'. ` +
        `Use scoped, relative POSIX globs (e.g. 'dist/**', 'LICENSE').`
    );
  }
  for (const root of protectedRoots) {
    const cleanRoot = normalizeRootPath(root);
    if (!cleanRoot) continue;
    if (
      glob === cleanRoot ||
      new RegExp(`^${RegExp.escape(cleanRoot)}/(?:\\*\\*/?)*\\*?(?:\\.\\*|\\.\\w+)?$`).test(glob)
    ) {
      throw new Error(
        `[AuditConfig Anti-Abuse] '${field}' cannot exempt an entire code root ('${rawGlob}' covers '${cleanRoot}').`
      );
    }
  }
}

export function assertCoverageReason(
  field: string,
  glob: string,
  reason: string | undefined
): void {
  if (typeof reason !== 'string' || reason.trim().length < MIN_COVERAGE_REASON_LENGTH) {
    throw new Error(
      `[AuditConfig Anti-Abuse] '${field}' for '${glob}' requires a 'reason' of at least ${MIN_COVERAGE_REASON_LENGTH} characters.`
    );
  }
}

function isUniversalWildcard(glob: string): boolean {
  return (
    BLOCKED_WILDCARD_LITERALS.some((literal) => literal === glob) ||
    BLOCKED_WILDCARD_PATTERNS.some((re) => re.test(glob))
  );
}

function assertNoUniversalWildcard(rawGlob: string, glob: string): void {
  if (isUniversalWildcard(glob)) {
    throw new Error(
      `[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contains a prohibited global wildcard: '${rawGlob}'.\n` +
        `Using global wildcards ('*', '**', 'src/**', 'scripts/**') to evade the magic numbers mandate is STRICTLY PROHIBITED.`
    );
  }
}

function assertNoProtectedProductionRoots(rawGlob: string, targetPattern: string): void {
  for (let i = 0; i < FORBIDDEN_PRODUCTION_ROOTS.length; i++) {
    const pattern = FORBIDDEN_ROOT_PATTERNS[i]!;
    if (pattern.test(targetPattern)) {
      const prodRoot = FORBIDDEN_PRODUCTION_ROOTS[i]!;
      throw new Error(
        `[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contains a protected production logic path: '${rawGlob}'.\n` +
          `Exempting production directories (such as '${prodRoot}') is STRICTLY PROHIBITED.\n` +
          `Magic number exceptions are only permitted for seed scripts, fixtures, or isolated demos (e.g. 'scripts/database/seeds/**', 'ui-demo/**').`
      );
    }
  }
}

export function validateConstantsExemptGlobs(globs: readonly string[]): void {
  if (globs.length > MAX_CONSTANTS_EXEMPT_GLOBS) {
    throw new Error(
      `[AuditConfig Anti-Abuse] 'constants.exemptGlobs' exceeds the maximum limit of ${MAX_CONSTANTS_EXEMPT_GLOBS} patterns (${globs.length} configured).\n` +
        `Do not abuse exemptions. If you have this many violations, extract descriptive named constants or use test factories.`
    );
  }

  for (const rawGlob of globs) {
    const glob = rawGlob.trim().replaceAll(path.win32.sep, path.posix.sep);
    assertNoUniversalWildcard(rawGlob, glob);
    const targetPattern = glob.toLowerCase();
    assertNoProtectedProductionRoots(rawGlob, targetPattern);
  }
}
