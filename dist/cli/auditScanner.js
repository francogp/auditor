/**
 * packages/auditor/src/cli/auditScanner.ts
 *
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { resolveFamilyMetadata, getActiveFamilies } from "../core/auditContract.js";
import { loadAuditConfig } from "../core/auditConfig.js";
const BUILTIN_SUITES_DIR = path.resolve(import.meta.dirname, '../suites');
const DEFAULT_TIMEOUT_MS = 60000;
const HEAVY_TIMEOUT_MS = 300000; // 5 minutes for full repo AST / DB migration validation
function getTimeoutForTask(filename) {
    if (filename.includes('validate_similar_code')) {
        return 0; // No killing timeout: allow embeddings to generate and persist cache to disk
    }
    if (filename.includes('audit_project') ||
        filename.includes('validate_type_check') ||
        filename.includes('validate_eslint')) {
        return HEAVY_TIMEOUT_MS;
    }
    return DEFAULT_TIMEOUT_MS;
}
export const AUDIT_PRESETS = {
    lint: [
        'validate_domain_types',
        'validate_o1_data_structures',
        'validate_component_styles',
        'audit_project',
        'validate_vue_sfc_hygiene',
        'validate_console_cleanliness',
        'validate_audit_headers',
        'validate_type_check',
        'validate_markdown_lint',
        'validate_eslint',
        'validate_html_validate'
    ],
    md: [
        'validate_markdown_links',
        'validate_markdown_code_references',
        'validate_markdown_lint',
        'validate_markdown_syntax',
        'validate_dox_integrity'
    ]
};
export const AST_DEPENDENT_SUITE_IDS = [
    'validate_pinia_reactivity',
    'validate_reactive_leaks',
    'validate_bundle_budget',
    'validate_duplicate_constants'
];
export const AST_DEPENDENT_SUITES = new Set(AST_DEPENDENT_SUITE_IDS);
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
    if (filename === 'validate_css_duplicates' || filename === 'validate_css_duplicates.ts' || filename === 'validate_css_duplicates.js') {
        return 'CSS Duplication & Hygiene';
    }
    const base = filename.replace(/\.(ts|js)$/, '').replace(/^(validate_|audit_)/, '');
    return base
        .split(/[_-]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
function createAuditTaskDefinition(fullPath, filename, family, config, options, isBuiltin, targetSuiteIds) {
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
    const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
    const taskPermissions = getPermissionsForTask(filename, fullPath);
    const taskArgs = [...taskPermissions, relScriptPath, '--json'];
    if (isBuiltin && id === 'audit_project') {
        if (options.preset === 'lint') {
            taskArgs.push('--rule', 'fallow');
        }
        else if (options.preset === 'md') {
            taskArgs.push('--rule', 'dox');
        }
    }
    const familyMeta = resolveFamilyMetadata(family, config.customFamilies);
    return {
        id,
        name: formatTaskTitle(filename),
        family,
        scriptPath: relScriptPath,
        command: 'node',
        args: taskArgs,
        fast: isFast,
        timeoutMs: getTimeoutForTask(filename),
        order: familyMeta.order,
        requiresAst: AST_DEPENDENT_SUITES.has(id),
        isBuiltin
    };
}
function resolveTargetSuiteIds(options, combinedPresets) {
    let targetSuiteIds = null;
    if (options.preset && options.preset in combinedPresets) {
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
    return entry.includes('.spec.') || entry.includes('.test.') || entry.startsWith('report_') || entry === 'audit_rules.ts' || entry === 'audit_rules.js';
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
    for (const entry of entries) {
        const fullPath = path.join(params.currentDir, entry);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            if (!entry.startsWith('_') && entry !== 'node_modules' && entry !== 'lib') {
                await scanSuiteDirectory({ ...params, currentDir: fullPath });
            }
        }
        else if (stat.isFile() && !isIgnoredFileEntry(entry)) {
            const relPath = path.relative(params.rootDir, fullPath).replace(/\\/g, '/');
            const family = inferFamilyFromRelPath(relPath, params.activeFamilies);
            const filename = path.basename(entry, path.extname(entry));
            const task = createAuditTaskDefinition(fullPath, filename, family, params.config, params.options, true, params.targetSuiteIds);
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
function scanSingleExtensionFile(fullPath, extPath, params) {
    const filename = path.basename(extPath, path.extname(extPath));
    const family = detectExtensionFamily(extPath, params.activeFamilies);
    const task = createAuditTaskDefinition(fullPath, filename, family, params.config, params.options, false, params.targetSuiteIds);
    if (task)
        params.discovered.push(task);
}
async function scanConfigExtensionEntry(extPath, params) {
    const fullPath = path.resolve(process.cwd(), extPath);
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
            discovered: params.discovered
        });
    }
    else if (stat.isFile() && (extPath.endsWith('.ts') || extPath.endsWith('.js'))) {
        scanSingleExtensionFile(fullPath, extPath, params);
    }
}
async function scanConfigExtensions(params) {
    for (const extPath of params.extensions) {
        await scanConfigExtensionEntry(extPath, params);
    }
}
export async function discoverAuditors(options = {}) {
    const config = await loadAuditConfig();
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
    if (!options.baseDir && config.extensions && config.extensions.length > 0) {
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
        const familyDiff = (a.order ?? 99) - (b.order ?? 99);
        if (familyDiff !== 0)
            return familyDiff;
        return a.id.localeCompare(b.id);
    });
    return discovered;
}
//# sourceMappingURL=auditScanner.js.map