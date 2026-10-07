/**
 * packages/auditor/src/cli/auditorMetadata.ts
 *
 * Dedicated metadata extractor for auditor suites and tasks.
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import path from 'node:path';
import fsSync from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BaseAuditor, DEFAULT_AUDITOR_CAPABILITIES } from "../core/auditorBase.js";
const DYNAMIC_IMPORT_TIMEOUT_MS = 2000;
export function extractStaticMetadataFromFile(fullPath) {
    const result = {
        capabilities: DEFAULT_AUDITOR_CAPABILITIES,
        gitIgnoreEntries: []
    };
    try {
        const content = fsSync.readFileSync(fullPath, 'utf-8');
        const iconMatch = content.match(/icon\s*:\s*['"]([^'"]+)['"]/);
        if (iconMatch?.[1]) {
            result.icon = iconMatch[1];
        }
        const caps = {};
        if (content.includes('requiresBuild: true'))
            caps.requiresBuild = true;
        if (content.includes('ast: true') || content.includes('requiresAst: true'))
            caps.ast = true;
        if (content.includes('fix: true'))
            caps.fix = true;
        if (content.includes('lint: true'))
            caps.lint = true;
        if (content.includes('md: true'))
            caps.md = true;
        if (content.includes('heavy: true'))
            caps.heavy = true;
        if (content.includes('changedSince: true'))
            caps.changedSince = true;
        if (content.includes('postRun: true'))
            caps.postRun = true;
        const descMatch = content.match(/description\s*:\s*['"]([^'"]+)['"]/);
        const configKeyMatch = content.match(/configKey\s*:\s*['"]([^'"]+)['"]/);
        if (Object.keys(caps).length > 0) {
            result.capabilities = {
                ...DEFAULT_AUDITOR_CAPABILITIES,
                ...caps
            };
        }
        return {
            ...result,
            description: descMatch?.[1],
            configKey: configKeyMatch?.[1]
        };
    }
    catch {
        // catch-ok: Static metadata extraction fallback
    }
    return result;
}
function extractMetadataFromAuditorInstance(val, result) {
    try {
        const instance = new val();
        if (instance?.capabilities && typeof instance.capabilities === 'object') {
            result.capabilities = instance.capabilities;
        }
        if (instance?.icon && typeof instance.icon === 'string') {
            result.icon = instance.icon;
        }
        if (Array.isArray(instance?.gitIgnoreEntries)) {
            result.gitIgnoreEntries = instance.gitIgnoreEntries;
        }
        if (typeof instance?.toManifest === 'function') {
            const manifest = instance.toManifest();
            result.manifest = manifest;
            result.description = manifest.description;
            result.ruleDescriptions = manifest.rules;
            result.configKey = manifest.configKey;
            result.defaultConfig = manifest.defaultConfig;
        }
        else if (instance?.description) {
            result.description = instance.description;
            result.ruleDescriptions = instance.ruleDescriptions;
            result.configKey = instance.configKey;
            result.defaultConfig = instance.defaultConfig;
        }
    }
    catch {
        // catch-ok: Sub-auditor constructor may require specific options
    }
}
function extractMetadataFromFunction(val, result) {
    if (typeof val !== 'function')
        return;
    const withStatic = val;
    if (withStatic.capabilities && typeof withStatic.capabilities === 'object') {
        result.capabilities = {
            ...DEFAULT_AUDITOR_CAPABILITIES,
            ...withStatic.capabilities
        };
    }
    if (typeof withStatic.icon === 'string') {
        result.icon = withStatic.icon;
    }
    if (Array.isArray(withStatic.gitIgnoreEntries)) {
        result.gitIgnoreEntries = withStatic.gitIgnoreEntries;
    }
    if (val.prototype instanceof BaseAuditor) {
        extractMetadataFromAuditorInstance(val, result);
    }
}
export async function extractAuditorMetadataFromFile(fullPath) {
    const result = {
        capabilities: DEFAULT_AUDITOR_CAPABILITIES,
        gitIgnoreEntries: []
    };
    // Self-import guard: Never dynamically import the currently executing script to prevent circular top-level await deadlock
    const scriptArg = process.argv[1];
    if (scriptArg) {
        const currentScriptBase = path.basename(scriptArg, path.extname(scriptArg)).toLowerCase();
        const targetScriptBase = path.basename(fullPath, path.extname(fullPath)).toLowerCase();
        if (currentScriptBase === targetScriptBase) {
            return extractStaticMetadataFromFile(fullPath);
        }
    }
    let timer;
    try {
        const fileUrl = pathToFileURL(fullPath).href;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Import timeout for ${fullPath}`)), DYNAMIC_IMPORT_TIMEOUT_MS);
            if (timer.unref)
                timer.unref();
        });
        const mod = (await Promise.race([import(__rewriteRelativeImportExtension(fileUrl)), timeoutPromise])); // open-record: Generic dynamic ESM module namespace object
        if (typeof mod.icon === 'string') {
            result.icon = mod.icon;
        }
        if (Array.isArray(mod.gitIgnoreEntries)) {
            result.gitIgnoreEntries = mod.gitIgnoreEntries;
        }
        else if (Array.isArray(mod.GITIGNORE_ENTRIES)) {
            result.gitIgnoreEntries = mod.GITIGNORE_ENTRIES;
        }
        for (const val of Object.values(mod)) {
            extractMetadataFromFunction(val, result);
        }
    }
    catch {
        // catch-ok: Dynamic import failed or timed out, fallback to static analysis
        return extractStaticMetadataFromFile(fullPath);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    return result;
}
//# sourceMappingURL=auditorMetadata.js.map