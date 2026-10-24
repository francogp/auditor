import { AuditRule, RuleDescriptor } from "./auditRuleTypes.js";
import { Z_LAYERS } from "../core/auditZLayers.js";
export declare const Z_INDEX_CONSISTENCY_DESCRIPTOR: RuleDescriptor;
export declare const CANONICAL_DEFAULT_Z_LAYERS: Record<string, number>;
export declare const ACTIVE_Z_LAYERS: Record<string, number>;
export declare const Z_VALUE_MAP: {
  [k: string]: string;
};
export declare const Z_SORTED_ENTRIES: [string, number][];
export interface ZLayerResolution {
  exactKey?: string;
  nearestKey?: string;
  offset?: number;
  cssVarExpr?: string;
}
export declare function resolveZLayer(val: number): ZLayerResolution;
export declare function fixZIndexLiteral(match: string): string;
export declare const zIndexAudit: AuditRule;
export declare const zIndexConstantDeclaration: AuditRule;
export { Z_LAYERS };