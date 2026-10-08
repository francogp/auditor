/**
 * packages/auditor/src/plugin/defineAuditorExtension.ts
 *
 * AUDITOR EXTENSION PROTOCOL (Node.js 26+)
 * Contract and helper functions for defining and registering project-specific audit extensions.
 */
import { PackageScriptRegistry } from "../core/packageScriptRegistry.js";
export function defineAuditorExtension(definition) {
    if (!definition.id) {
        throw new Error('Auditor extension must define an id');
    }
    if (!definition.auditorClass && !definition.factory && (!definition.scripts || definition.scripts.length === 0)) {
        throw new Error(`Auditor extension [${definition.id}] must define a mandatory 'scripts' contract exposing how it is executed via CLI / package.json.`);
    }
    if (definition.scripts && definition.scripts.length > 0) {
        PackageScriptRegistry.registerMany(definition.scripts, definition.id);
    }
    return definition;
}
//# sourceMappingURL=defineAuditorExtension.js.map