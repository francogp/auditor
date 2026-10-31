/**
 * src/analyzers/homebrew/homebrewRegistry.ts
 *
 * Dynamic registry and runner coordinator for homebrew detectors.
 * Inherits directly from BaseEntityRegistry to unify in-memory lifecycle and isolation.
 */

import { BaseEntityRegistry, type IBaseEntityRegistry } from '../../core/baseRegistry.ts';
import type {
  AuditorHomebrewRuleId,
  HomebrewDetector,
  HomebrewFinding,
  HomebrewInspectionContext
} from './homebrewTypes.ts';

export interface IHomebrewDetectorRegistry extends IBaseEntityRegistry<HomebrewDetector> {
  scanFile(file: string, context: HomebrewInspectionContext): readonly HomebrewFinding[];
  scanAll(context: HomebrewInspectionContext): readonly HomebrewFinding[];
  getRuleIds(): readonly AuditorHomebrewRuleId[];
  getRuleDescriptions(): Record<AuditorHomebrewRuleId, string>;
  getRuleRemediations(): Record<AuditorHomebrewRuleId, string>;
  run(
    context: HomebrewInspectionContext,
    disabledDetectors?: readonly string[],
    onDetectorDuration?: (ruleId: AuditorHomebrewRuleId, durationMs: number) => void
  ): HomebrewFinding[];
}

export class HomebrewDetectorRegistryImpl
  extends BaseEntityRegistry<HomebrewDetector>
  implements IHomebrewDetectorRegistry
{
  public constructor() {
    super((d) => d.id);
  }

  public scanFile(file: string, context: HomebrewInspectionContext): readonly HomebrewFinding[] {
    const effectiveContext = context.filePath === file ? context : { ...context, filePath: file };
    return this.run(effectiveContext);
  }

  public scanAll(context: HomebrewInspectionContext): readonly HomebrewFinding[] {
    return this.run(context);
  }

  public getRuleIds(): readonly AuditorHomebrewRuleId[] {
    const ids = new Set<AuditorHomebrewRuleId>();
    for (const d of this.getAll()) {
      ids.add(d.ruleId);
    }
    return Array.from(ids);
  }

  public getRuleDescriptions(): Record<AuditorHomebrewRuleId, string> {
    const descriptions: Record<string, string> = {};
    for (const d of this.getAll()) {
      descriptions[d.ruleId] = d.ruleDescription;
    }
    return descriptions;
  }

  public getRuleRemediations(): Record<AuditorHomebrewRuleId, string> {
    const remediations: Record<string, string> = {
      'auditor-manual-package-json':
        'Use the canonical getPackageJson(projectRoot) utility from src/core/packageJson.ts instead of manually reading or parsing package.json.',
      'auditor-manual-vue-sfc-regex':
        'Use AuditedDocument or parseVueSfc() from core to analyze Vue SFC blocks instead of fragile manual regular expressions.',
      'auditor-manual-ts-ast':
        'Use SharedAstContext or getAstContext(projectRoot) to reuse TypeScript AST instead of manually compiling or parsing files.',
      'auditor-raw-console':
        'Replace direct calls to console.log/error/warn with this.addViolation(), this.renderTable(), or authorized printTerminal().',
      'auditor-manual-comment-stripping':
        'Use canonical stripComments() from src/core/ or TypeScript AST instead of manual regexes to strip comments.',
      'auditor-manual-brace-counting':
        'Use canonical AST parser or extractBlocks() to balance braces instead of error-prone manual counters.',
      'auditor-manual-file-walker':
        'Inherit from FileScanAuditor or use this.context.collectFiles() instead of traversing the filesystem with manual walkers.',
      'auditor-homebrew-predicates':
        'Import canonical predicates from src/core/auditTestPredicates.ts or src/core/auditConfig.ts instead of reimplementing test checks.',
      'auditor-manual-rule-timing':
        'Wrap rule execution with this.runRuleMeasured(ruleId, () => ...) to record execution durations instead of manual timers.',
      'auditor-hardcoded-config':
        'Resolve paths, directories, and configurations dynamically from audit.config.ts without hardcoded filenames or constants.',
      'auditor-manual-step-logging':
        'Remove sequential step logging ([1/6], [2/6]) inside sub-auditors; streaming runner manages lifecycle and visual progress.',
      'auditor-unmeasured-rule':
        'Wrap rule evaluation with this.runRuleMeasured() or reportRuleDuration() to ensure measurement and performance telemetry.',
      'auditor-redundant-rule-evaluated':
        'Remove redundant markRuleEvaluated() calls when the rule is already measured automatically via runRuleMeasured().',
      'auditor-third-party-tool-contract':
        'Declare usesThirdPartyTool: true with thirdPartyToolPolicy ({ toolName, fallbackBehavior, fallbackRuleId }) in constructor when running external tools, or usesThirdPartyTool: false for native analyzers.',
      'auditor-inefficient-file-scan':
        'Avoid iterating rules before files or passing blind wildcards (**/*.ext) to external CLIs; use this.scanFilesSinglePass(), FileScanAuditor, or pass the list of files discovered by auditor.'
    };
    return remediations;
  }

  public run(
    context: HomebrewInspectionContext,
    disabledDetectors: readonly string[] = [],
    onDetectorDuration?: (ruleId: AuditorHomebrewRuleId, durationMs: number) => void
  ): HomebrewFinding[] {
    const disabledSet = new Set(disabledDetectors);
    const findings: HomebrewFinding[] = [];

    for (const detector of this.getAll()) {
      if (disabledSet.has(detector.id)) continue;

      const t0 = performance.now();
      const detectorFindings = detector.detect(context);
      if (onDetectorDuration) {
        onDetectorDuration(detector.ruleId, performance.now() - t0);
      }
      for (const finding of detectorFindings) {
        findings.push(finding);
      }
    }

    return findings;
  }
}

/**
 * Universal singleton instance for HomebrewDetectorRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export const HomebrewDetectorRegistry: IHomebrewDetectorRegistry =
  new HomebrewDetectorRegistryImpl();
export type HomebrewDetectorRegistry = IHomebrewDetectorRegistry;
