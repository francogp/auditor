import { BaseAuditor } from "../../core/auditorBase.js";
import ts from "typescript";
export declare const CANONICAL_DOMAIN_RULES: readonly ["canonical-domain-collision", "canonical-domain-repeated-union", "canonical-domain-library-duplicate", "canonical-domain-subset-mismatch"];
export type CanonicalDomainRuleId = (typeof CANONICAL_DOMAIN_RULES)[number];
export declare const MAX_CANONICAL_DOMAIN_LITERAL_LENGTH: 30;
export declare const MAX_COMPACT_DOMAIN_LITERALS_THRESHOLD: 40;
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
export declare function getEffectiveExemptSignatures(projectRoot?: string): ReadonlySet<string>;
export declare function getEffectiveExemptCollections(projectRoot?: string): ReadonlySet<string>;
export declare function extractSortedLiterals(matchStr: string): string[] | null;
export declare function extractSortedLiteralsSignature(matchStr: string): string | null;
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
export declare function extractStringLiteralsFromArray(arr: ts.ArrayLiteralExpression): string[] | null;
export declare function extractStringLiteralsFromUnion(union: ts.UnionTypeNode): string[] | null;
export declare function extractFileDomainCandidates(file: string, content: string): AstDomainCandidate[];
export declare function detectRepeatedStringUnions(files: Array<{
  file: string;
  content: string;
}>, projectRoot?: string): Map<string, CanonicalFinding[]>;
export declare function extractLibraryDomainTypes(root: string): Promise<Map<string, LibraryDomainTypeInfo>>;
export declare function detectLibraryDomainTypeDuplicates(files: Array<{
  file: string;
  content: string;
}>, libraryTypes: Map<string, LibraryDomainTypeInfo>): CanonicalFinding[];
export declare function extractProjectCanonicalDomains(files: Array<{
  file: string;
  content: string;
}>, projectRoot: string): {
  bySignature: Map<string, CanonicalDomainInfo>;
  list: CanonicalDomainInfo[];
  collisions: CanonicalFinding[];
};
export declare function detectProjectDomainDuplicatesAndSubsets(files: Array<{
  file: string;
  content: string;
}>, domains: {
  bySignature: Map<string, CanonicalDomainInfo>;
  list: CanonicalDomainInfo[];
}, projectRoot?: string): CanonicalFinding[];
export interface ValidateCanonicalDomainsOptions {
  projectRoot?: string;
  roots?: readonly string[];
}
export declare class ValidateCanonicalDomainsAuditor extends BaseAuditor<CanonicalDomainRuleId> {
  constructor(optionsOrTarget?: string | ValidateCanonicalDomainsOptions);
  runAudit(): Promise<void>;
}