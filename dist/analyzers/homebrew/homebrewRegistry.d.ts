/**
 * src/analyzers/homebrew/homebrewRegistry.ts
 *
 * Dynamic registry and runner coordinator for homebrew detectors.
 */
import type { AuditorHomebrewRuleId, HomebrewDetector, HomebrewFinding, HomebrewInspectionContext } from './homebrewTypes.ts';
export declare class HomebrewDetectorRegistry {
    private static readonly detectors;
    static register(detector: HomebrewDetector): void;
    static unregister(id: string): boolean;
    static get(id: string): HomebrewDetector | undefined;
    static getAll(): readonly HomebrewDetector[];
    static clear(): void;
    static getRuleIds(): readonly AuditorHomebrewRuleId[];
    static getRuleDescriptions(): Record<AuditorHomebrewRuleId, string>;
    static run(context: HomebrewInspectionContext, disabledDetectors?: readonly string[]): HomebrewFinding[];
}
//# sourceMappingURL=homebrewRegistry.d.ts.map