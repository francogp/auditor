/**
 * packages/auditor/src/suites/domain_data/validate_canonical_domains.ts
 *
 * CANONICAL DOMAIN CATALOGS & SSoT INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Verifies single source of truth (SSoT) across TypeScript domain types and catalogs:
 * 1. Zero collisions between canonical domain catalogs across files.
 * 2. Zero repeated ad-hoc string literal unions across multiple files (must define a shared type alias).
 * 3. Zero local reinventions of domain types already exported by installed dependencies.
 * 4. Zero subsets or uncoordinated duplicates of canonical domain arrays and types.
 */

import fs from 'node:fs/promises';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import ts from 'typescript';

import { getAuditConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { AuditedDocument } from '../../core/auditedDocument.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { isTestFileForCodeAudit } from '../../core/auditTestPredicates.ts';
import { getEffectiveIgnoreGlobs } from '../../core/canonicalIgnoreRegistry.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { safeReadFileAsync, safeJsonParse, tryOrNullAsync } from '../../core/safeUtils.ts';

enableCompileCache();

export const CANONICAL_DOMAIN_RULES = [
  'canonical-domain-collision',
  'canonical-domain-repeated-union',
  'canonical-domain-library-duplicate',
  'canonical-domain-subset-mismatch'
] as const;

export type CanonicalDomainRuleId = (typeof CANONICAL_DOMAIN_RULES)[number];

const EXTENSIONS = new Set(['.ts', '.vue']); // runtime-set: Fast O(1) file extensions set
export const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH = 30 as const;
export const MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD = 40 as const;

export type DomainCandidateKind = 'array' | 'type' | 'property' | 'ad-hoc-union';

export interface CanonicalDomainInfo {
  name: string;
  file: string;
  line: number;
  col: number;
  signature: string;
  elements: Set<string>;
  literals: string[];
  isContract: boolean;
  kind?: DomainCandidateKind;
}

export interface LibraryDomainTypeInfo {
  typeName: string;
  pkgName: string;
  signature: string;
}

export interface CanonicalFinding {
  file: string;
  line: number;
  col: number;
  ruleId: CanonicalDomainRuleId;
  message: string;
  snippet: string;
}

const DEFAULT_UNIVERSAL_SIGNATURE_EXEMPTIONS = [
  'error|warning',
  'error|suggestion|warning',
  'error|info|warning',
  'error|off|warn',
  'asc|desc',
  'center|left|right',
  'delete|get|patch|post|put',
  'delete|get|post|put'
] as const;

export function getEffectiveExemptSignatures(projectRoot?: string): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const configured = config.domain?.exemptSignatures ?? [];
  const normalizedConfigured = configured.map((sig) =>
    sig
      .split('|')
      .map((s) => s.trim())
      .sort()
      .join('|')
  );
  return new Set<string>([...DEFAULT_UNIVERSAL_SIGNATURE_EXEMPTIONS, ...normalizedConfigured]);
}

const DEFAULT_RESERVED_CANONICAL_COLLECTIONS = [
  'ROUTES',
  'CONFIG',
  'ITEMS',
  'OPTIONS',
  'STYLES',
  'THEMES',
  'MODALS'
] as const;

export function getEffectiveExemptCollections(projectRoot?: string): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const configured = config.domain?.exemptCollections ?? [];
  return new Set<string>([...DEFAULT_RESERVED_CANONICAL_COLLECTIONS, ...configured]);
}

export function extractSortedLiterals(matchStr: string): string[] | null {
  const rawLiterals = matchStr.match(/['"`][\w-]+['"`]/g);
  if (!rawLiterals || rawLiterals.length < 2) return null;
  const literals = Array.from(new Set(rawLiterals.map((l) => l.replace(/['"`]/g, '')))).sort();
  if (literals.length < 2) return null;
  return literals;
}

export function extractSortedLiteralsSignature(matchStr: string): string | null {
  const literals = extractSortedLiterals(matchStr);
  return literals ? literals.join('|') : null;
}

export interface AstDomainCandidate {
  name: string;
  literals: string[];
  signature: string;
  isAsConst: boolean;
  isExported: boolean;
  kind: DomainCandidateKind;
  line: number;
  col: number;
  snippet: string;
}

function normalizeAndValidateDomainLiterals(values: string[]): string[] | null {
  if (values.length < 2) return null;
  const uniqueSorted = Array.from(new Set(values)).sort();
  if (uniqueSorted.length < 2) return null;
  if (
    uniqueSorted.some(
      (l) => l.includes('/') || l.includes(' ') || l.length > MAX_CANONICAL_DOMAIN_LITERAL_LENGTH
    )
  ) {
    return null;
  }
  return uniqueSorted;
}

export function extractStringLiteralsFromArray(arr: ts.ArrayLiteralExpression): string[] | null {
  const values: string[] = [];
  for (const el of arr.elements) {
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
      values.push(el.text);
    } else {
      return null;
    }
  }
  return normalizeAndValidateDomainLiterals(values);
}

export function extractStringLiteralsFromUnion(union: ts.UnionTypeNode): string[] | null {
  const values: string[] = [];
  for (const t of union.types) {
    if (
      ts.isLiteralTypeNode(t) &&
      (ts.isStringLiteral(t.literal) || ts.isNoSubstitutionTemplateLiteral(t.literal))
    ) {
      values.push(t.literal.text);
    } else {
      return null;
    }
  }
  return normalizeAndValidateDomainLiterals(values);
}

function collectVariableArrayCandidates(
  node: ts.Node,
  sf: ts.SourceFile,
  doc: AuditedDocument,
  candidates: AstDomainCandidate[]
): void {
  if (!ts.isVariableStatement(node)) return;
  const isExported = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const decl of node.declarationList.declarations) {
    if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
    const name = decl.name.text;

    let arrExpr: ts.ArrayLiteralExpression | null = null;
    let isAsConst = false;

    if (ts.isAsExpression(decl.initializer)) {
      if (ts.isArrayLiteralExpression(decl.initializer.expression)) {
        arrExpr = decl.initializer.expression;
        const typeText = decl.initializer.type.getText(sf).trim();
        isAsConst = typeText === 'const';
      }
    } else if (ts.isArrayLiteralExpression(decl.initializer)) {
      arrExpr = decl.initializer;
      isAsConst = false;
    }

    if (arrExpr) {
      const literals = extractStringLiteralsFromArray(arrExpr);
      if (literals) {
        const { line, column } = doc.getNodeLineAndColumn(decl, sf);
        candidates.push({
          name,
          literals,
          signature: literals.join('|'),
          isAsConst,
          isExported,
          kind: 'array',
          line,
          col: column,
          snippet: decl.getText(sf)
        });
      }
    }
  }
}

function collectTypeAliasCandidates(
  node: ts.Node,
  sf: ts.SourceFile,
  doc: AuditedDocument,
  candidates: AstDomainCandidate[]
): void {
  if (!ts.isTypeAliasDeclaration(node) || !ts.isUnionTypeNode(node.type)) return;
  const isExported = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const literals = extractStringLiteralsFromUnion(node.type);
  if (literals) {
    const { line, column } = doc.getNodeLineAndColumn(node, sf);
    candidates.push({
      name: node.name.text,
      literals,
      signature: literals.join('|'),
      isAsConst: false,
      isExported,
      kind: 'type',
      line,
      col: column,
      snippet: node.getText(sf)
    });
  }
}

function collectPropertyCandidates(
  node: ts.Node,
  sf: ts.SourceFile,
  doc: AuditedDocument,
  candidates: AstDomainCandidate[]
): void {
  if (
    (!ts.isPropertySignature(node) && !ts.isPropertyDeclaration(node)) ||
    !node.type ||
    !ts.isUnionTypeNode(node.type)
  )
    return;
  const literals = extractStringLiteralsFromUnion(node.type);
  if (literals) {
    const name = node.name ? node.name.getText(sf) : 'anonymous';
    const { line, column } = doc.getNodeLineAndColumn(node, sf);
    candidates.push({
      name,
      literals,
      signature: literals.join('|'),
      isAsConst: false,
      isExported: false,
      kind: 'property',
      line,
      col: column,
      snippet: node.getText(sf)
    });
  }
}

function collectAdHocUnionCandidates(
  node: ts.Node,
  sf: ts.SourceFile,
  doc: AuditedDocument,
  candidates: AstDomainCandidate[]
): void {
  if (!ts.isUnionTypeNode(node)) return;
  const p = node.parent;
  if (
    ts.isTypeAliasDeclaration(p) ||
    ts.isPropertySignature(p) ||
    ts.isPropertyDeclaration(p) ||
    ts.isTypeOperatorNode(p)
  ) {
    return;
  }
  const literals = extractStringLiteralsFromUnion(node);
  if (literals) {
    const { line, column } = doc.getNodeLineAndColumn(node, sf);
    candidates.push({
      name: 'anonymous',
      literals,
      signature: literals.join('|'),
      isAsConst: false,
      isExported: false,
      kind: 'ad-hoc-union',
      line,
      col: column,
      snippet: node.getText(sf)
    });
  }
}

export function extractFileDomainCandidates(file: string, content: string): AstDomainCandidate[] {
  const doc = new AuditedDocument(file, content, file);
  const sf = doc.getAst();
  if (!sf) return [];

  const candidates: AstDomainCandidate[] = [];
  const visit = (node: ts.Node): void => {
    collectVariableArrayCandidates(node, sf, doc, candidates);
    collectTypeAliasCandidates(node, sf, doc, candidates);
    collectPropertyCandidates(node, sf, doc, candidates);
    collectAdHocUnionCandidates(node, sf, doc, candidates);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return candidates;
}

export function detectRepeatedStringUnions(
  files: Array<{ file: string; content: string }>,
  projectRoot?: string
): Map<string, CanonicalFinding[]> {
  const unionOccurrences = new Map<string, CanonicalFinding[]>();
  const exemptSignatures = getEffectiveExemptSignatures(projectRoot);

  for (const { file, content } of files) {
    const candidates = extractFileDomainCandidates(file, content);
    for (const cand of candidates) {
      if (cand.kind === 'array' || exemptSignatures.has(cand.signature)) continue;

      const finding: CanonicalFinding = {
        file,
        line: cand.line,
        col: cand.col,
        ruleId: 'canonical-domain-repeated-union',
        message: `Repeated ad-hoc string literal union '${cand.signature}' — refactor into canonical domain type alias`,
        snippet: cand.snippet.slice(0, 100).replace(/\n/g, '↵')
      };

      const existing = unionOccurrences.get(cand.signature);
      if (existing) existing.push(finding);
      else unionOccurrences.set(cand.signature, [finding]);
    }
  }

  const repeatedMap = new Map<string, CanonicalFinding[]>();
  for (const [signatureKey, occurrences] of unionOccurrences) {
    if (occurrences.length >= 2) {
      repeatedMap.set(signatureKey, occurrences);
    }
  }

  return repeatedMap;
}

function parseDtsDomainTypes(
  content: string,
  dep: string,
  targetMap: Map<string, LibraryDomainTypeInfo>,
  exemptSignatures: ReadonlySet<string>
): void {
  const doc = new AuditedDocument('lib.d.ts', content, 'lib.d.ts');
  const sf = doc.getAst();
  if (!sf) return;
  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && ts.isUnionTypeNode(node.type)) {
      const literals = extractStringLiteralsFromUnion(node.type);
      if (literals) {
        const sigKey = literals.join('|');
        if (!exemptSignatures.has(sigKey) && !targetMap.has(sigKey)) {
          targetMap.set(sigKey, { typeName: node.name.text, pkgName: dep, signature: sigKey });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

async function scanDepEntries(
  depDir: string,
  dep: string,
  targetMap: Map<string, LibraryDomainTypeInfo>,
  exemptSignatures: ReadonlySet<string>
): Promise<void> {
  const entries = await tryOrNullAsync(() =>
    fs.readdir(depDir, { recursive: true, withFileTypes: true })
  );
  if (!entries) return;

  for (const ent of entries) {
    if (ent.isDirectory() || !ent.name.endsWith('.d.ts')) continue;
    const full = path.join(ent.parentPath ?? depDir, ent.name);
    const content = await safeReadFileAsync(full);
    if (content) {
      parseDtsDomainTypes(content, dep, targetMap, exemptSignatures);
    }
  }
}

export async function extractLibraryDomainTypes(
  root: string
): Promise<Map<string, LibraryDomainTypeInfo>> {
  const libraryTypes = new Map<string, LibraryDomainTypeInfo>();
  const exemptSignatures = getEffectiveExemptSignatures(root);
  const nodeModulesDir = path.join(root, 'node_modules');
  const pkgJsonPath = path.join(root, 'package.json');

  const raw = await safeReadFileAsync(pkgJsonPath);
  const pkgJson = raw ? safeJsonParse<{ dependencies?: Record<string, string> }>(raw) : null;
  if (!pkgJson) return libraryTypes;

  const allDeps = Object.keys(pkgJson.dependencies || {});

  for (const dep of allDeps) {
    const depDir = path.join(nodeModulesDir, dep);
    const depExists = await tryOrNullAsync(async () => {
      await fs.access(depDir);
      return true;
    });
    if (!depExists) continue;

    await scanDepEntries(depDir, dep, libraryTypes, exemptSignatures);
  }

  return libraryTypes;
}

export function detectLibraryDomainTypeDuplicates(
  files: Array<{ file: string; content: string }>,
  libraryTypes: Map<string, LibraryDomainTypeInfo>
): CanonicalFinding[] {
  const findings: CanonicalFinding[] = [];
  if (libraryTypes.size === 0) return findings;

  for (const { file, content } of files) {
    const candidates = extractFileDomainCandidates(file, content);
    for (const cand of candidates) {
      if (cand.kind === 'ad-hoc-union') continue;
      // RULE: Do NOT flag immutable runtime arrays ('as const') against type-only library .d.ts types!
      if (cand.kind === 'array' && cand.isAsConst) continue;

      const libInfo = libraryTypes.get(cand.signature);
      if (libInfo) {
        let msg: string;
        if (cand.kind === 'array') {
          msg = `Duplicate of library domain type: '${cand.name}' duplicates '${libInfo.typeName}' from '${libInfo.pkgName}' — import and use '${libInfo.typeName}' directly instead of reinventing it locally`;
        } else if (cand.kind === 'type') {
          msg = `Duplicate of library domain type: type '${cand.name}' duplicates '${libInfo.typeName}' from '${libInfo.pkgName}' — import and alias '${libInfo.typeName}' directly instead of re-declaring its union`;
        } else {
          msg = `Duplicate of library domain type: property '${cand.name}' duplicates '${libInfo.typeName}' from '${libInfo.pkgName}' — import and use '${libInfo.typeName}' directly instead of re-declaring its union literals`;
        }

        findings.push({
          file,
          line: cand.line,
          col: cand.col,
          ruleId: 'canonical-domain-library-duplicate',
          message: msg,
          snippet: cand.snippet.slice(0, 100).replace(/\n/g, '↵')
        });
      }
    }
  }

  return findings;
}

function getFileArchitectureScore(
  file: string,
  typesRoots: readonly string[],
  dataRoots: readonly string[],
  logicRoots: readonly string[]
): number {
  if (typesRoots.some((r) => file.startsWith(r))) return 3;
  if (dataRoots.some((r) => file.startsWith(r))) return 2;
  if (logicRoots.some((r) => file.startsWith(r))) return 1;
  return 0;
}

function registerCanonicalCandidate(
  cand: AstDomainCandidate,
  file: string,
  isContract: boolean,
  bySignature: Map<string, CanonicalDomainInfo>,
  list: CanonicalDomainInfo[],
  collisions: CanonicalFinding[],
  exemptSignatures: ReadonlySet<string>,
  exemptCollections: ReadonlySet<string>
): void {
  if (!cand.isExported) return;
  if (cand.kind === 'array' && !cand.isAsConst) return;
  if (cand.kind === 'property' || cand.kind === 'ad-hoc-union') return;
  if (exemptCollections.has(cand.name)) return;
  if (exemptSignatures.has(cand.signature)) return;

  const existing = bySignature.get(cand.signature);
  if (existing) {
    if (existing.file !== file) {
      collisions.push({
        file,
        line: cand.line,
        col: cand.col,
        ruleId: 'canonical-domain-collision',
        message: `Canonical domain collision: '${cand.name}' duplicates canonical domain '${existing.name}' from '${existing.file}:${existing.line}' (${cand.signature}) — unify into a single SSoT contract`,
        snippet: cand.snippet.slice(0, 100).replace(/\n/g, '↵')
      });
    }
    return;
  }

  const info: CanonicalDomainInfo = {
    name: cand.name,
    file,
    line: cand.line,
    col: cand.col,
    signature: cand.signature,
    elements: new Set(cand.literals),
    literals: cand.literals,
    isContract,
    kind: cand.kind
  };
  bySignature.set(cand.signature, info);
  list.push(info);
}

export function extractProjectCanonicalDomains(
  files: Array<{ file: string; content: string }>,
  projectRoot: string
): {
  bySignature: Map<string, CanonicalDomainInfo>;
  list: CanonicalDomainInfo[];
  collisions: CanonicalFinding[];
} {
  const bySignature = new Map<string, CanonicalDomainInfo>();
  const list: CanonicalDomainInfo[] = [];
  const collisions: CanonicalFinding[] = [];

  const config = getAuditConfig(projectRoot);
  const typesRoots = config.paths.typesRoots ?? [];
  const dataRoots = config.paths.dataRoots ?? [];
  const logicRoots = config.paths.logicRoots ?? [];
  const exemptSignatures = getEffectiveExemptSignatures(projectRoot);
  const exemptCollections = getEffectiveExemptCollections(projectRoot);

  const sortedFiles = [...files].sort(
    (a, b) =>
      getFileArchitectureScore(b.file, typesRoots, dataRoots, logicRoots) -
      getFileArchitectureScore(a.file, typesRoots, dataRoots, logicRoots)
  );

  for (const { file, content } of sortedFiles) {
    if (file.endsWith('.d.ts')) continue;
    const candidates = extractFileDomainCandidates(file, content);
    const isContract =
      typesRoots.some((r) => file.startsWith(r)) || dataRoots.some((r) => file.startsWith(r));

    for (const cand of candidates) {
      registerCanonicalCandidate(
        cand,
        file,
        isContract,
        bySignature,
        list,
        collisions,
        exemptSignatures,
        exemptCollections
      );
    }
  }

  return { bySignature, list, collisions };
}

function findBestParentDomain(
  literals: string[],
  domainsList: CanonicalDomainInfo[],
  currentFile: string
): CanonicalDomainInfo | null {
  let bestParent: CanonicalDomainInfo | null = null;
  for (const parent of domainsList) {
    if (parent.file === currentFile || parent.literals.length <= literals.length) continue;
    const isSubset = literals.every((l) => parent.elements.has(l));
    if (!isSubset) continue;

    const ratio = literals.length / parent.literals.length;
    const diff = parent.literals.length - literals.length;
    const isSignificant =
      parent.literals.length <= MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD
        ? literals.length >= 3 && (ratio >= 0.5 || diff <= 3)
        : ratio >= 0.5;

    if (isSignificant && (!bestParent || parent.literals.length < bestParent.literals.length)) {
      bestParent = parent;
    }
  }
  return bestParent;
}

function checkCandidateDuplicateOrSubset(
  cand: AstDomainCandidate,
  file: string,
  domains: { bySignature: Map<string, CanonicalDomainInfo>; list: CanonicalDomainInfo[] },
  findings: CanonicalFinding[],
  exemptSignatures: ReadonlySet<string>,
  exemptCollections: ReadonlySet<string>
): void {
  if (cand.kind === 'property' || cand.kind === 'ad-hoc-union') return;
  if (exemptCollections.has(cand.name)) return;
  if (exemptSignatures.has(cand.signature)) return;

  const canonicalExact = domains.bySignature.get(cand.signature);
  if (canonicalExact && canonicalExact.file === file) {
    const isSameName = canonicalExact.name === cand.name;
    const isDifferentKind = cand.kind !== canonicalExact.kind;
    if (isSameName || isDifferentKind) {
      return;
    }
  }

  if (canonicalExact) {
    const ruleMsg =
      cand.kind === 'array'
        ? `Duplicate domain collection: '${cand.name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and use '${canonicalExact.name}' directly instead of re-declaring domain literals`
        : `Duplicate domain type union: type '${cand.name}' duplicates canonical domain '${canonicalExact.name}' from '${canonicalExact.file}:${canonicalExact.line}' — import and alias '${canonicalExact.name}' directly`;

    findings.push({
      file,
      line: cand.line,
      col: cand.col,
      ruleId: 'canonical-domain-subset-mismatch',
      message: ruleMsg,
      snippet: cand.snippet.slice(0, 100).replace(/\n/g, '↵')
    });
    return;
  }

  if (cand.kind === 'array') {
    const bestParent = findBestParentDomain(cand.literals, domains.list, file);
    if (bestParent) {
      findings.push({
        file,
        line: cand.line,
        col: cand.col,
        ruleId: 'canonical-domain-subset-mismatch',
        message: `Sub-collection of canonical domain: '${cand.name}' (${cand.literals.length} elements) is a sub-collection of canonical domain '${bestParent.name}' (${bestParent.literals.length} elements) from '${bestParent.file}:${bestParent.line}' — derive from '${bestParent.name}'`,
        snippet: cand.snippet.slice(0, 100).replace(/\n/g, '↵')
      });
    }
  }
}

export function detectProjectDomainDuplicatesAndSubsets(
  files: Array<{ file: string; content: string }>,
  domains: { bySignature: Map<string, CanonicalDomainInfo>; list: CanonicalDomainInfo[] },
  projectRoot?: string
): CanonicalFinding[] {
  const findings: CanonicalFinding[] = [];
  if (domains.list.length === 0) return findings;

  const exemptSignatures = getEffectiveExemptSignatures(projectRoot);
  const exemptCollections = getEffectiveExemptCollections(projectRoot);

  for (const { file, content } of files) {
    if (file.endsWith('.d.ts')) continue;
    const candidates = extractFileDomainCandidates(file, content);

    for (const cand of candidates) {
      checkCandidateDuplicateOrSubset(
        cand,
        file,
        domains,
        findings,
        exemptSignatures,
        exemptCollections
      );
    }
  }

  return findings;
}

export interface ValidateCanonicalDomainsOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}

export class ValidateCanonicalDomainsAuditor extends BaseAuditor<CanonicalDomainRuleId> {
  public constructor(options: ValidateCanonicalDomainsOptions = {}) {
    const projectRoot = options.projectRoot || process.cwd();
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = options.roots ?? config.paths.srcRoots ?? [];
    const effectiveIgnores = Array.from(getEffectiveIgnoreGlobs(projectRoot));

    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(CANONICAL_DOMAIN_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_canonical_domains',
      name: 'Canonical Domain Catalogs & SSoT Validator',
      description: 'Catalog collisions and repeated domain unions',
      family: 'domain_data',
      ruleIds: CANONICAL_DOMAIN_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(CANONICAL_DOMAIN_RULES, 'contracts'),
      packageName: 'Catalogs',
      icon: '📚',
      configKey: 'domain.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      ruleDescriptions: {
        'canonical-domain-collision': 'Canonical catalog collision',
        'canonical-domain-repeated-union': 'Repeated union without canonical alias',
        'canonical-domain-library-duplicate': 'Union duplicates library type',
        'canonical-domain-subset-mismatch': 'Subset of canonical catalog'
      },
      ruleRemediations: {
        'canonical-domain-collision':
          '📖 REMEDIATION GUIDE: canonical-domain-collision\n' +
          '1. Root Cause: Two or more identical canonical declarations (same set of literals) were detected across different project files, violating the Single Source of Truth (SSoT) principle.\n' +
          '2. Diagnosis: The violation message indicates the file and line of the original and duplicate catalogs.\n' +
          '3. Canonical Solution:\n' +
          '   a) Unify the catalogs into a single contract file inside canonical types directory (e.g. src/types/ or src/domain/).\n' +
          '   b) Delete the duplicate declaration and replace it with an import of the unified catalog.\n' +
          '4. Example:\n' +
          '   // ❌ Incorrect: Two or more files declare identical catalogs with different names\n' +
          '   // ✅ Correct: Unify definition in src/types/ or src/domain/ and import it in consumers.',
        'canonical-domain-repeated-union':
          '📖 REMEDIATION GUIDE: canonical-domain-repeated-union\n' +
          '1. Root Cause: An ad-hoc inline string literal union is used in multiple function signatures or interfaces instead of a named canonical type, dispersing the domain and causing desynchronization when a value is added.\n' +
          '2. Diagnosis: Run "npm run auditor:findings rule=canonical-domain-repeated-union" to locate occurrences of the dispersed union.\n' +
          '3. Canonical Solution:\n' +
          '   a) Extract the union to a named canonical type alias with "as const" or "type" in the corresponding types file.\n' +
          '   b) Replace repeated ad-hoc unions with the reference to the canonical type.\n' +
          '4. Example:\n' +
          '   // ❌ Incorrect: Repeat the same literal union inline across multiple functions\n' +
          '   // ✅ Correct: Centralize in an exported canonical type alias and import it.',
        'canonical-domain-library-duplicate':
          '📖 REMEDIATION GUIDE: canonical-domain-library-duplicate\n' +
          '1. Root Cause: The project re-declares locally a union or literal catalog that already exists and is provided by an installed dependency in node_modules.\n' +
          '2. Diagnosis: The rule message specifies the library and exported type name in its .d.ts definitions that duplicates the local declaration.\n' +
          '3. Canonical Solution:\n' +
          '   a) Delete the redundant local declaration.\n' +
          '   b) Import the type or collection directly from the corresponding package.\n' +
          '4. Example:\n' +
          '   // ❌ Incorrect: re-declare types already provided by the library\n' +
          '   type MyHttpMethod = "GET" | "POST" | "PUT" | "DELETE";\n' +
          '   // ✅ Correct: reuse canonical type from the library or environment\n' +
          '   // import type { Method } from "axios"; or use the standard interface',
        'canonical-domain-subset-mismatch':
          '📖 REMEDIATION GUIDE: canonical-domain-subset-mismatch\n' +
          '1. Root Cause: Declared an array or type union that exactly duplicates an existing catalog, or is a substantial subset of a master catalog without deriving from it.\n' +
          '2. Diagnosis: Check the warning indicating the parent catalog from which the subset is bifurcating.\n' +
          '3. Canonical Solution:\n' +
          '   a) If an exact duplicate: delete it and import the master catalog.\n' +
          '   b) If a subset: derive it via TypeScript utilities such as Extract<ParentType, ...> or constant filtering to preserve the inheritance relationship with master domain.\n' +
          '4. Example:\n' +
          '   // ❌ Incorrect: ad-hoc subset disconnected from master catalog\n' +
          '   type ActivePhase = "plan" | "execute";\n' +
          '   // ✅ Correct: safe derivation from master canonical type\n' +
          '   type ActivePhase = Extract<Phase, "plan" | "execute">;'
      },
      coverage: {
        include: deriveCoverageFromRoots(effectiveRoots, EXTENSIONS).include,
        exclude: effectiveIgnores
      },
      roots: effectiveRoots,
      allowedExtensions: EXTENSIONS,
      extraIgnorePatterns: effectiveIgnores,
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Dominio desactivado en config')) {
      this.redeclareCoverage({
        include: deriveCoverageFromRoots(this.roots, this.allowedExtensions, this.projectRoot)
          .include,
        source: 'declared-only'
      });
      return;
    }

    const filePaths = this.context.collectFiles(this.roots, this.allowedExtensions);
    if (filePaths.length === 0) {
      for (const r of CANONICAL_DOMAIN_RULES) {
        this.runSubAuditorSync(r, () => {
          this.markRuleNotApplicable(r, 'No se encontraron archivos de código candidatos');
        });
      }
      return;
    }

    const scannedFiles: Array<{ file: string; content: string }> = [];
    for (const fp of filePaths) {
      const rel = toPosixRelative(this.projectRoot, fp);
      if (isTestFileForCodeAudit(rel, this.projectRoot)) continue;
      this.recordScanned(rel);
      const content = await safeReadFileAsync(fp);
      if (content) {
        scannedFiles.push({ file: rel, content });
      }
    }

    const allFindings: CanonicalFinding[] = [];

    // 1. Repeated unions across files
    this.runSubAuditorSync('canonical-domain-repeated-union', () => {
      const repeatedUnions = detectRepeatedStringUnions(scannedFiles, this.projectRoot);
      for (const [, occurrences] of repeatedUnions) {
        allFindings.push(...occurrences);
      }
    });

    // 2. Library domain duplicates
    await this.runSubAuditor('canonical-domain-library-duplicate', async () => {
      const libraryTypes = await extractLibraryDomainTypes(this.projectRoot);
      const libDuplicates = detectLibraryDomainTypeDuplicates(scannedFiles, libraryTypes);
      allFindings.push(...libDuplicates);
    });

    // 3. Project canonical domain collisions
    let domainData: {
      bySignature: Map<string, CanonicalDomainInfo>;
      list: CanonicalDomainInfo[];
      collisions: CanonicalFinding[];
    } = {
      bySignature: new Map(),
      list: [],
      collisions: []
    };
    this.runSubAuditorSync('canonical-domain-collision', () => {
      domainData = extractProjectCanonicalDomains(scannedFiles, this.projectRoot);
      allFindings.push(...domainData.collisions);
    });

    // 4. Subsets and duplicates
    this.runSubAuditorSync('canonical-domain-subset-mismatch', () => {
      const subsets = detectProjectDomainDuplicatesAndSubsets(
        scannedFiles,
        {
          bySignature: domainData.bySignature,
          list: domainData.list
        },
        this.projectRoot
      );
      allFindings.push(...subsets);
    });

    for (const finding of allFindings) {
      this.addViolation({
        ruleId: finding.ruleId,
        severity: 'error',
        file: finding.file,
        line: finding.line,
        col: finding.col,
        message: finding.message,
        context: finding.snippet
      });
    }

    this.context.setMetric('Scanned files', scannedFiles.length);
    this.context.setMetric('Canonical findings', allFindings.length);
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateCanonicalDomainsAuditor());
