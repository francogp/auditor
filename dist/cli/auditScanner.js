/**
 * packages/auditor/src/cli/auditScanner.ts
 *
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveFamilyMetadata, getActiveFamilies, FALLBACK_FAMILY_ORDER } from "../core/auditContract.js";
import { loadAuditConfig } from "../core/auditConfig.js";
import { BaseAuditor, DEFAULT_AUDITOR_CAPABILITIES } from "../core/auditorBase.js";
import { GitIgnoreRegistry } from "../core/gitIgnoreRegistry.js";
const BUILTIN_SUITES_DIR = path.resolve(import.meta.dirname, '../suites');
const DEFAULT_TIMEOUT_MS = 0; // 0 = disabled: zero arbitrary timeouts by default
const DYNAMIC_IMPORT_TIMEOUT_MS = 2000;
function getTimeoutForTask(_filename, configRunnerTimeout) {
    return configRunnerTimeout ?? DEFAULT_TIMEOUT_MS;
}
export const AUDIT_PRESETS = {};
function extractStaticMetadataFromFile(fullPath) {
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
        if (Object.keys(caps).length > 0) {
            result.capabilities = {
                ...DEFAULT_AUDITOR_CAPABILITIES,
                ...caps
            };
        }
    }
    catch {
        // catch-ok: Static metadata extraction fallback
    }
    return result;
}
export async function extractAuditorMetadataFromFile(fullPath) {
    const result = {
        capabilities: DEFAULT_AUDITOR_CAPABILITIES,
        gitIgnoreEntries: []
    };
    if (fullPath.endsWith('validate_audit_config.ts') || fullPath.endsWith('validate_audit_config.js')) {
        result.capabilities = { ...DEFAULT_AUDITOR_CAPABILITIES, fix: true, lint: true };
        result.icon = '⚙️';
        return result;
    }
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
        const mod = (await Promise.race([import(__rewriteRelativeImportExtension(fileUrl)), timeoutPromise]));
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
            if (typeof val === 'function') {
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
                    }
                    catch {
                        // catch-ok: Sub-auditor constructor may require specific options
                    }
                }
            }
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
export async function extractCapabilitiesFromFile(fullPath) {
    return (await extractAuditorMetadataFromFile(fullPath)).capabilities;
}
export async function extractGitIgnoreRequirementsFromFile(fullPath) {
    return (await extractAuditorMetadataFromFile(fullPath)).gitIgnoreEntries;
}
const DEFAULT_PERMISSIONS = [
    '--permission',
    '--experimental-strip-types',
    '--allow-fs-read=*',
    '--allow-fs-write=*',
    '--allow-child-process',
    '--allow-addons'
];
function getPermissionsForTask(filename, fullPath) {
    const perms = [...DEFAULT_PERMISSIONS]; // no-domain: Non-domain utility collection or data structure
    if (fullPath && fullPath.endsWith('.js')) {
        const stripIdx = perms.indexOf('--experimental-strip-types');
        if (stripIdx !== -1) {
            perms.splice(stripIdx, 1);
        }
    }
    if (filename.includes('audit_project') || filename.includes('convert_assets')) {
        perms.push('--allow-worker');
    }
    return perms;
}
/** Convert snake_case or kebab-case filename to Title Case */
function formatTaskTitle(filename) {
    if (filename === 'audit_project' || filename === 'audit_project.ts' || filename === 'audit_project.js') {
        return 'Project Architecture & Style Rules';
    }
    if (filename === 'validate_stylelint' || filename === 'validate_stylelint.ts' || filename === 'validate_stylelint.js') {
        return 'CSS & SCSS Stylelint Hygiene';
    }
    const base = filename.replace(/\.(ts|js)$/, '').replace(/^(validate_|audit_)/, '');
    return base
        .split(/[_-]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
async function createAuditTaskDefinition(fullPath, filename, family, config, options, isBuiltin, targetSuiteIds) {
    const id = filename;
    const isFast = family === 'architecture' || filename.includes('domain_types');
    if (options.skipSimilar && (id === 'validate_similar_code' || filename.includes('validate_similar_code'))) {
        return null;
    }
    if (targetSuiteIds && !targetSuiteIds.has(id))
        return null;
    if (options.family && options.family !== family)
        return null;
    if (options.task && !options.task.includes(',') && options.task !== id && !filename.includes(options.task))
        return null;
    if (options.fastOnly && !isFast)
        return null;
    const metadata = await extractAuditorMetadataFromFile(fullPath);
    const capabilities = metadata.capabilities;
    const gitIgnoreEntries = metadata.gitIgnoreEntries;
    if (gitIgnoreEntries.length > 0) {
        GitIgnoreRegistry.registerMany(gitIgnoreEntries);
    }
    const isBuildPreset = options.preset === 'build' || options.buildOnly;
    if (isBuildPreset && (!capabilities || !capabilities.requiresBuild)) {
        return null;
    }
    if (options.fixOnly && (!capabilities || !capabilities.fix)) {
        return null;
    }
    if ((options.lintOnly || options.preset === 'lint') && (!capabilities || !capabilities.lint)) {
        return null;
    }
    if ((options.mdOnly || options.preset === 'md') && (!capabilities || !capabilities.md)) {
        return null;
    }
    if (options.includeHeavy === false && capabilities?.heavy) {
        return null;
    }
    // Pre-build run (default general audit, audit:for-commit, lint, md): exclude requiresBuild suites
    // unless explicitly requested via --with-build or targeting a specific suite/task
    if (!isBuildPreset && !options.withBuild && !options.task && !options.suites) {
        if (capabilities?.requiresBuild) {
            return null;
        }
    }
    const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
    const scriptArg = relScriptPath.startsWith('..') ? path.resolve(fullPath).replace(/\\/g, '/') : relScriptPath;
    const taskPermissions = getPermissionsForTask(filename, fullPath);
    const taskArgs = [...taskPermissions, scriptArg, '--json'];
    if (isBuiltin && id === 'audit_project') {
        if (options.preset === 'lint' || options.lintOnly) {
            taskArgs.push('--rule', 'fallow');
        }
        else if (options.preset === 'md' || options.mdOnly) {
            taskArgs.push('--rule', 'dox');
        }
    }
    const familyMeta = resolveFamilyMetadata(family, config.customFamilies);
    const effectiveIcon = metadata.icon ?? (isBuiltin ? familyMeta.icon : '🧩');
    return {
        id,
        name: formatTaskTitle(filename),
        family,
        scriptPath: relScriptPath,
        command: 'node',
        args: taskArgs,
        fast: isFast,
        timeoutMs: getTimeoutForTask(filename, config.runner?.timeoutMs),
        order: familyMeta.order,
        requiresAst: capabilities?.ast ?? false,
        isBuiltin,
        icon: effectiveIcon,
        capabilities: capabilities ?? undefined,
        gitIgnoreEntries: gitIgnoreEntries.length > 0 ? gitIgnoreEntries : undefined
    };
}
function resolveTargetSuiteIds(options, combinedPresets) {
    let targetSuiteIds = null;
    if (options.preset && options.preset !== 'lint' && options.preset !== 'md' && options.preset in combinedPresets) {
        targetSuiteIds = new Set(combinedPresets[options.preset]);
    }
    if (options.suites && options.suites.length > 0) {
        targetSuiteIds = new Set([...(targetSuiteIds ?? []), ...options.suites]);
    }
    else if (options.task && options.task.includes(',')) {
        const list = options.task.split(',').map(s => s.trim()).filter(Boolean);
        targetSuiteIds = new Set([...(targetSuiteIds ?? []), ...list]);
    }
    return targetSuiteIds;
}
function inferFamilyFromRelPath(relPath, activeFamilies) {
    const segments = relPath.split('/');
    const firstSegment = segments[0];
    if (segments.length > 1 && firstSegment && activeFamilies.includes(firstSegment)) {
        return firstSegment;
    }
    return 'architecture';
}
function isIgnoredFileEntry(entry) {
    if (entry.startsWith('_'))
        return true;
    if (!entry.endsWith('.ts') && !entry.endsWith('.js'))
        return true;
    if (entry.endsWith('.d.ts') || entry.endsWith('.d.ts.map') || entry.endsWith('.js.map'))
        return true;
    return (entry.includes('.spec.') ||
        entry.includes('.test.') ||
        entry.startsWith('report_') ||
        entry === 'audit_rules.ts' ||
        entry === 'audit_rules.js' ||
        entry.endsWith('Plugin.ts') ||
        entry.endsWith('Plugin.js'));
}
async function scanSuiteDirectory(params) {
    let entries; // no-domain: Non-domain utility collection or data structure
    try {
        entries = await fs.readdir(params.currentDir);
    }
    catch {
        // catch-ok: directory may not exist or not be accessible in custom options
        return;
    }
    const isBuiltin = params.isBuiltin ?? true;
    for (const entry of entries) {
        const fullPath = path.join(params.currentDir, entry);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            if (!entry.startsWith('_') && entry !== 'node_modules' && entry !== 'lib') {
                await scanSuiteDirectory({ ...params, currentDir: fullPath, isBuiltin });
            }
        }
        else if (stat.isFile() && !isIgnoredFileEntry(entry)) {
            const relPath = path.relative(params.rootDir, fullPath).replace(/\\/g, '/');
            const family = inferFamilyFromRelPath(relPath, params.activeFamilies);
            const filename = path.basename(entry, path.extname(entry));
            const task = await createAuditTaskDefinition(fullPath, filename, family, params.config, params.options, isBuiltin, params.targetSuiteIds);
            if (task)
                params.discovered.push(task);
        }
    }
}
function detectExtensionFamily(extPath, activeFamilies) {
    const normalized = extPath.replace(/\\/g, '/');
    for (const fam of activeFamilies) {
        if (normalized.includes(`/${fam}/`)) {
            return fam;
        }
    }
    return 'domain_data';
}
async function scanSingleExtensionFile(fullPath, extPath, params) {
    const filename = path.basename(extPath, path.extname(extPath));
    const family = detectExtensionFamily(extPath, params.activeFamilies);
    const task = await createAuditTaskDefinition(fullPath, filename, family, params.config, params.options, false, params.targetSuiteIds);
    if (task)
        params.discovered.push(task);
}
async function scanConfigExtensionEntry(extPath, params) {
    const rootDir = params.options.projectRoot || process.cwd();
    const fullPath = path.resolve(rootDir, extPath);
    if (!fsSync.existsSync(fullPath))
        return;
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
        await scanSuiteDirectory({
            currentDir: fullPath,
            rootDir: fullPath,
            config: params.config,
            options: params.options,
            activeFamilies: params.activeFamilies,
            targetSuiteIds: params.targetSuiteIds,
            discovered: params.discovered,
            isBuiltin: false
        });
    }
    else if (stat.isFile() && (extPath.endsWith('.ts') || extPath.endsWith('.js'))) {
        await scanSingleExtensionFile(fullPath, extPath, params);
    }
}
async function scanConfigExtensions(params) {
    for (const extPath of params.extensions) {
        await scanConfigExtensionEntry(extPath, params);
    }
}
export async function discoverAuditors(options = {}) {
    const config = await loadAuditConfig(options.projectRoot);
    const activeFamilies = getActiveFamilies(config.customFamilies);
    const discovered = [];
    const combinedPresets = {
        ...AUDIT_PRESETS,
        ...(config.presets ?? {})
    };
    const targetSuiteIds = resolveTargetSuiteIds(options, combinedPresets);
    const scanDir = options.baseDir ?? BUILTIN_SUITES_DIR;
    await scanSuiteDirectory({
        currentDir: scanDir,
        rootDir: scanDir,
        config,
        options,
        activeFamilies,
        targetSuiteIds,
        discovered
    });
    if ((!options.baseDir || options.baseDir === BUILTIN_SUITES_DIR) && config.extensions && config.extensions.length > 0) {
        await scanConfigExtensions({
            extensions: config.extensions,
            config,
            options,
            activeFamilies,
            targetSuiteIds,
            discovered
        });
    }
    discovered.sort((a, b) => {
        const familyDiff = (a.order ?? FALLBACK_FAMILY_ORDER) - (b.order ?? FALLBACK_FAMILY_ORDER);
        if (familyDiff !== 0)
            return familyDiff;
        return a.id.localeCompare(b.id);
    });
    return discovered;
}
/**
 * Dynamically collects gitignore requirements from all discovered subauditors,
 * registered extensions, and audit.config.ts, guaranteeing that zero rules are hardcoded.
 */
export async function collectAllGitIgnoreRequirements(projectRoot = process.cwd(), config) {
    const effectiveConfig = config ?? await loadAuditConfig(projectRoot);
    await discoverAuditors({ projectRoot });
    const customEntries = effectiveConfig.gitIgnore?.extraRequiredEntries ?? [];
    for (const entry of customEntries) {
        if (typeof entry === 'string') {
            GitIgnoreRegistry.register({
                id: entry,
                pattern: entry,
                reason: `Entrada requerida configurada en audit.config.ts (${entry})`
            });
        }
        else if (entry && typeof entry === 'object' && entry.id && entry.pattern) {
            GitIgnoreRegistry.register(entry);
        }
    }
    return GitIgnoreRegistry.getRequirements();
}
//# sourceMappingURL=auditScanner.js.map