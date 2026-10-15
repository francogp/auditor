import { AuditorHomebrewRuleId, HomebrewDetector, HomebrewFinding, HomebrewInspectionContext } from "./homebrewTypes.js";
//#region src/analyzers/homebrew/homebrewRegistry.d.ts
export declare class HomebrewDetectorRegistry {
  private static readonly detectors;
  static register(detector: HomebrewDetector): void;
  static unregister(id: string): boolean;
  static get(id: string): HomebrewDetector | undefined;
  static getAll(): readonly HomebrewDetector[];
  static clear(): void;
  static getRuleIds(): readonly AuditorHomebrewRuleId[];
  static getRuleDescriptions(): Record<AuditorHomebrewRuleId, string>;
  static getRuleRemediations(): Record<AuditorHomebrewRuleId, string>;
  static run(context: HomebrewInspectionContext, disabledDetectors?: readonly string[], onDetectorDuration?: (ruleId: AuditorHomebrewRuleId, durationMs: number) => void): HomebrewFinding[];
}
//#endregion