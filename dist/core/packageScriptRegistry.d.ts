import { AuditorPackageScriptRequirement } from "./auditContract.js";
import { BaseEntityRegistry, IBaseEntityRegistry } from "./baseRegistry.js";
export declare const CORE_PACKAGE_SCRIPT_REQUIREMENTS: readonly AuditorPackageScriptRequirement[];
export interface IPackageScriptRegistry extends IBaseEntityRegistry<AuditorPackageScriptRequirement> {
  register(requirement: AuditorPackageScriptRequirement, sourceId?: string): void;
  registerMany(requirements: readonly AuditorPackageScriptRequirement[], sourceId?: string): void;
}
export declare class PackageScriptRegistryImpl extends BaseEntityRegistry<AuditorPackageScriptRequirement> implements IPackageScriptRegistry {
  constructor();
  /**
   * Registers a single package script requirement with command collision verification.
   * Throws an explicit error if a script name collides with another registered command.
   */
  register(requirement: AuditorPackageScriptRequirement, sourceId?: string): void;
  /**
   * Registers multiple package script requirements.
   */
  registerMany(requirements: readonly AuditorPackageScriptRequirement[], sourceId?: string): void;
}
/**
 * Universal singleton instance for PackageScriptRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export declare const PackageScriptRegistry: IPackageScriptRegistry;
export type PackageScriptRegistry = IPackageScriptRegistry;
/**
 * Builds the canonical runner command for an AuditorPackageScriptRequirement,
 * dynamically appending required runtime flags or permissions (e.g. --allow-addons) if specified.
 */
export declare function buildCanonicalRunnerCommand(requirement: AuditorPackageScriptRequirement): string;