import { AuditorPackageScriptRequirement } from "./auditContract.js";
//#region src/core/packageScriptRegistry.d.ts
export declare const CORE_PACKAGE_SCRIPT_REQUIREMENTS: readonly AuditorPackageScriptRequirement[];
export declare class PackageScriptRegistry {
  private static readonly requirements;
  /**
   * Registers a single package script requirement.
   * Throws an explicit error if a script name collides with another registered command.
   */
  static register(requirement: AuditorPackageScriptRequirement, sourceId?: string): void;
  /**
   * Registers multiple package script requirements.
   */
  static registerMany(requirements: readonly AuditorPackageScriptRequirement[], sourceId?: string): void;
  /**
   * Retrieves a registered package script requirement by script name.
   */
  static get(name: string): AuditorPackageScriptRequirement | undefined;
  /**
   * Checks whether a package script requirement is already registered.
   */
  static has(name: string): boolean;
  /**
   * Returns all currently registered package script requirements.
   */
  static getAll(): readonly AuditorPackageScriptRequirement[];
  /**
   * Resets the registry back to core framework defaults.
   */
  static reset(): void;
}
//#endregion