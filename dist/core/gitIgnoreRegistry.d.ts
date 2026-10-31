import { GitIgnoreRequirement } from "./auditContract.js";
import { BaseEntityRegistry, IBaseEntityRegistry } from "./baseRegistry.js";
export declare const CORE_GITIGNORE_REQUIREMENTS: readonly GitIgnoreRequirement[];
export type IGitIgnoreRegistry = IBaseEntityRegistry<GitIgnoreRequirement>;
export declare class GitIgnoreRegistryImpl extends BaseEntityRegistry<GitIgnoreRequirement> implements IGitIgnoreRegistry {
  constructor();
  /**
   * Registers a single gitignore requirement with validation.
   */
  register(requirement: GitIgnoreRequirement): void;
}
/**
 * Universal singleton instance for GitIgnoreRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export declare const GitIgnoreRegistry: IGitIgnoreRegistry;
export type GitIgnoreRegistry = IGitIgnoreRegistry;