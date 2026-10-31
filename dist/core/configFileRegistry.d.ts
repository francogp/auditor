import { AuditorConfigFileRequirement } from "./auditContract.js";
import { BaseEntityRegistry, IBaseEntityRegistry } from "./baseRegistry.js";
export type IConfigFileRegistry = IBaseEntityRegistry<AuditorConfigFileRequirement>;
export declare class ConfigFileRegistryImpl extends BaseEntityRegistry<AuditorConfigFileRequirement> implements IConfigFileRegistry {
  constructor();
  /**
   * Registers a single configuration file requirement with validation.
   */
  register(requirement: AuditorConfigFileRequirement): void;
}
/**
 * Universal singleton instance for ConfigFileRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export declare const ConfigFileRegistry: IConfigFileRegistry;
export type ConfigFileRegistry = IConfigFileRegistry;