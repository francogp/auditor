import { RemediationPhaseId } from "../../core/remediationPhases.js";
import "../../core/auditContract.js";
import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export declare const FILE_ENCODING_RULES: readonly ["file-encoding-invalid-charset", "file-encoding-unwanted-bom", "file-encoding-mojibake-detected"];
export type FileEncodingRuleId = (typeof FILE_ENCODING_RULES)[number];
export declare const FILE_ENCODING_RULE_DESCRIPTIONS: Record<FileEncodingRuleId, string>;
export declare const FILE_ENCODING_RULE_REMEDIATIONS: Record<FileEncodingRuleId, string>;
export declare const FILE_ENCODING_RULE_REMEDIATION_PHASES: Record<FileEncodingRuleId, RemediationPhaseId>;
export declare const DEFAULT_TEXT_EXTENSIONS: Set<string>;
export declare const KNOWN_BINARY_EXTENSIONS: Set<string>;
export type FileEncodingRepairAction = 'strip-utf8-bom' | 'transcode-utf16le' | 'transcode-utf16be' | 'transcode-win1252';
export interface EncodingInspectionIssue {
  readonly ruleId: FileEncodingRuleId;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly context: string;
  readonly line?: number;
  readonly col?: number;
  readonly repairAction?: FileEncodingRepairAction;
}
export declare function isLikelyUtf16LeWithoutBom(buffer: Buffer): boolean;
export declare function isBinaryBuffer(buffer: Buffer): boolean;
export declare function inspectBufferEncoding(buffer: Buffer, options?: {
  prohibitBom?: boolean;
  detectMojibake?: boolean;
}): EncodingInspectionIssue | null;
export declare class ValidateFileEncodingAuditor extends FileScanAuditor<FileEncodingRuleId> {
  constructor(options?: FileScanRootsOptions);
  runAudit(): Promise<void>;
  private applyRepair;
}