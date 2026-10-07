/**
 * packages/auditor/src/core/configFileRegistry.ts
 *
 * CENTRALIZED CONFIGURATION FILE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows built-in sub-auditors and user-extended modules to dynamically
 * declare their required configuration files and canonical auto-scaffolding logic.
 */

import type { AuditorConfigFileRequirement } from './auditContract.ts';

export class ConfigFileRegistry {
  private static readonly requirements: Map<string, AuditorConfigFileRequirement<string>> = new Map();

  /**
   * Registers a single configuration file requirement.
   */
  public static register(requirement: AuditorConfigFileRequirement<string>): void {
    if (!requirement || !requirement.id || !requirement.file) return;
    this.requirements.set(requirement.id, requirement);
  }

  /**
   * Registers multiple configuration file requirements.
   */
  public static registerMany(requirements: readonly AuditorConfigFileRequirement<string>[]): void {
    for (const req of requirements) {
      this.register(req);
    }
  }

  /**
   * Retrieves a registered configuration file requirement by its ID.
   */
  public static get(id: string): AuditorConfigFileRequirement<string> | undefined {
    return this.requirements.get(id);
  }

  /**
   * Returns all currently registered configuration file requirements.
   */
  public static getAll(): readonly AuditorConfigFileRequirement<string>[] {
    return Array.from(this.requirements.values());
  }

  /**
   * Clears all registered configuration requirements (used in test isolation).
   */
  public static reset(): void {
    this.requirements.clear();
  }
}
