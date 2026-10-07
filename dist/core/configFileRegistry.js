/**
 * packages/auditor/src/core/configFileRegistry.ts
 *
 * CENTRALIZED CONFIGURATION FILE REQUIREMENTS REGISTRY (Node.js 26+ Native)
 * Allows built-in sub-auditors and user-extended modules to dynamically
 * declare their required configuration files and canonical auto-scaffolding logic.
 */
export class ConfigFileRegistry {
    static requirements = new Map();
    /**
     * Registers a single configuration file requirement.
     */
    static register(requirement) {
        if (!requirement || !requirement.id || !requirement.file)
            return;
        this.requirements.set(requirement.id, requirement);
    }
    /**
     * Registers multiple configuration file requirements.
     */
    static registerMany(requirements) {
        for (const req of requirements) {
            this.register(req);
        }
    }
    /**
     * Retrieves a registered configuration file requirement by its ID.
     */
    static get(id) {
        return this.requirements.get(id);
    }
    /**
     * Returns all currently registered configuration file requirements.
     */
    static getAll() {
        return Array.from(this.requirements.values());
    }
    /**
     * Clears all registered configuration requirements (used in test isolation).
     */
    static reset() {
        this.requirements.clear();
    }
}
//# sourceMappingURL=configFileRegistry.js.map