/**
 * scripts/validation/validate_domain_types.ts
 *
 * DOMAIN TYPE AUDIT (Node.js 26+ Native)
 * Detects finite-domain values declared with loose runtime structures or
 * broad string types instead of strict TypeScript domain contracts.
 *
 * Detects these anti-patterns:
 *   1. new Set<string>(...) / new Set([...]) used for finite domains.
 *   2. new Map<string, ...>(...) / new Map([[literal, ...]]) for domain maps.
 *   3. String literal arrays without `as const`.
 *   4. `string[]`, `Array<string>`, or `ReadonlyArray<string>` domain constants.
 *   5. `type X = string` aliases and enum-like unions ending in `| string`.
 *   6. `Record<string, ...>`, `Record<PropertyKey, ...>`, and `[key: string]`
 *      in type/data contracts.
 *   7. Contract fields declared as raw `string` in type/data files.
 *   8. Ambiguous unions mixing empty-string sentinels with null/undefined.
 *
 * Usage:
 *   npm run validate:domain-types
 *   npm run validate:domain-types:summary
 *   npm run validate:domain-types:report
 */

import fs from 'node:fs/promises';
import { enableCompileCache } from 'node:module';
import path from 'node:path';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

// ─── Config ──────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const EXTENSIONS = new Set(['.ts', '.vue']); // runtime-set: Fast O(1) membership lookup set
export const DEFAULT_TEST_PATH_MARKERS = ['.test.', '.spec.'] as const;
const ESCAPE_HATCHES = ['domain-ok', 'string-ok', 'open-record', 'runtime-set', 'runtime-map', 'no-domain', 'lib-duplicate-ok', 'result-ok'] as const;

// ─── Patterns ────────────────────────────────────────────────────────────────
const P_SET_STRING = /\bnew\s+Set\s*(?:<[^>]+>)?\s*\(\s*\[\s*['"`]/g;
const P_MAP_STRING = /\bnew\s+Map\s*(?:<[^>]+>)?\s*\(\s*\[\s*\[\s*['"`]/g;
const P_LITERAL_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*(?::\s*(?:readonly\s+)?(?:string\[\]|Array\s*<\s*string\s*>|ReadonlyArray\s*<\s*string\s*>))?\s*=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
const P_TYPED_STRING_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*:\s*(?:readonly\s+)?(?:string\[\]|Array\s*<\s*string\s*>|ReadonlyArray\s*<\s*string\s*>)/g;
const P_TYPE_ALIAS_STRING = /\b(?:export\s+)?type\s+\w+\s*=\s*string\s*;/g;
const P_REDUNDANT_TYPE_ALIAS = /\b(?:export\s+)?type\s+([A-Z_a-z]\w*)\s*=\s*([A-Z_a-z]\w*)\s*;/g;
const P_REDUNDANT_VALUE_ALIAS = /^\s*export\s+const\s+([A-Z_a-z]\w*)\s*=\s*([A-Z_a-z]\w*)\s*;/gm;
const P_BOOLEAN_LITERAL_TYPE_ANNOTATION = /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm;
const P_STRING_SINK_UNION = /\b(?:export\s+)?type\s+\w+\s*=\s*(?=[^;\n]*['"`][^'"`]+['"`])[^;\n]*\|\s*string\s*;/g;
const P_FIELD_WILDCARD_STRING_UNION = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:\s*(?!\s*string\s*(?:\[\])?\s*[;,]?)[^;\n]*\|\s*string\b[^;\n]*[;,]?/gm;
const P_OPEN_STRING_INTERSECTION = /\b(?:export\s+)?type\s+\w+\s*=[^;\n]*string\s*&\s*\{\s*\}[^;\n]*;/g;
const P_RECORD_STRING_KEY = /\bRecord\s*<\s*string\s*,/g;
const P_RECORD_PROPERTY_KEY = /\bRecord\s*<\s*PropertyKey\s*,/g;
const P_INDEX_SIGNATURE = /\[\s*\w+\s*:\s*string\s*\]\s*:/g;
const P_DOMAIN_STRING_FIELD = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:\s*string(?:\[\])?\s*[;,]?/gm;
const P_AMBIGUOUS_EMPTY_NULL_TYPE_ALIAS = /^\s*(?:export\s+)?type\s+\w+\s*=[^;\n]*(?:''|""|``)[^;\n]*\|\s*(?:null|undefined)[^;\n]*;|^\s*(?:export\s+)?type\s+\w+\s*=[^;\n]*(?:null|undefined)[^;\n]*\|\s*(?:''|""|``)[^;\n]*;/gm;
const P_AMBIGUOUS_EMPTY_NULL_FIELD = /^\s*(?:readonly\s+)?\w+\??:\s*[^;\n]*(?:''|""|``)[^;\n]*\|\s*(?:null|undefined)[^;\n]*[;,]?|^\s*(?:readonly\s+)?\w+\??:\s*[^;\n]*(?:null|undefined)[^;\n]*\|\s*(?:''|""|``)[^;\n]*[;,]?/gm;
const P_RUNTIME_CASE_NORMALIZATION = /\b\w+\.(?:toLowerCase|toUpperCase)\s*\(\s*\)\s*(?:as\s+\w+|satisfies\s+\w+)?/g;
const P_TYPECAST_UNKNOWN = /\bas\s+unknown\s+as\b/g;
const P_TYPECAST_INLINE_ANY = /\bas\s+any\b/g;
const P_TYPECAST_READONLY_STRING_ARRAY = /\bas\s+(?:readonly\s+)?string\[\]/g;
const P_TYPECAST_INLINE_DOMAIN_ID = /\bas\s+(?:[A-Z]\w*Id|keyof\s+typeof\s+[A-Z_a-z]\w*)\b/g;
const P_TYPECAST_RECORD_STRING = /\bas\s+Record\s*<\s*string\s*,/g;
const P_TYPECAST_ARRAY_ANY_UNKNOWN = /\bas\s+(?:any|unknown)\[\]/g;
const P_OBJECT_KEYS_CAST = /\bObject\.(?:keys|entries)\s*\([^)]+\)\s+as\s+(?:\([|\w\s]+\)|[A-Za-z]\w*)\[\]/g;

// Java-Style & Phase 2/3 Advanced Strict Typing Patterns
const P_INLINE_ANONYMOUS_OBJECT_PARAM = /\(\s*(?:[A-Z_a-z]\w*\s*,\s*)*[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*(?:;|,)\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g;
const P_UNNAMED_POSITIONAL_TUPLE_RETURN = /\breturn\s*\[\s*[A-Z_a-z]\w*(?:\.[A-Z_a-z]\w*)*\s*,\s*[A-Z_a-z]\w*(?:\.[A-Z_a-z]\w*)*\s*\]\s*;/g;
const P_UNBRANDED_DOMAIN_ID_ALIAS = /\b(?:export\s+)?type\s+[A-Z]\w*Id\s*=\s*string\s*;/g;
const P_UNENFORCED_STATIC_MAP = /\bexport\s+const\s+[A-Z][A-Z0-9_]{3,}\s*=\s*\{/g;
const P_FLOATING_PROMISE = /^\s*(?!(?:await|void|return|const|let|var)\s+)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm;
const P_LEAKED_GLOBAL_MUTABLE = /^(?:export\s+)?let\s+[a-z]\w*\s*=/gm;
const P_DYNAMIC_IMPORT_IN_HOT_PATH = /\b(?:for|while)\s*\([^)]*\)\s*\{[^}]*?\bimport\s*\(/g;
const P_PARAM_WILDCARD_STRING_UNION = /\b([A-Za-z0-9_]{2,}[iI]d)\s*\??:\s*(?:[A-Z]\w*Id|[A-Z]\w*)\s*\|\s*string\b/g;
const P_PARAM_DOMAIN_ID_NULLABLE = /\b([A-Za-z0-9_]{2,}[iI]d)\s*:\s*(?:[A-Z]\w*Id)\s*\|\s*(?:null|undefined)\b|\b([A-Za-z0-9_]{2,}[iI]d)\s*:\s*(?:null|undefined)\s*\|\s*(?:[A-Z]\w*Id)\b/g;
const P_DOMAIN_TYPE_NULLABLE = /\b(?:export\s+)?type\s+[A-Z]\w*Id\s*=[^;\n]*\|\s*(?:null|undefined)\b/g;
const P_DOUBLE_CAST_DOMAIN_ID = /\bas\s+(?:unknown|any)\s+as\s+[A-Z]\w*Id\b/g;
const BASE_UNKNOWN_PARAM_TERMS = [
  'client', 'user', 'customer', 'status', 'category', 'mode', 'kind', 'type', 'period'
] as const;

function getParamUnknownOrAnyRegex(): RegExp {
  const config = getAuditConfig();
  const domainStems = (config.domain.finiteDomainTypes ?? [])
    .map(t => t.replace(/(?:Id|Type|Status|Category|Mode|Kind|Tier|Phase|Key)$/, '').toLowerCase())
    .filter(t => t.length >= 3);
  const terms = Array.from(new Set([...BASE_UNKNOWN_PARAM_TERMS, ...domainStems]));
  return new RegExp(`\\b(${terms.join('|')})\\s*:\\s*(?:unknown|any)\\s*(?:=[^,)]+)?(?=[,)])`, 'gi');
}
const P_DOMAIN_LITERAL_MIXED_UNION = /\b([A-Z]\w*(?:Id|Type|Status|Category|Tier|Phase|Key))\s*\|\s*['"`][^'"`]+['"`]|['"`][^'"`]+['"`]\s*\|\s*([A-Z]\w*(?:Id|Type|Status|Category|Tier|Phase|Key))\b/g;

// ─── Types ───────────────────────────────────────────────────────────────────
export type FindingSeverity = 'ERROR' | 'WARN';

export interface Finding {
  file: string;
  line: number;
  col: number;
  pattern: string;
  snippet: string;
  severity: FindingSeverity;
}

type MatchFilter = (match: RegExpExecArray, line: string, file: string) => boolean;
type SeverityPicker = (match: RegExpExecArray, line: string, file: string) => FindingSeverity;

function toRepoPath(filePath: string): string {
  return path.relative(ROOT, filePath).split(path.sep).join(path.posix.sep);
}

function hasEscapeHatch(line: string): boolean {
  return ESCAPE_HATCHES.some(hatch => new RegExp(`//\\s*${hatch}:\\s*\\S+`).test(line));
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isTestFile(file: string): boolean {
  const config = getAuditConfig();
  if (config.paths.includeTestsInCodeAudit) return false;
  if (DEFAULT_TEST_PATH_MARKERS.some(marker => file.includes(marker))) return true;
  const testRoots = [
    ...(config.paths.testRoots ?? ['tests']),
    ...(config.paths.e2eRoots ?? ['tests/e2e']),
    ...(config.paths.integrationRoots ?? [])
  ].map(r => r.replace(/^\.?\//, '').replace(/\/+$/, '') + '/');
  return testRoots.some(r => file.includes(r));
}

function isContractFile(file: string): boolean {
  const config = getAuditConfig();
  const contractRoots = [
    ...(config.paths.typesRoots ?? ['src/types']),
    ...(config.paths.dataRoots ?? ['src/data'])
  ];
  return contractRoots.some(r => file.includes(r.replace(/^\.?\//, ''))) || file.includes('/types/') || file.includes('/data/') || file.endsWith('.d.ts');
}

function isAmbientDeclarationFile(file: string): boolean {
  return file.endsWith('.d.ts');
}

function isOpenUnknownDictionary(line: string): boolean {
  return /Record\s*<\s*string\s*,\s*unknown\s*>|\[\s*\w+\s*:\s*string\s*\]\s*:\s*unknown/.test(line);
}

function findMatches(
  content: string,
  file: string,
  pattern: RegExp,
  label: string,
  severity: Finding['severity'] | SeverityPicker,
  filter?: MatchFilter,
  overrideEscapeHatch?: boolean
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const leadingWs = match[0].match(/^\s*\n/)?.[0] ?? '';
    const matchStart = match.index + leadingWs.length;
    const before = content.slice(0, matchStart);
    const lineNum = (before.match(/\n/g) ?? []).length + 1;
    const lastNl = before.lastIndexOf('\n');
    const col = matchStart - lastNl;
    const line = lines[lineNum - 1] ?? '';

    if (isCommentLine(line) || isTestFile(file) || (!overrideEscapeHatch && hasEscapeHatch(line))) continue;
    if (filter && !filter(match, line, file)) continue;

    findings.push({
      file,
      line: lineNum,
      col,
      pattern: label,
      snippet: match[0].slice(0, 100).replace(/\n/g, '↵'),
      severity: typeof severity === 'function' ? severity(match, line, file) : severity,
    });
  }

  return findings;
}

export async function auditFile(filePath: string): Promise<Finding[]> {
  const content = await fs.readFile(filePath, 'utf8');
  const rel = toRepoPath(filePath);
  if (rel.endsWith('validate_domain_types.ts')) return [];
  const findings: Finding[] = [];

  findings.push(...findMatches(
    content,
    rel,
    P_SET_STRING,
    'Set used as finite-domain storage/validator (use `as const` array + derived type)',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_MAP_STRING,
    'Map with string/domain keys used as finite-domain map (use typed object/Record with union keys)',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_LITERAL_ARRAY_DECL,
    'String literal array without `as const` — potential untyped domain (MUST use `as const satisfies readonly DomainType[]` or mark `// no-domain: Non-domain utility collection or data structure`)',
    'ERROR',
    (match, line) => {
      if (match[0].includes('as const')) return false;
      const trimmed = line.trim();
      // Filter out report/log/text buffers and class names
      return !/const\s+(?:report|candidates|lines|parts|chunks|words|tokens|classes|errors|warnings|achievements|logs|results|missing|args|flags|files|entries|rows|queries|messages|diffs|patterns|findings|details)\s*=/i.test(trimmed);
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPED_STRING_ARRAY_DECL,
    'String array type annotation erases finite domain values (MUST use `as const` or specific domain array type)',
    'ERROR',
    (_match, line) => {
      const trimmed = line.trim();
      return !/const\s+(?:lines|parts|chunks|words|tokens|report|candidates|errors|warnings|achievements|logs|results|missing|args|flags|files|entries|rows|queries|messages|diffs|patterns|findings|details)\s*:\s*(?:readonly\s+)?string\[\]/i.test(trimmed);
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPE_ALIAS_STRING,
    'Type alias directly to `string` — defeats domain enforcement',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_BOOLEAN_LITERAL_TYPE_ANNOTATION,
    'Literal boolean type annotation (true/false) used instead of boolean type contract (MUST use `: boolean`)',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_REDUNDANT_TYPE_ALIAS,
    'Redundant 1:1 type redefinition — use the canonical source type directly at usage sites instead of declaring passthrough aliases',
    'ERROR',
    (match, line) => {
      if (line.includes('// string-ok: Internal string formatting or DOM token identifier') || line.includes('// domain-ok: Open dynamic text or non-domain string payload') || line.includes('// type-ok: Type contract declaration')) return false;
      const aliasName = match[1];
      const targetName = match[2];
      if (aliasName === targetName) return false;
      const primitives = ['string', 'number', 'boolean', 'unknown', 'any', 'void', 'never', 'null', 'undefined', 'symbol', 'bigint'];
      if (targetName && primitives.includes(targetName)) return false;
      return true;
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_REDUNDANT_VALUE_ALIAS,
    'Redundant 1:1 value/function redefinition — use the canonical source value directly at usage sites instead of declaring passthrough aliases',
    'ERROR',
    (match, line) => {
      if (line.includes('// value-ok: Canonical constant value reference') || line.includes('// domain-ok: Open dynamic text or non-domain string payload') || line.includes('// const-ok: Constant declaration')) return false;
      const aliasName = match[1];
      const targetName = match[2];
      if (!aliasName || !targetName || aliasName === targetName) return false;
      if (/^(?:true|false|null|undefined|NaN|Infinity|\d+)$/.test(targetName)) return false;
      const defaultIgnored = ['dbJson', 'metadataJson', 'rawJson', 'db'];
      const whitelist = getAuditConfig().domain.infraIdWhitelist ?? [];
      if (defaultIgnored.includes(targetName) || targetName.endsWith('Json') || whitelist.includes(targetName)) return false;
      return true;
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_STRING_SINK_UNION,
    'Enum-like union ends with `| string` — compiler cannot reject invalid domain values',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_FIELD_WILDCARD_STRING_UNION,
    'Strict domain type combined with `| string` wildcard union — erases compile-time type safety',
    'ERROR',
    (_match, _line, file) => isContractFile(file) && !isAmbientDeclarationFile(file),
    true // overrideEscapeHatch: ignore // domain-ok: Open dynamic text or non-domain string payload if line contains a wildcard union
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_PARAM_WILDCARD_STRING_UNION,
    'Domain parameter combined with `| string` wildcard union — erases compile-time type safety. Use pure canonical domain type exclusively.',
    'ERROR',
    (_match, _line, file) => !isAmbientDeclarationFile(file) && !isTestFile(file),
    true // overrideEscapeHatch: escape hatches are strictly forbidden from bypassing | string
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_PARAM_DOMAIN_ID_NULLABLE,
    'Domain parameter combined with `| null` or `| undefined` in calculation/handling function — functions must require pure DomainId (guard preconditions at call-site).',
    'ERROR',
    (_match, line, file) => {
      if (isAmbientDeclarationFile(file) || isTestFile(file)) return false;
      if (line.includes('// state-ok: State setter allows clearing domain reference') || line.includes('// domain-ok: Open dynamic text or non-domain string payload')) return false;
      // Exclude interface/type object properties (which legitimately hold nullable state)
      if (line.trim().endsWith(';') && !line.includes('(') && !line.includes('=>') && !line.includes('function')) return false;
      // Allow store state setters (e.g., set*, update*, clear* actions in stores)
      const allowedSetters = getAuditConfig().domain?.allowedStoreSetterPrefixes ?? ['set', 'update', 'clear'];
      const setterRegex = new RegExp(`\\b(?:${allowedSetters.join('|')})[A-Z]\\w*\\b`);
      if (setterRegex.test(line)) return false;
      return true;
    },
    true
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_DOMAIN_TYPE_NULLABLE,
    'Domain type union definition contains `null` or `undefined` — domain types MUST be pure entities (optionality belongs to fields/state, not the domain type).',
    'ERROR',
    (_match, _line, file) => !isAmbientDeclarationFile(file)
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_DOUBLE_CAST_DOMAIN_ID,
    'Double-cast assertion to DomainId (`as unknown as DomainId` / `as any as DomainId`) erases type safety — use boundary guard `isDomainId()` or `requireDomainId()`.',
    'ERROR',
    (_match, _line, file) => !isTestFile(file) && !isAmbientDeclarationFile(file)
  ));

  findings.push(...findMatches(
    content,
    rel,
    getParamUnknownOrAnyRegex(),
    'Function parameter typed as `unknown` or `any` in business logic — use strong domain type or encapsulate within dedicated boundary parsers (parse*/is*/validate*).',
    'ERROR',
    (_match, line, file) => {
      if (isTestFile(file) || isAmbientDeclarationFile(file)) return false;
      if (line.includes('// boundary-ok: External runtime boundary deserializer') || line.includes('// parser-ok: Boundary input sanitizer') || line.includes('// domain-ok: Open dynamic text or non-domain string payload')) return false;
      // Allow type predicates (`: val is Type`)
      if (/\s+is\s+[A-Z]/.test(line)) return false;
      // Allow error parameters (e.g. `error: unknown`, `err: unknown`)
      if (/\b(?:err|error|exception|e)\s*:\s*(?:unknown|any)\b/.test(line)) return false;
      // Allow schemas and boundary validation files
      if (file.includes('schemas') || file.includes('validation') || file.includes('logger') || file.includes('types/')) return false;
      // Allow boundary parsers, type-guards, assertions
      if (/\b(?:catch|parse|is[A-Z]\w*|validate|assert|safe|sanitize|toID|deserialize|normalize|fromJSON|fromRaw|toDomain|wrapper|formatDate|formatTime)\b/i.test(line)) return false;
      return true;
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_DOMAIN_LITERAL_MIXED_UNION,
    'Mixed domain union: Combining a canonical Domain Type with raw string literals is forbidden. Include the literal in the canonical domain list or use the pure Domain Type directly.',
    'ERROR',
    (_match, line, file) => {
      if (isTestFile(file) || isAmbientDeclarationFile(file)) return false;
      if (line.includes('// domain-ok: Open dynamic text or non-domain string payload')) return false;
      return true;
    },
    true
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_OPEN_STRING_INTERSECTION,
    'Open `string & {}` intersection keeps a domain effectively unbounded',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_RUNTIME_CASE_NORMALIZATION,
    'Runtime string case normalization (toLowerCase/toUpperCase) inside domain code — use strict typed domain values directly without string transformations',
    'ERROR',
    (_match, line) => {
      if (line.includes('// text-ok: UI text display localization string') || line.includes('// no-domain: Non-domain utility collection or data structure') || line.includes('// domain-ok: Open dynamic text or non-domain string payload')) return false;
      // Filter out case-insensitive user search / filtering comparisons (e.g. name.toLowerCase().includes(search.toLowerCase()))
      if (/\.(?:includes|startsWith|endsWith|indexOf)\s*\(/.test(line) || /\b(?:search|query|filter|input)\b/i.test(line)) return false;
      // Filter out template literals used for UI formatting (`${...toUpperCase()}`)
      if (/`[^`]*\$\{[^}]*\.(?:toLowerCase|toUpperCase)\(\)\}[^`]*`/.test(line)) return false;
      // Filter out UI presentation variables and configured exempt tokens
      const config = getAuditConfig();
      const baseUiTokens = ['title', 'label', 'name', 'text', 'description', 'message', 'query', 'search', 'input', 'key', 'status', 'value', 'clean', 'to', 'current'];
      const customTokens = config.domain?.caseNormalizationExemptTokens ?? [];
      const exemptTokens = Array.from(new Set([...baseUiTokens, ...customTokens]));
      const exemptRegex = new RegExp(`\\b(?:${exemptTokens.join('|')})\\.(?:toLowerCase|toUpperCase)\\(\\)`);
      if (exemptRegex.test(line)) return false;
      return true;
    }
  ));

  if (isContractFile(rel)) {
    findings.push(...findMatches(
      content,
      rel,
      P_RECORD_STRING_KEY,
      'Record<string, ...> in type/data contract — use a finite union key when the domain is known',
      (_match, line, file) => (isOpenUnknownDictionary(line) || isAmbientDeclarationFile(file)
        ? 'WARN'
        : 'ERROR')
    ));

    findings.push(...findMatches(
      content,
      rel,
      P_INDEX_SIGNATURE,
      'Open string index signature in type/data contract — use explicit domain keys or a boundary adapter',
      (_match, line, file) => (isOpenUnknownDictionary(line) || isAmbientDeclarationFile(file) ? 'WARN' : 'ERROR')
    ));

    findings.push(...findMatches(
      content,
      rel,
      P_RECORD_PROPERTY_KEY,
      'Record<PropertyKey, ...> in type/data contract is an open keyspace — use a finite union key',
      'ERROR'
    ));
  }

  findings.push(...findMatches(
    content,
    rel,
    P_DOMAIN_STRING_FIELD,
    'Raw `string` field in type/data contract — use a strict domain type or mark truly open text (`// domain-ok: Open dynamic text or non-domain string payload` if genuinely open text)',
    'ERROR',
    (_match, _line, file) => isContractFile(file) && !isAmbientDeclarationFile(file)
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_AMBIGUOUS_EMPTY_NULL_TYPE_ALIAS,
    'Ambiguous type alias mixes empty-string sentinel with null/undefined',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_AMBIGUOUS_EMPTY_NULL_FIELD,
    'Ambiguous field type mixes empty-string sentinel with null/undefined',
    'ERROR',
    (_match, _line, file) => isContractFile(file)
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPECAST_UNKNOWN,
    'Double type assertion (`as unknown` + `as T`) used to bypass domain contracts — use typed boundary guards or Window augmentations',
    'ERROR'
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPECAST_INLINE_ANY,
    'Type assertion `as any` used to bypass TypeScript checks — strictly forbidden by Zero-Any policy',
    'ERROR',
    (_match, line) => !line.includes('// any-ok: External third-party untyped boundary payload') && !line.includes('eslint-disable')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPECAST_READONLY_STRING_ARRAY,
    'Type assertion `as readonly string[]` or `as string[]` used to bypass tuple domain inclusion check — use strict domain type parameter or `isDomainId` guard', // no-domain: Non-domain utility collection or data structure
    'ERROR',
    (_match, line, _file) => {
      if (line.includes('// domain-ok: Open dynamic text or non-domain string payload') || line.includes('// no-domain: Non-domain utility collection or data structure')) return false;
      return !/\bfunction\s+is[A-Z_a-z]\w*/.test(line) && !/\bis[A-Z_a-z]\w*\s*=\s*/.test(line);
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPECAST_INLINE_DOMAIN_ID,
    'Inline type assertion `as DomainId` used to force dynamic string into domain type — use boundary guard `isDomainId()` or `requireDomainId()`',
    'ERROR',
    (_match, line) => !/\bfunction\s+(?:is|require)[A-Z_a-z]\w*/.test(line) && !/\bis[A-Z_a-z]\w*\s*=\s*/.test(line) && !line.includes('// domain-ok: Open dynamic text or non-domain string payload')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPECAST_RECORD_STRING,
    'Type assertion `as Record<string, ...>` used to bypass strict domain map keys — use typed boundary guard', // open-record: Generic key-value data dictionary container
    'ERROR',
    (_match, line) => !line.includes('// open-record: Generic key-value data dictionary container') && !line.includes('// no-domain: Non-domain utility collection or data structure')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_TYPECAST_ARRAY_ANY_UNKNOWN,
    'Type assertion `as any[]` or `as unknown[]` erases element domain types — define explicit interface or discriminated union',
    'ERROR',
    (_match, line) => !line.includes('// any-ok: External third-party untyped boundary payload') && !line.includes('// no-domain: Non-domain utility collection or data structure')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_OBJECT_KEYS_CAST,
    'Type assertion on `Object.keys(...)` or `Object.entries(...)` to `as DomainId[]` — use typed helper or `isDomainId` filtering',
    'ERROR',
    (_match, line) => !/\bfunction\s+is[A-Z_a-z]\w*/.test(line) && !line.includes('// domain-ok: Open dynamic text or non-domain string payload')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_INLINE_ANONYMOUS_OBJECT_PARAM,
    'Inline anonymous object type in function parameter prohibited — define a named interface or type contract',
    'ERROR',
    (_match, line) => !line.includes('// type-ok: Type contract declaration') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload') && !line.includes('withDefaults')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_UNNAMED_POSITIONAL_TUPLE_RETURN,
    'Positional array return without tuple type annotation — declare explicit tuple return type `: readonly [T1, T2]` or `as const`',
    'WARN',
    (_match, line) => !line.includes('// type-ok: Type contract declaration') && !line.includes('as const')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_UNBRANDED_DOMAIN_ID_ALIAS,
    'Unbranded domain ID alias detected — domain IDs should consume Brand<string, "IdName"> for nominal compile-time safety',
    'WARN',
    (_match, line) => !line.includes('// brand-ok: Domain branded primitive type') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload') && !line.includes('string-ok')
  ));


  findings.push(...findMatches(
    content,
    rel,
    P_UNENFORCED_STATIC_MAP,
    'Static domain map declared without explicit Record<DomainId, T> annotation — consider enforcing domain key exhaustiveness',
    'WARN',
    (_match, line) => {
      const constNameMatch = line.match(/export\s+const\s+([A-Z][A-Z0-9_]+)/);
      const constName = constNameMatch ? constNameMatch[1] : '';
      const derivesDomainType = constName ? new RegExp(`export\\s+type\\s+[A-Z]\\w*\\s*=\\s*(?:keyof\\s+typeof|typeof|\\(typeof)\\s+${constName}`).test(content) : false;
      const hasSatisfies = constName ? new RegExp(`\\b${constName}\\s*=[\\s\\S]*?\\}\\s*(?:as\\s+const\\s+)?satisfies\\s+Record<`).test(content) : false;
      const hasAsConst = constName ? new RegExp(`\\b${constName}\\s*=[\\s\\S]*?\\}\\s*as\\s+const;`).test(content) : false;
      return !line.includes('Record<') && !line.includes('satisfies') && !hasSatisfies && !derivesDomainType && !hasAsConst && !rel.includes('constants/') && !line.includes('// map-ok: Dictionary map structure') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload');
    }
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_FLOATING_PROMISE,
    'Floating promise detected — async call must be handled with await, void, or .catch()',
    'WARN',
    (_match, line) => !line.includes('// promise-ok: Background promise handler') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_LEAKED_GLOBAL_MUTABLE,
    'Mutable top-level let variable at module scope detected — move state inside Pinia store, class, or mark // singleton-ok: Singleton instance state container',
    'WARN',
    (_match, line) => !line.includes('// singleton-ok: Singleton instance state container') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload') && !rel.includes('stores/') && !rel.includes('data/')
  ));

  findings.push(...findMatches(
    content,
    rel,
    P_DYNAMIC_IMPORT_IN_HOT_PATH,
    'Dynamic import() inside loop detected — pre-import modules at file scope to avoid execution jank',
    'WARN',
    (_match, line) => !line.includes('// import-ok: Dynamic module import') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload')
  ));

  if (rel.endsWith('.vue')) {
    const scriptSetupMatch = /<script\s+setup[^>]*>([\s\S]*?)<\/script>/i.exec(content);
    if (scriptSetupMatch && typeof scriptSetupMatch[1] === 'string') {
      const scriptContent = scriptSetupMatch[1];
      const scriptStartIndex = scriptSetupMatch.index + scriptSetupMatch[0].indexOf(scriptContent);
      const beforeLines = content.slice(0, scriptStartIndex).split('\n');
      const baseLineNumber = beforeLines.length;
      const lines = scriptContent.split('\n');
      lines.forEach((line, idx) => {
        if (/^\s*export\s+(?:const|type|interface|function|let|var|class|enum)\b/.test(line)) {
          findings.push({
            file: rel,
            line: baseLineNumber + idx,
            col: 1,
            pattern: '`<script setup>` cannot contain ES module exports — extract shared contracts to a dedicated .ts module or un-export local types',
            severity: 'ERROR',
            snippet: line.trim()
          });
        }
      });
    }
  }

  return findings;
}

function getMatchCoordinates(content: string, matchIndex: number, lines: string[]): { lineNum: number; col: number; line: string } {
  const before = content.slice(0, matchIndex);
  const lineNum = (before.match(/\n/g) ?? []).length + 1;
  const lastNl = before.lastIndexOf('\n');
  const col = matchIndex - lastNl;
  const line = lines[lineNum - 1] ?? '';
  return { lineNum, col, line };
}

function extractSortedLiterals(matchStr: string): string[] | null {
  const rawLiterals = matchStr.match(/['"`][a-zA-Z0-9_-]+['"`]/g);
  if (!rawLiterals || rawLiterals.length < 2) return null;
  const literals = Array.from(new Set(rawLiterals.map(l => l.replace(/['"`]/g, '')))).sort();
  if (literals.length < 2) return null;
  return literals;
}

function extractSortedLiteralsSignature(matchStr: string): string | null {
  const literals = extractSortedLiterals(matchStr);
  return literals ? literals.join('|') : null;
}

function collectFileStringUnions(
  file: string,
  content: string,
  unionRegex: RegExp,
  unionOccurrences: Map<string, Finding[]>
): void {
  const lines = content.split('\n');
  unionRegex.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = unionRegex.exec(content)) !== null) {
    const { lineNum, col, line } = getMatchCoordinates(content, match.index, lines);
    if (isCommentLine(line) || isTestFile(file) || hasEscapeHatch(line)) continue;

    const signatureKey = extractSortedLiteralsSignature(match[0]);
    if (!signatureKey) continue;

    const finding: Finding = {
      file,
      line: lineNum,
      col,
      pattern: `Repeated ad-hoc string literal union '${signatureKey}' — refactor into canonical domain type alias`,
      snippet: match[0].slice(0, 100).replace(/\n/g, '↵'),
      severity: 'ERROR',
    };

    const existing = unionOccurrences.get(signatureKey);
    if (existing) existing.push(finding);
    else unionOccurrences.set(signatureKey, [finding]);
  }
}

export function detectRepeatedStringUnions(
  files: Array<{ file: string; content: string }>
): Map<string, Finding[]> {
  const P_GENERIC_STRING_UNION = /\b(?:as\s+|:\s*|\btype\s+[A-Za-z]\w*\s*=\s*)\(?(?:\s*['"`][a-zA-Z0-9_-]+['"`]\s*\|)+\s*['"`][a-zA-Z0-9_-]+['"`]\)?/g;
  const unionOccurrences = new Map<string, Finding[]>();

  for (const { file, content } of files) {
    collectFileStringUnions(file, content, P_GENERIC_STRING_UNION, unionOccurrences);
  }

  const repeatedMap = new Map<string, Finding[]>();
  for (const [signatureKey, occurrences] of unionOccurrences) {
    if (occurrences.length >= 2) {
      repeatedMap.set(signatureKey, occurrences);
    }
  }

  return repeatedMap;
}

export interface LibraryDomainTypeInfo {
  typeName: string;
  pkgName: string;
  signature: string;
}

function parseExportedTypeUnions(
  content: string,
  dep: string,
  regex: RegExp,
  libraryTypes: Map<string, LibraryDomainTypeInfo>
): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const typeName = match[1]!;
    const rawUnion = match[2]!;
    const rawLiterals = rawUnion.match(/['"][a-zA-Z0-9_-]+['"]/g);
    if (!rawLiterals) continue;
    const literals = Array.from(new Set(rawLiterals.map(l => l.replace(/['"]/g, '')))).sort();
    if (literals.length >= 2) {
      const sigKey = literals.join('|');
      if (!libraryTypes.has(sigKey)) {
        libraryTypes.set(sigKey, { typeName, pkgName: dep, signature: sigKey });
      }
    }
  }
}

export async function extractLibraryDomainTypes(
  root: string = ROOT
): Promise<Map<string, LibraryDomainTypeInfo>> {
  const libraryTypes = new Map<string, LibraryDomainTypeInfo>();
  const nodeModulesDir = path.join(root, 'node_modules');
  const pkgJsonPath = path.join(root, 'package.json');

  const P_EXPORT_TYPE_UNION = /export\s+type\s+([A-Za-z0-9_]+)\s*=\s*\(?((?:['"][a-zA-Z0-9_-]+['"]\s*\|\s*)+['"][a-zA-Z0-9_-]+['"])\)?/g;

  let pkgJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    const raw = await fs.readFile(pkgJsonPath, 'utf8');
    pkgJson = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  } catch {
    return libraryTypes;
  }

  const allDeps = Object.keys({ ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) });

  for (const dep of allDeps) {
    const depDir = path.join(nodeModulesDir, dep);
    try {
      await fs.access(depDir);
    } catch {
      continue;
    }

    async function walk(dir: string) {
      let entries: Array<{ name: string; isDirectory(): boolean }>;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        // catch-ok: unreadable dir
        return;
      }
      for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full);
        } else if (ent.name.endsWith('.d.ts')) {
          try {
            const content = await fs.readFile(full, 'utf8');
            parseExportedTypeUnions(content, dep, P_EXPORT_TYPE_UNION, libraryTypes);
          } catch {
            // catch-ok: unreadable file
          }
        }
      }
    }

    await walk(depDir);
  }

  return libraryTypes;
}

function forEachValidDomainMatch(
  content: string,
  regex: RegExp,
  lines: string[],
  callback: (match: RegExpExecArray, lineNum: number, col: number, line: string) => void
): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const { lineNum, col, line } = getMatchCoordinates(content, match.index, lines);
    if (isCommentLine(line) || hasEscapeHatch(line)) continue;
    callback(match, lineNum, col, line);
  }
}

/**
 * Detects local array or type definitions in src/ that duplicate library domain types.
 */
export function detectLibraryDomainTypeDuplicates(
  files: Array<{ file: string; content: string }>,
  libraryTypes: Map<string, LibraryDomainTypeInfo>
): Finding[] {
  const findings: Finding[] = [];
  if (libraryTypes.size === 0) return findings;

  const P_LITERAL_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*(?::\s*[^=]+)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
  const P_TYPE_UNION_DECL = /\b(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=\s*([^\n;]+(?:['"`][a-zA-Z0-9_-]+['"`]\s*\|\s*)+['"`][a-zA-Z0-9_-]+['"`][^\n;]*)/g;
  const P_PROP_UNION_DECL = /\b([A-Za-z0-9_]+)\??:\s*([^\n;{]+(?:['"`][a-zA-Z0-9_-]+['"`]\s*\|\s*)+['"`][a-zA-Z0-9_-]+['"`][^\n;]*)/g;

  const reportIfLibraryDuplicate = (
    sigKey: string | null,
    file: string,
    lineNum: number,
    col: number,
    snippet: string,
    messageBuilder: (libInfo: LibraryDomainTypeInfo) => string
  ) => {
    if (!sigKey) return;
    const libInfo = libraryTypes.get(sigKey);
    if (libInfo) {
      findings.push({
        file,
        line: lineNum,
        col,
        pattern: messageBuilder(libInfo),
        snippet: snippet.slice(0, 100).replace(/\n/g, '↵'),
        severity: 'ERROR'
      });
    }
  };

  for (const { file, content } of files) {
    if (isTestFile(file)) continue;
    const lines = content.split('\n');

    const scanDeclarations = (
      regex: RegExp,
      getSignatureTarget: (m: RegExpExecArray) => string,
      msgBuilder: (name: string, lib: LibraryDomainTypeInfo) => string,
      extraFilter?: (line: string) => boolean
    ) => {
      forEachValidDomainMatch(content, regex, lines, (match, lineNum, col, line) => {
        if (extraFilter && !extraFilter(line)) return;

        const sigKey = extractSortedLiteralsSignature(getSignatureTarget(match));
        reportIfLibraryDuplicate(
          sigKey,
          file,
          lineNum,
          col,
          match[0],
          (lib) => msgBuilder(match[1] ?? '', lib)
        );
      });
    };

    // 1. Array declarations with string literals
    scanDeclarations(
      P_LITERAL_ARRAY_DECL,
      (m) => m[0],
      (name, lib) => `Duplicate of library domain type: '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and use '${lib.typeName}' directly instead of reinventing it locally`
    );

    // 2. Type union declarations
    scanDeclarations(
      P_TYPE_UNION_DECL,
      (m) => m[2] ?? m[0],
      (name, lib) => `Duplicate of library domain type: type '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and alias '${lib.typeName}' directly instead of re-declaring its union`,
      (line) => !/\bkeyof\b/.test(line)
    );

    // 3. Property declarations in interfaces/types containing literal unions
    scanDeclarations(
      P_PROP_UNION_DECL,
      (m) => m[2] ?? '',
      (name, lib) => `Duplicate of library domain type: property '${name}' duplicates '${lib.typeName}' from '${lib.pkgName}' — import and use '${lib.typeName}' directly instead of re-declaring its union literals`
    );
  }

  return findings;
}

export interface CanonicalDomainInfo {
  name: string;
  file: string;
  line: number;
  col: number;
  signature: string;
  elements: Set<string>;
  literals: string[];
  isContract: boolean;
}

export const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH = 30 as const;

function extractValidDomainSignature(matchedSnippet: string): { literals: string[]; signature: string } | null {
  const literals = extractSortedLiterals(matchedSnippet);
  if (!literals || literals.length < 2) return null;
  if (literals.some(l => l.includes('/') || l.includes(' ') || l.length > MAX_CANONICAL_DOMAIN_LITERAL_LENGTH)) return null;
  return { literals, signature: literals.join('|') };
}

function createCanonicalDomainInfo(
  name: string,
  file: string,
  lineNum: number,
  col: number,
  signature: string,
  literals: string[],
  isContract: boolean
): CanonicalDomainInfo {
  return {
    name,
    file,
    line: lineNum,
    col,
    signature,
    elements: new Set(literals),
    literals,
    isContract,
  };
}

export function extractProjectCanonicalDomains(
  files: Array<{ file: string; content: string }>
): {
  bySignature: Map<string, CanonicalDomainInfo>;
  list: CanonicalDomainInfo[];
  collisions: Finding[];
} {
  const bySignature = new Map<string, CanonicalDomainInfo>();
  const list: CanonicalDomainInfo[] = [];
  const collisions: Finding[] = [];

  const P_CANONICAL_ARRAY = /\bexport\s+const\s+([A-Za-z0-9_]+)\s*(?::\s*[^=]+)?=\s*\[\s*['"`]([\s\S]*?)\]\s+as\s+const/g;
  const P_CANONICAL_TYPE = /\bexport\s+type\s+([A-Za-z0-9_]+)\s*=\s*\(?((?:['"`][a-zA-Z0-9_-]+['"`]\s*\|\s*)+['"`][a-zA-Z0-9_-]+['"`])\)?/g;

  // Prioritize files in typesRoots and dataRoots, then logicRoots
  const config = getAuditConfig();
  const typesRoots = config.paths.typesRoots ?? ['src/types'];
  const dataRoots = config.paths.dataRoots ?? ['src/data'];
  const logicRoots = config.paths.logicRoots ?? ['src/logic'];
  const srcRoots = config.paths.srcRoots ?? ['src'];

  const getFileScore = (file: string) => {
    if (typesRoots.some(r => file.startsWith(r))) return 3;
    if (dataRoots.some(r => file.startsWith(r))) return 2;
    if (logicRoots.some(r => file.startsWith(r))) return 1;
    return 0;
  };

  const sortedFiles = [...files].sort((a, b) => getFileScore(b.file) - getFileScore(a.file));

  for (const { file, content } of sortedFiles) {
    if (isTestFile(file) || file.endsWith('.d.ts') || !srcRoots.some(r => file.startsWith(r))) continue;
    const lines = content.split('\n');

    // 1. Exported array with as const
    forEachValidDomainMatch(content, P_CANONICAL_ARRAY, lines, (match, lineNum, col, line) => {
      const name = match[1]!;
      if (['ROUTES', 'CONFIG', 'ITEMS', 'OPTIONS', 'STYLES', 'THEMES', 'MODALS'].includes(name)) return;

      const domain = extractValidDomainSignature(match[0]);
      if (!domain) return;
      const { literals, signature } = domain;
      const isContract = isContractFile(file);

      const existing = bySignature.get(signature);
      if (existing) {
        if (existing.file !== file && !hasEscapeHatch(line) && !hasEscapeHatch(existing.file)) {
          collisions.push({
            file,
            line: lineNum,
            col,
            pattern: `Canonical domain collision: '${name}' duplicates canonical domain '${existing.name}' from '${existing.file}:${existing.line}' (${signature}) — unify into a single SSoT contract`,
            snippet: match[0].slice(0, 100).replace(/\n/g, '↵'),
            severity: 'ERROR',
          });
        }
      } else {
        const info = createCanonicalDomainInfo(name, file, lineNum, col, signature, literals, isContract);
        bySignature.set(signature, info);
        list.push(info);
      }
    });

    // 2. Exported type union
    forEachValidDomainMatch(content, P_CANONICAL_TYPE, lines, (match, lineNum, col) => {
      const name = match[1]!;
      const domain = extractValidDomainSignature(match[0]);
      if (!domain) return;
      const { literals, signature } = domain;
      const isContract = isContractFile(file);

      if (!bySignature.has(signature)) {
        const info = createCanonicalDomainInfo(name, file, lineNum, col, signature, literals, isContract);
        bySignature.set(signature, info);
        list.push(info);
      }
    });
  }

  return { bySignature, list, collisions };
}

const P_ANY_LITERAL_ARRAY = /\b(?:(?:export\s+)?const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
const P_ANY_TYPE_UNION = /\b(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=\s*\(?((?:['"`][a-zA-Z0-9_-]+['"`]\s*\|\s*)+['"`][a-zA-Z0-9_-]+['"`])\)?/g;

interface CanonicalDomainIndex {
  bySignature: Map<string, CanonicalDomainInfo>;
  list: CanonicalDomainInfo[];
}

interface DomainMatchInfo {
  ctx: { file: string; name: string; literals: string[]; lineNum: number; col: number; snippet: string };
  canonicalExact: CanonicalDomainInfo | null;
}

function parseDomainMatch(
  m: RegExpExecArray,
  rawContent: string,
  rawLines: string[],
  domainIndex: CanonicalDomainIndex,
  targetFile: string
): DomainMatchInfo | null {
  const { lineNum, col, line } = getMatchCoordinates(rawContent, m.index, rawLines);
  if (isCommentLine(line) || hasEscapeHatch(line)) return null;

  const name = m[1]!;
  const literals = extractSortedLiterals(m[0]);
  if (!literals || literals.length < 2) return null;

  const signature = literals.join('|');
  const canonicalExact = domainIndex.bySignature.get(signature) ?? null;
  if (canonicalExact && canonicalExact.file === targetFile && canonicalExact.name === name) {
    return null;
  }

  return {
    ctx: { file: targetFile, name, literals, lineNum, col, snippet: m[0].slice(0, 100).replace(/\n/g, '↵') },
    canonicalExact
  };
}

function findBestParentDomain(
  ctxLiterals: readonly string[],
  domainsList: readonly CanonicalDomainInfo[],
  currentFile: string
): CanonicalDomainInfo | null {
  let bestParent: CanonicalDomainInfo | null = null;
  for (const cand of domainsList) {
    if (cand.file === currentFile) continue;
    if (cand.literals.length <= ctxLiterals.length) continue;

    const isSubset = ctxLiterals.every(l => cand.elements.has(l));
    if (!isSubset) continue;

    const candLen = cand.literals.length;
    const litLen = ctxLiterals.length;
    const ratio = litLen / candLen;
    const diff = candLen - litLen;

    const isSignificant = candLen <= 40
      ? (litLen >= 3 && (ratio >= 0.5 || diff <= 3))
      : (ratio >= 0.5);

    if (isSignificant && (!bestParent || cand.literals.length < bestParent.literals.length)) {
      bestParent = cand;
    }
  }
  return bestParent;
}

function auditArrayDeclarations(
  content: string,
  lines: string[],
  file: string,
  domains: CanonicalDomainIndex
): Finding[] {
  const findings: Finding[] = [];
  P_ANY_LITERAL_ARRAY.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = P_ANY_LITERAL_ARRAY.exec(content)) !== null) {
    const parsed = parseDomainMatch(match, content, lines, domains, file);
    if (!parsed) continue;

    const { ctx, canonicalExact } = parsed;

    if (canonicalExact) {
      findings.push({
        file,
        line: ctx.lineNum,
        col: ctx.col,
        pattern: `Duplicate domain collection: '${ctx.name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and use '${canonicalExact.name}' directly instead of re-declaring domain literals`,
        snippet: ctx.snippet,
        severity: 'ERROR',
      });
      continue;
    }

    const bestParent = findBestParentDomain(ctx.literals, domains.list, file);
    if (bestParent) {
      findings.push({
        file,
        line: ctx.lineNum,
        col: ctx.col,
        pattern: `Sub-collection of canonical domain: '${ctx.name}' (${ctx.literals.length} elements) is a sub-collection of canonical domain '${bestParent.name}' (${bestParent.literals.length} elements) from '${bestParent.file}:${bestParent.line}' — do not re-declare domain literals manually; derive from '${bestParent.name}' via filtering or canonical domain types`,
        snippet: ctx.snippet,
        severity: 'ERROR',
      });
    }
  }
  return findings;
}

function auditTypeUnions(
  content: string,
  lines: string[],
  file: string,
  domains: CanonicalDomainIndex
): Finding[] {
  const findings: Finding[] = [];
  P_ANY_TYPE_UNION.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = P_ANY_TYPE_UNION.exec(content)) !== null) {
    const parsed = parseDomainMatch(match, content, lines, domains, file);
    if (!parsed || !parsed.canonicalExact) continue;

    const { ctx, canonicalExact } = parsed;
    findings.push({
      file,
      line: ctx.lineNum,
      col: ctx.col,
      pattern: `Duplicate domain type union: type '${ctx.name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and alias '${canonicalExact.name}' directly instead of re-declaring its union`,
      snippet: ctx.snippet,
      severity: 'ERROR',
    });
  }
  return findings;
}

export function detectProjectDomainDuplicatesAndSubsets(
  files: Array<{ file: string; content: string }>,
  domains: { bySignature: Map<string, CanonicalDomainInfo>; list: CanonicalDomainInfo[] }
): Finding[] {
  const findings: Finding[] = [];
  if (domains.list.length === 0) return findings;

  const config = getAuditConfig();
  const srcRoots = config.paths.srcRoots ?? ['src'];
  for (const { file, content } of files) {
    if (isTestFile(file) || file.endsWith('.d.ts') || !srcRoots.some(r => file.startsWith(r))) continue;
    const lines = content.split('\n');

    findings.push(...auditArrayDeclarations(content, lines, file, domains));
    findings.push(...auditTypeUnions(content, lines, file, domains));
  }

  return findings;
}

export type DomainTypesRuleId = 'domain-type-violation';

export const DOMAIN_TYPES_RULES: readonly DomainTypesRuleId[] = [
  'domain-type-violation'
] as const;

export class DomainTypesAuditor extends BaseAuditor<DomainTypesRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? (
      config.paths.includeTestsInCodeAudit
        ? [...(config.paths.codeRoots ?? ['src', 'scripts']), ...(config.paths.testRoots ?? ['tests'])]
        : (config.paths.codeRoots ?? ['src', 'scripts'])
    );
    super({
      id: 'validate_domain_types',
      name: 'Domain Types Integrity Audit',
      description: 'Uso de strings crudos en vez de tipos de dominio',
      family: 'domain_data',
      ruleIds: DOMAIN_TYPES_RULES,
      packageName: 'Dominio',
      ruleDescriptions: {
        'domain-type-violation': 'String crudo en vez de tipo de dominio'
      },
      roots: effectiveRoots,
      allowedExtensions: EXTENSIONS,
      extraIgnorePatterns: ['scripts/auditors/**', 'scripts/lib/**', 'coverage/**', 'packages/**'],
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.domain?.enabled === false) {
      this.context.logStep(1, 1, 'Domain audit disabled in configuration, skipping...');
      return;
    }

    this.context.logStep(1, 2, 'Extracting library domain types and scanning files...');
    const allFindings: Finding[] = [];
    const scannedFiles: Array<{ file: string; content: string }> = [];

    const libraryTypes = await extractLibraryDomainTypes(ROOT);

    const filePaths = this.context.collectFiles(this.roots, this.allowedExtensions);
    for (const filePath of filePaths) {
      const rel = toRepoPath(filePath);
      allFindings.push(...await auditFile(filePath));

      const content = await fs.readFile(filePath, 'utf8');
      scannedFiles.push({ file: rel, content });
    }

    this.filesScannedCount = scannedFiles.length;
    this.context.logStep(2, 2, `Analyzing domain unions and contracts in ${scannedFiles.length} files...`);

    const repeatedUnions = detectRepeatedStringUnions(scannedFiles);
    for (const [signatureKey, occurrences] of repeatedUnions) {
      for (const occurrence of occurrences) {
        occurrence.pattern = `Repeated ad-hoc string literal union '${signatureKey}' (${occurrences.length} occurrences) — MUST refactor to canonical domain type alias`;
        allFindings.push(occurrence);
      }
    }

    const libDuplicates = detectLibraryDomainTypeDuplicates(scannedFiles, libraryTypes);
    allFindings.push(...libDuplicates);

    const { bySignature: canonicalBySig, list: canonicalList, collisions: contractCollisions } = extractProjectCanonicalDomains(scannedFiles);
    allFindings.push(...contractCollisions);

    const projectDuplicates = detectProjectDomainDuplicatesAndSubsets(scannedFiles, { bySignature: canonicalBySig, list: canonicalList });
    allFindings.push(...projectDuplicates);

    for (const finding of allFindings) {
      this.addViolation({
        ruleId: 'domain-type-violation',
        severity: finding.severity === 'ERROR' ? 'error' : 'warning',
        file: finding.file,
        line: finding.line,
        message: finding.pattern,
        context: finding.snippet
      });
    }

    this.context.setMetric('Scanned files', scannedFiles.length);
    this.context.setMetric('Domain issues', allFindings.length);
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new DomainTypesAuditor());

