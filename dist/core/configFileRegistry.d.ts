/**
 * packages/auditor/src/core/configFileRegistry.ts
 *
 * CENTRALIZED CONFIGURATION FILE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows built-in sub-auditors and user-extended modules to dynamically
 * declare their required configuration files and canonical auto-scaffolding logic.
 */
import type { AuditorConfigFileRequirement } from './auditContract.ts';
export declare class ConfigFileRegistry {
    private static readonly requirements;
    /**
     * Registers a single configuration file requirement.
     */
    static register(requirement: AuditorConfigFileRequirement<string>): void;
    /**
     * Registers multiple configuration file requirements.
     */
    static registerMany(requirements: readonly AuditorConfigFileRequirement<string>[]): void;
    /**
     * Retrieves a registered configuration file requirement by its ID.
     */
    static get(id: string): AuditorConfigFileRequirement<string> | undefined;
    /**
     * Returns all currently registered configuration file requirements.
     */
    static getAll(): readonly AuditorConfigFileRequirement<string>[];
    /**
     * Clears all registered configuration requirements (used in test isolation).
     */
    static reset(): void;
}
//# sourceMappingURL=configFileRegistry.d.ts.map