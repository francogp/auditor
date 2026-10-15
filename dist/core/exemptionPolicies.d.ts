import { AuditEngineConfig } from "./auditConfigTypes.js";
//#region src/core/exemptionPolicies.d.ts
export declare const STRUCTURAL_EXEMPTION_POLICIES: readonly ["test"];
export declare const EXEMPTION_POLICY_IDS: readonly ["cli", "scripts", "data", "demo", "exemptFiles", "test"];
export type ExemptionPolicyId = (typeof EXEMPTION_POLICY_IDS)[number];
export declare const EXEMPTION_POLICY_KINDS: readonly ["configured", "structural"];
export type ExemptionPolicyKind = (typeof EXEMPTION_POLICY_KINDS)[number];
export interface ExemptionPolicy {
  readonly id: ExemptionPolicyId;
  readonly kind: ExemptionPolicyKind;
  /** Configuration key that drives the policy (shown to the developer). */
  readonly configKey: string;
  /** What gets silenced for matching files (Spanish, terminal-facing). */
  readonly silences: string;
  readonly matches: (relPosixPath: string, config: AuditEngineConfig) => boolean;
}
export declare function isCodeFile(relPosixPath: string): boolean;
export declare const EXEMPTION_POLICIES: readonly ExemptionPolicy[];
/** Every policy matching the given file, in registry order. */
export declare function getMatchingExemptionPolicies(relPosixPath: string, config?: AuditEngineConfig): ExemptionPolicy[];
//#endregion