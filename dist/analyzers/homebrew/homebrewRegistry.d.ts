import { BaseEntityRegistry, IBaseEntityRegistry } from "../../core/baseRegistry.js";
import { AuditorHomebrewRuleId, HomebrewDetector, HomebrewFinding, HomebrewInspectionContext } from "./homebrewTypes.js";
export interface IHomebrewDetectorRegistry extends IBaseEntityRegistry<HomebrewDetector> {
  scanFile(file: string, context: HomebrewInspectionContext): readonly HomebrewFinding[];
  scanAll(context: HomebrewInspectionContext): readonly HomebrewFinding[];
  getRuleIds(): readonly AuditorHomebrewRuleId[];
  getRuleDescriptions(): Record<AuditorHomebrewRuleId, string>;
  getRuleRemediations(): Record<AuditorHomebrewRuleId, string>;
  run(context: HomebrewInspectionContext, disabledDetectors?: readonly string[], onDetectorDuration?: (ruleId: AuditorHomebrewRuleId, durationMs: number) => void): HomebrewFinding[];
}
export declare class HomebrewDetectorRegistryImpl extends BaseEntityRegistry<HomebrewDetector> implements IHomebrewDetectorRegistry {
  constructor();
  scanFile(file: string, context: HomebrewInspectionContext): readonly HomebrewFinding[];
  scanAll(context: HomebrewInspectionContext): readonly HomebrewFinding[];
  getRuleIds(): readonly AuditorHomebrewRuleId[];
  getRuleDescriptions(): Record<AuditorHomebrewRuleId, string>;
  getRuleRemediations(): Record<AuditorHomebrewRuleId, string>;
  run(context: HomebrewInspectionContext, disabledDetectors?: readonly string[], onDetectorDuration?: (ruleId: AuditorHomebrewRuleId, durationMs: number) => void): HomebrewFinding[];
}
/**
 * Universal singleton instance for HomebrewDetectorRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export declare const HomebrewDetectorRegistry: IHomebrewDetectorRegistry;
export type HomebrewDetectorRegistry = IHomebrewDetectorRegistry;