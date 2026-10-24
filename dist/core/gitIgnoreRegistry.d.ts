import { GitIgnoreRequirement } from "./auditContract.js";
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