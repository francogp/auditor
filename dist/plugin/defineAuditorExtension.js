import { PackageScriptRegistry } from "../core/packageScriptRegistry.js";
//#region src/plugin/defineAuditorExtension.ts
function defineAuditorExtension(definition) {
	if (!definition.id) throw new Error("Auditor extension must define an id");
	if (!definition.auditorClass && !definition.factory && (!definition.scripts || definition.scripts.length === 0)) throw new Error(`Auditor extension [${definition.id}] must define a mandatory 'scripts' contract exposing how it is executed via CLI / package.json.`);
	if (definition.scripts && definition.scripts.length > 0) PackageScriptRegistry.registerMany(definition.scripts, definition.id);
	return definition;
}
//#endregion
export { defineAuditorExtension };
