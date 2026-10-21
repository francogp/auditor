/**
 * packages/auditor/src/core/gitIgnoreRegistry.ts
 *
 * CENTRALIZED GITIGNORE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows the core framework, built-in sub-auditors, and user-extended modules
 * to dynamically register required .gitignore patterns without hardcoded lists.
 */

import type { GitIgnoreRequirement } from './auditContract.ts';

export const CORE_GITIGNORE_REQUIREMENTS: readonly GitIgnoreRequirement[] = [
  {
    id: 'node_modules',
    pattern: 'node_modules/',
    samplePath: 'node_modules/package/index.js',
    reason: 'Installed npm dependencies directory',
    isApplicable: () => true
  },
  {
    id: 'scratch',
    pattern: 'scratch/',
    samplePath: 'scratch/latest_audit.json',
    reason: 'Universal directory for auditor scratch reports, caches, and ephemeral artifacts',
    isApplicable: () => true
  },
  {
    id: '*.log',
    pattern: '*.log',
    samplePath: 'npm-debug.log',
    reason: 'Execution logs and debug dump files from CLI and Node.js',
    isApplicable: () => true
  }
];

export class GitIgnoreRegistry {
  private static readonly requirements: Map<string, GitIgnoreRequirement> = new Map();

  static {
    this.reset();
  }

  /**
   * Registers a single gitignore requirement.
   */
  public static register(requirement: GitIgnoreRequirement): void {
    if (!requirement || !requirement.id || !requirement.pattern) return;
    this.requirements.set(requirement.id, requirement);
  }

  /**
   * Registers multiple gitignore requirements.
   */
  public static registerMany(requirements: readonly GitIgnoreRequirement[]): void {
    for (const req of requirements) {
      this.register(req);
    }
  }

  /**
   * Returns all currently registered gitignore requirements.
   */
  public static getRequirements(): GitIgnoreRequirement[] {
    return Array.from(this.requirements.values());
  }

  /**
   * Resets the registry back to core framework defaults.
   */
  public static reset(): void {
    this.requirements.clear();
    for (const req of CORE_GITIGNORE_REQUIREMENTS) {
      this.requirements.set(req.id, req);
    }
  }
}
