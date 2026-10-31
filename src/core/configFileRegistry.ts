/**
 * packages/auditor/src/core/configFileRegistry.ts
 *
 * CENTRALIZED CONFIGURATION FILE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows built-in sub-auditors and user-extended modules to dynamically
 * declare their required configuration files and canonical auto-scaffolding logic.
 */

import type { AuditorConfigFileRequirement } from './auditContract.ts';
import { BaseEntityRegistry, type IBaseEntityRegistry } from './baseRegistry.ts';

export type IConfigFileRegistry = IBaseEntityRegistry<AuditorConfigFileRequirement>;

export class ConfigFileRegistryImpl
  extends BaseEntityRegistry<AuditorConfigFileRequirement>
  implements IConfigFileRegistry
{
  public constructor() {
    super((req) => req?.id);
  }

  /**
   * Registers a single configuration file requirement with validation.
   */
  public override register(requirement: AuditorConfigFileRequirement): void {
    if (!requirement?.file) return;
    super.register(requirement);
  }
}

/**
 * Universal singleton instance for ConfigFileRegistry.
 * Inherits directly from BaseEntityRegistry to eliminate Middle Man delegation.
 */
export const ConfigFileRegistry: IConfigFileRegistry = new ConfigFileRegistryImpl();
export type ConfigFileRegistry = IConfigFileRegistry;
