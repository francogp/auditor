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

export const MAX_CONSTANTS_EXEMPT_GLOBS = 15;
export const MIN_COVERAGE_REASON_LENGTH = 15;

const BLOCKED_WILDCARD_LITERALS = ['', '*', '**', '*.*', '.*'] as const;
const BLOCKED_WILDCARD_PATTERNS = [
  /^src(?:\/\*+|\/)?$/i,
  /^scripts(?:\/\*+|\/)?$/i,
  /^\*+\/\*+$/
];

const UNIVERSAL_COVERAGE_REGEX = /^(?:\*\*?\/?)+(?:\*(?:\.\*)?)?$/;
const NARROW_EXTENSION_REGEX = /^\*\*\/\*\.\w+$/;

export function normalizeRootPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '');
}

export function getExemptRootsForPolicy(policy: string, paths: AuditEngineConfig['paths']): readonly string[] {
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

export function filterOutExemptRoots(roots: readonly string[], exemptRoots: readonly string[]): string[] {
  const exemptSet = new Set(exemptRoots.map(normalizeRootPath));
  return roots.filter(r => !exemptSet.has(normalizeRootPath(r)));
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
export function assertNarrowCoverageGlob(field: string, rawGlob: string, protectedRoots: readonly string[]): void {
  const glob = (rawGlob ?? '').trim();
  if (isBlanketCoverageGlob(glob)) {
    throw new Error(
      `[AuditConfig Anti-Abuse] '${field}' contiene un glob global o inválido: '${rawGlob}'. ` +
      `Usa globs POSIX relativos y acotados (ej: 'dist/**', 'LICENSE').`
    );
  }
  for (const root of protectedRoots) {
    const cleanRoot = normalizeRootPath(root);
    if (!cleanRoot) continue;
    if (glob === cleanRoot || new RegExp(`^${RegExp.escape(cleanRoot)}/(?:\\*\\*/?)*\\*?(?:\\.\\*|\\.\\w+)?$`).test(glob)) {
      throw new Error(
        `[AuditConfig Anti-Abuse] '${field}' no puede eximir una raíz de código completa ('${rawGlob}' cubre '${cleanRoot}').`
      );
    }
  }
}

export function assertCoverageReason(field: string, glob: string, reason: string | undefined): void {
  if (typeof reason !== 'string' || reason.trim().length < MIN_COVERAGE_REASON_LENGTH) {
    throw new Error(
      `[AuditConfig Anti-Abuse] '${field}' para '${glob}' requiere un 'reason' de al menos ${MIN_COVERAGE_REASON_LENGTH} caracteres.`
    );
  }
}

function isUniversalWildcard(glob: string): boolean {
  return BLOCKED_WILDCARD_LITERALS.some(literal => literal === glob) || BLOCKED_WILDCARD_PATTERNS.some(re => re.test(glob));
}

function isProtectedProductionRoot(normalizedLower: string, prodRoot: string): boolean {
  return (
    normalizedLower === prodRoot ||
    normalizedLower.startsWith(`${prodRoot}/`) ||
    normalizedLower.includes(`/${prodRoot}/`) ||
    normalizedLower.startsWith(`**/${prodRoot}`)
  );
}

function assertNoUniversalWildcard(rawGlob: string, glob: string): void {
  if (isUniversalWildcard(glob)) {
    throw new Error(
      `[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contiene un comodín global no permitido: '${rawGlob}'.\n` +
      `Está ESTRICTAMENTE PROHIBIDO usar comodines globales ('*', '**', 'src/**', 'scripts/**') para evadir el mandato de números mágicos.`
    );
  }
}

function assertNoProtectedProductionRoots(rawGlob: string, normalizedLower: string): void {
  for (const prodRoot of FORBIDDEN_PRODUCTION_ROOTS) {
    if (isProtectedProductionRoot(normalizedLower, prodRoot)) {
      throw new Error(
        `[AuditConfig Anti-Abuse] 'constants.exemptGlobs' contiene una ruta de lógica de producción protegida: '${rawGlob}'.\n` +
        `Está ESTRICTAMENTE PROHIBIDO eximir directorios de producción (como '${prodRoot}').\n` +
        `Las excepciones de números mágicos solo están permitidas para scripts de semillas, fixtures o demostraciones aisladas (ej: 'scripts/database/seeds/**', 'ui-demo/**').`
      );
    }
  }
}

export function validateConstantsExemptGlobs(globs: readonly string[]): void {
  if (globs.length > MAX_CONSTANTS_EXEMPT_GLOBS) {
    throw new Error(
      `[AuditConfig Anti-Abuse] 'constants.exemptGlobs' excede el límite máximo de ${MAX_CONSTANTS_EXEMPT_GLOBS} patrones (${globs.length} configurados).\n` +
      `No abuses de las excepciones. Si tienes tantas incidencias, extrae constantes nominadas descriptivas o usa fábricas de prueba.`
    );
  }

  for (const rawGlob of globs) {
    const glob = rawGlob.trim().replace(/\\/g, '/');
    assertNoUniversalWildcard(rawGlob, glob);
    const normalizedLower = glob.toLowerCase().replace(/^\/+/, ''); // no-domain: Non-domain utility collection or data structure
    assertNoProtectedProductionRoots(rawGlob, normalizedLower);
  }
}
