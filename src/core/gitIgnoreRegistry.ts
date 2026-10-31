/**
 * packages/auditor/src/core/gitIgnoreRegistry.ts
 *
 * CENTRALIZED GITIGNORE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows the core framework, built-in sub-auditors, and user-extended modules
 * to dynamically register required .gitignore patterns without hardcoded lists.
 */

import type { GitIgnoreRequirement } from './auditContract.ts';
import { BaseEntityRegistry, type IBaseEntityRegistry } from './baseRegistry.ts';

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

export type IGitIgnoreRegistry = IBaseEntityRegistry<GitIgnoreRequirement>;

export class GitIgnoreRegistryImpl
  extends BaseEntityRegistry<GitIgnoreRequirement>
  implements IGitIgnoreRegistry
{
  public constructor() {
    super(
      (req) => req?.id,
      (reg) => {
        for (const req of CORE_GITIGNORE_REQUIREMENTS) {
          reg.register(req);
        }
      }
    );
  }

  /**
   * Registers a single gitignore requirement with validation.
   */
  public override register(requirement: GitIgnoreRequirement): void {
    if (!requirement || !requirement.id || !requirement.pattern) return;
    super.register(requirement);
  }
}

/**
 * Universal singleton instance for GitIgnoreRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export const GitIgnoreRegistry: IGitIgnoreRegistry = new GitIgnoreRegistryImpl();
export type GitIgnoreRegistry = IGitIgnoreRegistry;
