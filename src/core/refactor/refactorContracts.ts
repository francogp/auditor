/**
 * src/core/refactor/refactorContracts.ts
 *
 * CANONICAL REFACTORING CONTRACTS & INTERFACES (Node.js 26+ Native)
 * Provides strongly-typed models for duplicate/triplicate detection,
 * micro-context extraction (Dirac pattern), and AST refactoring plans.
 */

export const ESTIMATED_TOKENS_PER_CHAR = 0.25;

export interface FallowInstance {
  readonly file: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly start_col?: number;
  readonly end_col?: number;
  readonly fragment?: string;
  readonly is_symlink?: boolean;
}

export interface FallowCloneGroup {
  readonly fingerprint: string;
  readonly token_count: number;
  readonly line_count: number;
  readonly instances: readonly FallowInstance[];
  readonly spread?: number;
  readonly suggested_name?: string;
  readonly actions?: readonly {
    readonly type: string;
    readonly auto_fixable: boolean;
    readonly description: string;
  }[];
}

export interface FallowCloneFamily {
  readonly files: readonly string[];
  readonly groups: readonly FallowCloneGroup[];
  readonly total_duplicated_lines: number;
  readonly total_duplicated_tokens: number;
  readonly suggestions?: readonly {
    readonly kind: string;
    readonly description: string;
    readonly estimated_savings: number;
  }[];
}

export interface FallowDupesOutput {
  readonly kind?: string;
  readonly stats: {
    readonly total_files: number;
    readonly files_with_clones: number;
    readonly total_lines: number;
    readonly duplicated_lines: number;
    readonly total_tokens: number;
    readonly duplicated_tokens: number;
    readonly clone_groups: number;
    readonly clone_families: number;
    readonly clone_instances: number;
    readonly duplication_percentage: number;
  };
  readonly clone_groups: readonly FallowCloneGroup[];
  readonly clone_families: readonly FallowCloneFamily[];
}

export interface FallowDeadCodeOutput {
  readonly total_issues: number;
  readonly unused_files: readonly { readonly path: string }[];
  readonly unused_exports: readonly { readonly path: string; readonly export_name: string }[];
}

export type CloneTopology =
  | 'intra-file-ts'
  | 'cross-file-ts'
  | 'intra-file-vue'
  | 'cross-file-vue-ts';

export interface TriagedCloneCandidate {
  readonly fingerprint: string;
  readonly topology: CloneTopology;
  readonly tokenCount: number;
  readonly lineCount: number;
  readonly occurrenceCount: number;
  readonly spread: number;
  readonly files: readonly string[];
  readonly instances: readonly FallowInstance[];
  readonly suggestedName?: string;
  readonly isDeadCodeTarget: boolean;
}

export interface MicroContextInstance {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly contextStartLine: number;
  readonly contextEndLine: number;
  readonly rawFragment: string;
  readonly contextSnippet: string;
  readonly sha256: string;
  readonly freeVariables: readonly string[];
  readonly assignedVariables: readonly string[];
  readonly hasReturnOrControlBreak: boolean;
}

export interface MicroContextPacket {
  readonly fingerprint: string;
  readonly instances: readonly MicroContextInstance[];
  readonly candidateParameters: readonly string[];
  readonly candidateReturns: readonly string[];
  readonly traditionalTokensEstimate: number;
  readonly microContextTokensEstimate: number;
  readonly tokenSavingsPercent: number;
}

export type RefactorActionKind =
  | 'extract-shared-function'
  | 'extract-intra-file-function'
  | 'parameterize-weak-clone'
  | 'hoist-to-base-class';

export interface RefactorPlan {
  readonly version: 1;
  readonly planId: string;
  readonly fingerprint: string;
  readonly action: RefactorActionKind;
  readonly sharedModulePath: string;
  readonly functionName: string;
  readonly parameters: readonly { readonly name: string; readonly type?: string }[];
  readonly returnType?: string;
  readonly sharedFunctionCode: string;
  readonly targetFiles: readonly string[];
  readonly astPattern: string;
  readonly astRewrite: string;
}

export type MotionFindingKind = 'banned-ui-timer' | 'layout-property' | 'legacy-ease';

export interface MotionFindingItem {
  readonly file: string;
  readonly line: number;
  readonly kind: MotionFindingKind;
  readonly ruleId?: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}

export interface MotionRefactorPlan {
  readonly version: 1;
  readonly planId: string;
  readonly targetFiles: readonly string[];
  readonly timerReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalCall: string;
    readonly replacementCall: string;
  }[];
  readonly propertyReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly fromProp: string;
    readonly toProp: string;
  }[];
  readonly easeReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly fromEase: string;
    readonly toEase: string;
  }[];
  readonly importInjections?: readonly {
    readonly file: string;
    readonly importStatement: string;
  }[];
}

export type O1FindingKind =
  | 'linear-membership'
  | 'json-clone'
  | 'redundant-spread'
  | 'catalog-lookup';

export interface O1FindingItem {
  readonly file: string;
  readonly line: number;
  readonly kind: O1FindingKind;
  readonly ruleId?: string;
  readonly identifier?: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}

export interface O1RefactorPlan {
  readonly version: 1;
  readonly planId: string;
  readonly targetFiles: readonly string[];
  readonly membershipHoists?: readonly {
    readonly file: string;
    readonly arrayIdentifier: string;
    readonly setIdentifier: string;
    readonly callLines: readonly number[];
  }[];
  readonly jsonCloneReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalExpression: string;
    readonly replacementExpression: string;
  }[];
  readonly spreadReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalReturn: string;
    readonly replacementReturn: string;
  }[];
}

export type TypesFindingKind = 'as-any' | 'double-assertion' | 'missing-return-type';

export interface TypesFindingItem {
  readonly file: string;
  readonly line: number;
  readonly kind: TypesFindingKind;
  readonly identifier?: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}

export interface TypesRefactorPlan {
  readonly version: 1;
  readonly planId: string;
  readonly targetFiles: readonly string[];
  readonly assertionReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalSnippet: string;
    readonly replacementSnippet: string;
  }[];
  readonly returnTypeInjections?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalHeader: string;
    readonly replacementHeader: string;
  }[];
}

export type DomainFindingKind =
  | 'naked-string-parameter'
  | 'unfrozen-catalog'
  | 'unbranded-id'
  | 'record-string-key';

export interface DomainFindingItem {
  readonly file: string;
  readonly line: number;
  readonly kind: DomainFindingKind;
  readonly identifier?: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}

export interface DomainRefactorPlan {
  readonly version: 1;
  readonly planId: string;
  readonly targetFiles: readonly string[];
  readonly constAssertions?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalDeclaration: string;
    readonly replacementDeclaration: string;
  }[];
  readonly brandWrappers?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalTypeDef: string;
    readonly replacementTypeDef: string;
  }[];
  readonly parameterReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalParameter: string;
    readonly replacementParameter: string;
  }[];
  readonly recordKeyReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalTypeRef: string;
    readonly replacementTypeRef: string;
    readonly importToAdd?: string;
  }[];
}

export type HygieneFindingKind = 'member-accessibility' | 'prefer-global-this' | 'no-void';

export interface HygieneFindingItem {
  readonly file: string;
  readonly line: number;
  readonly kind: HygieneFindingKind;
  readonly identifier?: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}

export interface HygieneRefactorPlan {
  readonly version: 1;
  readonly planId: string;
  readonly targetFiles: readonly string[];
  readonly accessibilityInjections?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalSnippet: string;
    readonly replacementSnippet: string;
  }[];
  readonly globalThisReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalSnippet: string;
    readonly replacementSnippet: string;
  }[];
  readonly voidReplacements?: readonly {
    readonly file: string;
    readonly line: number;
    readonly originalSnippet: string;
    readonly replacementSnippet: string;
  }[];
}
