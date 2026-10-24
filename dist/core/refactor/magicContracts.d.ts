/**
 * src/core/refactor/magicContracts.ts
 *
 * CANONICAL REFACTORING CONTRACTS FOR MAGIC LITERALS & DESIGN TOKENS
 * Strongly-typed models for polyglot magic discovery, zero-token AST inference,
 * Super-Dirac batch clustering, and surgical AST refactoring plans.
 */
export type MagicLiteralKind = 'numeric-ts' | 'numeric-vue-script' | 'z-index-scss' | 'color-scss' | 'spacing-scss';
export type InferredSemanticRole = 'timer-delay' | 'property-value' | 'binary-threshold' | 'parameter-value' | 'math-formula' | 'z-index-layer' | 'color-token' | 'spacing-token' | 'unclassified';
export interface DiscoveredMagicItem {
  readonly id: string;
  readonly file: string;
  readonly kind: MagicLiteralKind;
  readonly line: number;
  readonly column: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly rawValue: string | number;
  readonly numericValue?: number;
  readonly lineSnippet: string;
  readonly enclosingSymbol?: string;
  readonly semanticRole: InferredSemanticRole;
  readonly autoCandidateName?: string;
  readonly matchingExistingConstant?: {
    readonly symbol: string;
    readonly moduleSpecifier?: string;
    readonly isCssVariable?: boolean;
  };
  readonly isZeroTokenResolvable: boolean;
}
export interface ExistingConstantEntry {
  readonly symbol: string;
  readonly value: string | number;
  readonly file: string;
  readonly isExported: boolean;
  readonly isCssVariable: boolean;
}
export interface SuperDiracBatchItem {
  readonly id: string;
  readonly loc: string;
  readonly val: string | number;
  readonly role: InferredSemanticRole;
  readonly fn?: string;
  readonly expr: string;
  readonly candidate: string;
}
export interface SuperDiracClusterPacket {
  readonly file: string;
  readonly totalItems: number;
  readonly zeroTokenCount: number;
  readonly pendingAmbiguousCount: number;
  readonly fullFileTokensBaseline: number;
  readonly superDiracBatchTokens: number;
  readonly tokenSavingsPercent: number;
  readonly items: readonly SuperDiracBatchItem[];
}
export interface ConstantDeclarationSpec {
  readonly name: string;
  readonly value: string | number;
  readonly isExported?: boolean;
  readonly targetLocation: 'local-file-header' | 'shared-constants-module' | 'scss-root-var';
  readonly destinationFile?: string;
}
export interface SpanReplacementSpec {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly replacement: string;
  readonly originalSnippet?: string;
}
export interface MagicRefactorPlan {
  readonly version?: number;
  readonly planId: string;
  readonly targetFiles: readonly string[];
  readonly declarations: readonly ConstantDeclarationSpec[];
  readonly fileReplacements: Readonly<Record<string, readonly SpanReplacementSpec[]>>;
  readonly requiredImports?: Readonly<Record<string, readonly {
    symbols: readonly string[];
    moduleSpecifier: string;
  }[]>>;
}