/**
 * packages/auditor/src/core/gitIgnoreRegistry.ts
 *
 * CENTRALIZED GITIGNORE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows the core framework, built-in sub-auditors, and user-extended modules
 * to dynamically register required .gitignore patterns without hardcoded lists.
 */
import type { GitIgnoreRequirement } from './auditContract.ts';
export declare const CORE_GITIGNORE_REQUIREMENTS: readonly GitIgnoreRequirement[];
export declare class GitIgnoreRegistry {
    private static readonly requirements;
    /**
     * Registers a single gitignore requirement.
     */
    static register(requirement: GitIgnoreRequirement): void;
    /**
     * Registers multiple gitignore requirements.
     */
    static registerMany(requirements: readonly GitIgnoreRequirement[]): void;
    /**
     * Returns all currently registered gitignore requirements.
     */
    static getRequirements(): GitIgnoreRequirement[];
    /**
     * Resets the registry back to core framework defaults.
     */
    static reset(): void;
}
//# sourceMappingURL=gitIgnoreRegistry.d.ts.map