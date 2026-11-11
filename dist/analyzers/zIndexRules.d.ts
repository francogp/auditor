import "../core/auditConfig.js";
import { Z_LAYERS } from "../core/auditZLayers.js";
import { CANONICAL_Z_LAYERS } from "../modals/modalZLayers.js";
import { AuditRule, RuleDescriptor } from "./auditRuleTypes.js";
export declare const Z_INDEX_CONSISTENCY_DESCRIPTOR: RuleDescriptor;
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
export declare function resolveZLayer(val: number, layers?: Readonly<Record<string, number>>): ZLayerResolution;
export declare function fixZIndexLiteral(match: string, layers?: Readonly<Record<string, number>>): string;
export declare const zIndexAudit: AuditRule;
export declare const zIndexConstantDeclaration: AuditRule;
export { CANONICAL_Z_LAYERS, Z_LAYERS };