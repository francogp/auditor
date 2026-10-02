/**
 * scripts/maintenance/analyzers/cssAnalyzer.ts
 *
 * Runs css-checker against CSS/SCSS and Vue style blocks to detect duplicate CSS classes.
 */
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';
export declare const CSS_ANALYZER_DESCRIPTOR: RuleDescriptor;
export declare function getCssCheckerCmd(): string | null;
export declare function runCssChecker(targetDir: string | undefined, ignoreDirs: ReadonlySet<string>): Promise<Violation[]>;
//# sourceMappingURL=cssAnalyzer.d.ts.map