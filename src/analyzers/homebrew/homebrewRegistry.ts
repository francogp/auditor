/**
 * src/analyzers/homebrew/homebrewRegistry.ts
 *
 * Dynamic registry and runner coordinator for homebrew detectors.
 */

import type {
  AuditorHomebrewRuleId,
  HomebrewDetector,
  HomebrewFinding,
  HomebrewInspectionContext
} from './homebrewTypes.ts';

export class HomebrewDetectorRegistry {
  private static readonly detectors = new Map<string, HomebrewDetector>();

  public static register(detector: HomebrewDetector): void {
    this.detectors.set(detector.id, detector);
  }

  public static unregister(id: string): boolean {
    return this.detectors.delete(id);
  }

  public static get(id: string): HomebrewDetector | undefined {
    return this.detectors.get(id);
  }

  public static getAll(): readonly HomebrewDetector[] {
    return Array.from(this.detectors.values());
  }

  public static clear(): void {
    this.detectors.clear();
  }

  public static getRuleIds(): readonly AuditorHomebrewRuleId[] {
    const ids = new Set<AuditorHomebrewRuleId>();
    for (const d of this.detectors.values()) {
      ids.add(d.ruleId);
    }
    return Array.from(ids);
  }

  public static getRuleDescriptions(): Record<AuditorHomebrewRuleId, string> {
    const descriptions: Record<string, string> = {};
    for (const d of this.detectors.values()) {
      descriptions[d.ruleId] = d.ruleDescription;
    }
    return descriptions as Record<AuditorHomebrewRuleId, string>;
  }

  public static run(
    context: HomebrewInspectionContext,
    disabledDetectors: readonly string[] = []
  ): HomebrewFinding[] {
    // Whole file exemption check
    if (
      context.content.includes('// homebrew-ok: all') ||
      context.content.includes('// homebrew-exempt')
    ) {
      return [];
    }

    const disabledSet = new Set(disabledDetectors);
    const findings: HomebrewFinding[] = [];

    for (const detector of this.detectors.values()) {
      if (disabledSet.has(detector.id)) continue;

      const detectorFindings = detector.detect(context);
      for (const finding of detectorFindings) {
        const lineIdx = finding.line - 1;
        const lineText = context.lines[lineIdx] ?? '';
        const prevLineText = lineIdx > 0 ? (context.lines[lineIdx - 1] ?? '') : '';

        // Line-level or previous-line exemption check
        if (
          lineText.includes('// homebrew-ok:') ||
          lineText.includes('// homebrew-ok') ||
          prevLineText.includes('// homebrew-ok:') ||
          prevLineText.includes('// homebrew-ok') ||
          (finding.ruleId === 'auditor-raw-console' &&
            (lineText.includes('// console-ok:') || prevLineText.includes('// console-ok:')))
        ) {
          continue;
        }

        findings.push(finding);
      }
    }

    return findings;
  }
}
