/**
 * scripts/maintenance/analyzers/doxAnalyzer.ts
 *
 * Checks AGENTS.md / DOX hierarchy, relative links, and documentation integrity.
 */
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';
export declare const DOX_ANALYZER_DESCRIPTOR: RuleDescriptor;
export declare function validateDoxSectionStructure(agentsPath: string, rootDir: string, content: string): Violation[];
export declare function checkDoxIntegrity(rootDir: string, ignoreDirs: ReadonlySet<string>): Promise<Violation[]>;
//# sourceMappingURL=doxAnalyzer.d.ts.map