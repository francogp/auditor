/**
 * scripts/audit_project.ts
 *
 * STABLE PROJECT AUDIT ENGINE (Node.js 26+)
 *
 * Final Safe Version: Context-aware GPU checking.
 */
import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { BaseAuditor, MAX_AUDITOR_DESCRIPTION_LENGTH } from "../../core/auditorBase.js";
import { matchesRule, Z_INDEX_CONSISTENCY_DESCRIPTOR, FALLOW_SUITE_DESCRIPTORS, SASS_MIGRATOR_DESCRIPTOR, auditRulesConfig as config } from "./audit_rules.js";
import { auditZIndexParity } from "./validate_z_index.js";
import { StylelintAuditor } from "./validate_stylelint.js";
export const CSS_ANALYZER_DESCRIPTOR = {
    id: 'css-analyzer',
    name: 'CSS / SCSS Stylelint Analyzer',
    category: 'Stylelint: Calidad y duplicación CSS/SCSS',
    aliases: ['css-checker', 'css', 'scss', 'duplicate-css', 'scss-duplicados', 'css-hygiene', 'stylelint']
};
import { checkDoxIntegrity, DOX_ANALYZER_DESCRIPTOR } from "../../analyzers/doxAnalyzer.js";
import { detectDuplicateConstants, CONSTANT_ANALYZER_DESCRIPTOR } from "../../analyzers/constantAnalyzer.js";
import { CANONICAL_IGNORE_DIRS, getEffectiveIgnoreDirs, isPathIgnored } from "../../core/auditorBase.js";
import { loadAuditConfig, getAuditConfig, isTestPath, isScriptPath, isCliPath, isDataPath, isDemoPath, resolveZLayersScssPath, getEffectiveZLayers } from "../../core/auditConfig.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES } from "../../cli/cliUtils.js";
enableCompileCache();
export const FALLOW_HIGH_PRIORITY_THRESHOLD = 20;
export const FALLOW_CRITICAL_PRIORITY_THRESHOLD = 30;
const AUDIT_EXTENSIONS = new Set(['.vue', '.scss', '.css', '.ts', '.js', '.md']); // runtime-set: Fast O(1) membership lookup set
async function getFilesToAudit(dir) {
    const files = []; // no-domain: Non-domain utility collection or data structure
    const pattern = `**/*{${Array.from(AUDIT_EXTENSIONS).join(',')}}`;
    for await (const entry of fs.glob(pattern, {
        cwd: dir,
        exclude: (p) => isPathIgnored(p)
    })) {
        files.push(path.resolve(dir, entry));
    }
    return files;
}
function prependRequiredImports(block, rules) {
    let result = block;
    for (const rule of rules) {
        const importer = rule.addImport;
        if (importer && result.includes(importer.split(' ')[1]) && !result.includes(importer)) {
            result = importer + '\n' + result;
        }
    }
    return result;
}
function auditVueScriptBlocks(params) {
    let { content } = params;
    let modified = false;
    const scriptBlocks = extractAllBlocks(content, 'script');
    const rules = params.candidateRules.filter(r => !params.allStyleRules.includes(r) && r !== config.dbInTemplates && r !== config.functionCallsInTemplates);
    if (rules.length === 0)
        return { content, modified };
    for (let i = scriptBlocks.length - 1; i >= 0; i--) {
        const block = scriptBlocks[i];
        let newBlock = runRules(params.filePath, block.content, rules, params.violations, params.fix, block.startLine);
        if (params.fix && newBlock !== block.content) {
            newBlock = prependRequiredImports(newBlock, rules);
            content = content.substring(0, block.startIdx) + newBlock + content.substring(block.endIdx);
            modified = true;
        }
    }
    return { content, modified };
}
function auditVueTemplateBlocks(content, filePath, activeConfigRules, violations) {
    const templateBlocks = extractAllBlocks(content, 'template');
    for (const block of templateBlocks) {
        const candidateTemplateRules = [
            config.dbInTemplates,
            config.functionCallsInTemplates,
            config.missingInteractiveId
        ];
        const templateRules = activeConfigRules
            ? candidateTemplateRules.filter(r => activeConfigRules.has(r))
            : candidateTemplateRules;
        if (!activeConfigRules || activeConfigRules.has(config.legacyDates)) {
            templateRules.push(config.legacyDates);
        }
        if (templateRules.length > 0) {
            runRules(filePath, block.content, templateRules, violations, false, block.startLine);
        }
    }
}
function auditLogicFile(params) {
    let { content } = params;
    let modified = false;
    const rules = params.candidateRules.filter(r => !params.allStyleRules.includes(r) && r !== config.dbInTemplates && r !== config.functionCallsInTemplates);
    if (rules.length > 0) {
        const newBlock = runRules(params.filePath, content, rules, params.violations, params.fix, 0);
        if (params.fix && newBlock !== content) {
            content = prependRequiredImports(newBlock, rules);
            modified = true;
        }
    }
    return { content, modified };
}
function auditVueStyleBlocks(params) {
    let { content } = params;
    let modified = false;
    const styleBlocks = extractAllBlocks(content, 'style');
    for (let i = styleBlocks.length - 1; i >= 0; i--) {
        const block = styleBlocks[i];
        const newBlock = runRules(params.filePath, block.content, params.styleRules, params.violations, params.fix, block.startLine);
        if (params.fix && newBlock !== block.content) {
            content = content.substring(0, block.startIdx) + newBlock + content.substring(block.endIdx);
            modified = true;
        }
    }
    return { content, modified };
}
function auditStyleFile(params) {
    let { content } = params;
    let modified = false;
    const newBlock = runRules(params.filePath, content, params.styleRules, params.violations, params.violations.length > 0 ? false : params.fix, 0);
    if (params.fix && newBlock !== content) {
        content = newBlock;
        modified = true;
    }
    return { content, modified };
}
function auditLogicOrVueScript(params) {
    let { content } = params;
    let modified = false;
    const allConfigRules = Object.values(config);
    const candidateRules = params.activeConfigRules
        ? allConfigRules.filter(r => params.activeConfigRules.has(r))
        : allConfigRules;
    if (params.isVue) {
        const scriptRes = auditVueScriptBlocks({
            content,
            filePath: params.filePath,
            candidateRules,
            allStyleRules: params.allStyleRules,
            fix: params.fix,
            violations: params.violations
        });
        content = scriptRes.content;
        if (scriptRes.modified)
            modified = true;
        auditVueTemplateBlocks(content, params.filePath, params.activeConfigRules, params.violations);
    }
    else {
        const logicRes = auditLogicFile({
            content,
            filePath: params.filePath,
            candidateRules,
            allStyleRules: params.allStyleRules,
            fix: params.fix,
            violations: params.violations
        });
        content = logicRes.content;
        if (logicRes.modified)
            modified = true;
    }
    return { content, modified };
}
function auditStylesOrVueStyles(params) {
    let { content } = params;
    let modified = false;
    if (params.isVue) {
        const styleRes = auditVueStyleBlocks({
            content,
            filePath: params.filePath,
            styleRules: params.styleRules,
            fix: params.fix,
            violations: params.violations
        });
        content = styleRes.content;
        if (styleRes.modified)
            modified = true;
    }
    else {
        const styleRes = auditStyleFile({
            content,
            filePath: params.filePath,
            styleRules: params.styleRules,
            fix: params.fix,
            violations: params.violations
        });
        content = styleRes.content;
        if (styleRes.modified)
            modified = true;
    }
    return { content, modified };
}
async function auditFile(filePath, fix, activeConfigRules) {
    const violations = [];
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;
    const isVue = filePath.endsWith('.vue');
    const isLogic = filePath.endsWith('.ts') || filePath.endsWith('.js');
    const isStyle = filePath.endsWith('.scss') || filePath.endsWith('.css');
    const ALL_STYLE_RULES = [
        config.viewport,
        config.gpuGaps,
        config.zIndexAudit,
        config.manualAnimations,
        config.emptyVueTransitions,
        config.noImportantOnTransforms,
        config.noImportantOnFilters,
        config.noSassAtImport
    ];
    const STYLE_RULES = activeConfigRules
        ? ALL_STYLE_RULES.filter(r => activeConfigRules.has(r))
        : ALL_STYLE_RULES;
    if (isLogic || isVue) {
        const logicRes = auditLogicOrVueScript({ filePath, content, isVue, activeConfigRules, allStyleRules: ALL_STYLE_RULES, fix, violations });
        content = logicRes.content;
        if (logicRes.modified)
            modified = true;
    }
    if ((isStyle || isVue) && STYLE_RULES.length > 0) {
        const styleRes = auditStylesOrVueStyles({ filePath, content, isVue, styleRules: STYLE_RULES, fix, violations });
        content = styleRes.content;
        if (styleRes.modified)
            modified = true;
    }
    if (fix && modified) {
        await fs.writeFile(filePath, content, 'utf-8');
    }
    return violations;
}
function isInsideComment(content, index) {
    // Check for Line Comment // ...
    const lastNewLine = content.lastIndexOf('\n', index);
    const lastLineComment = content.lastIndexOf('//', index);
    if (lastLineComment > lastNewLine)
        return true;
    // Check for Block Comment /* ... */
    const lastStartBlock = content.lastIndexOf('/*', index);
    const lastEndBlock = content.lastIndexOf('*/', index);
    if (lastStartBlock > lastEndBlock)
        return true;
    return false;
}
function createLineLocator(content, offset) {
    let lineBreakIndices = null;
    return (idx) => {
        if (!lineBreakIndices) {
            lineBreakIndices = [];
            for (let i = 0; i < content.length; i++) {
                if (content[i] === '\n')
                    lineBreakIndices.push(i);
            }
        }
        let low = 0;
        let high = lineBreakIndices.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (lineBreakIndices[mid] < idx)
                low = mid + 1;
            else
                high = mid;
        }
        return low + 1 + offset;
    };
}
function collectRuleViolations(rule, content, filePath, getLineNo, violations) {
    const flags = rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g';
    const regex = new RegExp(rule.regex.source, flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
        if (match.index === regex.lastIndex)
            regex.lastIndex++;
        if (rule.check && !rule.check(content, match, filePath)) {
            continue;
        }
        if (isInsideComment(content, match.index)) {
            continue;
        }
        const lineNo = getLineNo(match.index);
        violations.push({
            file: filePath,
            line: lineNo,
            message: typeof rule.message === 'function' ? rule.message(match[0]) : rule.message,
            context: match[0],
            severity: rule.severity || 'warning',
            fixable: !!rule.fix,
            packageName: rule.packageName,
            ruleId: rule.id || rule.name,
            ruleDescription: rule.category || rule.name
        });
    }
}
function applyRuleFix(rule, content, filePath) {
    if (rule.appliesTo && !rule.appliesTo(filePath))
        return content;
    const fixer = rule.fix;
    if (!fixer)
        return content;
    const gRegex = new RegExp(rule.regex.source, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g');
    return content.replace(gRegex, (match, ...args) => {
        const matchIdx = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        if (isInsideComment(content, matchIdx))
            return match;
        if (rule.check) {
            const checkRegex = new RegExp(rule.regex.source, rule.regex.flags.replace('g', ''));
            const currentMatch = checkRegex.exec(content.substring(matchIdx));
            if (currentMatch) {
                currentMatch.index = matchIdx;
                if (!rule.check(content, currentMatch, filePath))
                    return match;
            }
        }
        return fixer(match);
    });
}
function runRules(filePath, content, rules, violations, fix, offset) {
    let result = content;
    const getLineNo = createLineLocator(content, offset);
    for (const rule of rules) {
        if (rule.appliesTo && !rule.appliesTo(filePath)) {
            continue;
        }
        collectRuleViolations(rule, content, filePath, getLineNo, violations);
        if (fix && rule.fix) {
            result = applyRuleFix(rule, result, filePath);
        }
    }
    return result;
}
function extractAllBlocks(content, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const blocks = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        const blockContent = match[1] ?? '';
        const beforeMatch = content.substring(0, match.index);
        const startLine = beforeMatch.split('\n').length;
        const openingTagLength = match[0].indexOf(blockContent);
        const startIdx = match.index + openingTagLength;
        const endIdx = startIdx + blockContent.length;
        blocks.push({
            content: blockContent,
            startLine,
            startIdx,
            endIdx
        });
    }
    return blocks;
}
async function checkZIndexConsistency(fix) {
    const config = getAuditConfig();
    if (config.styles?.zLayersEnabled === false) {
        return [];
    }
    const scssPath = resolveZLayersScssPath(process.cwd());
    if (!scssPath) {
        return [
            "Falta configuración de Z-Layers en audit.config.ts: no se encontró archivo SCSS. Defina 'styles.zLayersScssFile' o 'styles.baseScssFile' apuntando a su archivo SCSS base, o configure explícitamente 'styles.zLayersEnabled: false' si el proyecto no utiliza capas Z de SCSS."
        ];
    }
    try {
        const scssContent = await fs.readFile(scssPath, 'utf-8');
        const effectiveLayers = getEffectiveZLayers(process.cwd());
        const result = auditZIndexParity(scssContent, fix, effectiveLayers);
        if (fix && result.modified) {
            await fs.writeFile(scssPath, result.scssContent, 'utf-8');
        }
        return result.errors;
    }
    catch (e) {
        return [`Error leyendo archivo SCSS (${path.basename(scssPath)}): ${e}`];
    }
}
function getChangedFiles(ref) {
    try {
        const output = execSync(`git diff --name-only ${ref}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        return output
            .split('\n')
            .map(f => f.trim())
            .filter(f => f !== '' && AUDIT_EXTENSIONS.has(path.extname(f)) && !Array.from(CANONICAL_IGNORE_DIRS).some(d => f.split(/[/\\]/).includes(d)))
            .map(f => path.resolve(process.cwd(), f));
    }
    catch (_e) {
        process.stderr.write(styleText('yellow', `⚠️ No se pudo obtener la lista de archivos modificados desde git para ref: '${ref}'. Se auditará el proyecto completo.\n`));
        return [];
    }
}
function resolveFallowBinaryPath() {
    const candidates = [
        path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow'),
        path.resolve(import.meta.dirname, '../../node_modules/fallow/bin/fallow'),
        path.resolve(import.meta.dirname, '../../../node_modules/fallow/bin/fallow'),
        path.resolve(import.meta.dirname, '../../../../node_modules/fallow/bin/fallow')
    ];
    return candidates.find(c => existsSync(c)) || candidates[0];
}
function tryParseFallowJson(output, targetCategory) {
    if (!output)
        return null;
    const stdoutStr = typeof output === 'string' ? output : output.toString('utf8');
    const jsonStart = stdoutStr.indexOf('{');
    if (jsonStart === -1)
        return null;
    try {
        const data = JSON.parse(stdoutStr.substring(jsonStart));
        return mapFallowJson(targetCategory, data);
    }
    catch {
        // catch-ok: Ignore JSON parsing errors in error output
        return null;
    }
}
function runFallow(command, extraArgs = [], logicalCategory) {
    const targetCategory = logicalCategory || command;
    const fallowBin = resolveFallowBinaryPath();
    const args = ['--format', 'json', ...extraArgs];
    const cmd = `node "${fallowBin}" ${command} ${args.join(' ')}`;
    try {
        const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES });
        const parsed = tryParseFallowJson(stdout, targetCategory);
        if (parsed)
            return parsed;
    }
    catch (e) {
        const err = e;
        const parsed = tryParseFallowJson(err.stdout, targetCategory);
        if (parsed)
            return parsed;
        return [{
                file: 'fallow',
                line: 0,
                message: `Error ejecutando fallow ${command}: ${err.message || String(e)} | Stderr: ${err.stderr || ''}`,
                context: `fallow ${command}`,
                severity: 'error',
                fixable: false
            }];
    }
    return [];
}
function isToolingConfigFile(filePath) {
    const norm = (filePath || '').split('\\').join('/');
    const base = norm.split('/').pop() || '';
    return (base.startsWith('vite.config.') ||
        base.startsWith('vitest.') ||
        base.startsWith('playwright.config.') ||
        base.startsWith('eslint.config.'));
}
function isNonProductionPath(filePath) {
    if (isToolingConfigFile(filePath))
        return true;
    const norm = (filePath || '').split('\\').join('/');
    const config = getAuditConfig();
    if (isTestPath(norm) || isScriptPath(norm, config) || isCliPath(norm, config)) {
        return true;
    }
    if (norm.startsWith('scratch/') || norm.startsWith('packages/')) {
        return true;
    }
    if (config.paths.migrationsDir && norm.startsWith(config.paths.migrationsDir.replace(/\\/g, '/'))) {
        return true;
    }
    if (config.persistence?.supabaseDir && norm.startsWith(config.persistence.supabaseDir.replace(/\\/g, '/'))) {
        return true;
    }
    if (config.persistence?.allowedDatabaseDirs?.some(d => {
        const clean = d.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        return norm === clean || norm.startsWith(`${clean}/`) || norm.includes(`/${clean}/`);
    })) {
        return true;
    }
    return false;
}
function isComplexityExemptPath(filePath) {
    if (isNonProductionPath(filePath))
        return true;
    const norm = (filePath || '').split('\\').join('/');
    if (norm.startsWith('dist/')) {
        return true;
    }
    if (isDataPath(norm) || isDemoPath(norm))
        return true;
    return false;
}
function addComplexityFinding(f, violations) {
    if (isComplexityExemptPath(f.path))
        return;
    const name = f.name || f.function_name || '<anónima>';
    if (name === '<template>')
        return;
    const details = [];
    if (f.cognitive)
        details.push(`cognitiva: ${f.cognitive}`);
    if (f.cyclomatic)
        details.push(`ciclomática: ${f.cyclomatic}`);
    if (f.line_count)
        details.push(`${f.line_count} líneas`);
    const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
    violations.push({
        file: path.resolve(process.cwd(), f.path),
        line: f.line || 1,
        message: `Sugerencia de complejidad (Fallow): Función '${name}' supera umbral de complejidad${detailStr}`,
        context: name,
        severity: 'error',
        fixable: false,
        packageName: 'Fallow',
        ruleId: 'fallow-complexity',
        ruleDescription: 'Complejidad'
    });
}
function hasSecuritySuppression(filePath, line) {
    try {
        const fullPath = path.resolve(process.cwd(), filePath);
        if (!existsSync(fullPath))
            return false;
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const targetIdx = line - 1;
        const startIdx = Math.max(0, targetIdx - 3);
        for (let i = startIdx; i <= targetIdx && i < lines.length; i++) {
            const l = lines[i] || '';
            if (l.includes('fallow-ignore-next-line security-sink') ||
                l.includes('fallow-ignore security-sink') ||
                l.includes('security-ok')) {
                return true;
            }
        }
    }
    catch {
        return false;
    }
    return false;
}
function formatCloneLocations(instances) {
    return instances
        .map((i) => `${i.file || i.path || ''}:${i.start_line || i.line || 0}`)
        .join(', ');
}
function createCloneViolation(g, command) {
    const instances = g.instances || [];
    const first = instances[0];
    if (!first)
        return null;
    const firstPath = first.file || first.path || '';
    const firstLine = first.start_line || first.line || 0;
    const locations = formatCloneLocations(instances.slice(1));
    const isTriplicate = command === 'triplets' || instances.length >= 3;
    const prefix = isTriplicate ? 'Código triplicado crítico' : 'Código duplicado crítico';
    const tokens = g.token_count || g.duplicated_tokens || 0;
    return {
        file: path.resolve(process.cwd(), firstPath),
        line: firstLine,
        message: `${prefix}: Encontradas ${instances.length} coincidencias de código idéntico. Ubicaciones: ${firstPath}:${firstLine}, ${locations}`,
        context: `${isTriplicate ? 'triplicación' : 'duplicación'} (${tokens} tokens)`,
        severity: 'error',
        fixable: false,
        packageName: 'Fallow',
        ruleId: isTriplicate ? 'fallow-triplicate-code' : 'fallow-duplicate-code',
        ruleDescription: isTriplicate ? 'Código triplicado' : 'Código duplicado'
    };
}
function mapFallowClones(command, data) {
    const violations = [];
    for (const g of data.clone_groups || []) {
        const v = createCloneViolation(g, command);
        if (v)
            violations.push(v);
    }
    return violations;
}
function mapFallowSecurity(data) {
    const violations = [];
    const findings = data.security_findings || [];
    for (const f of findings) {
        if (isNonProductionPath(f.path))
            continue;
        if (hasSecuritySuppression(f.path, f.line))
            continue;
        violations.push({
            file: path.resolve(process.cwd(), f.path),
            line: f.line,
            message: `Candidato de seguridad [CWE-${f.cwe}] en ${f.path}:${f.line} -> ${f.evidence}`,
            context: f.kind || '',
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-security-cwe',
            ruleDescription: 'Seguridad (CWE)'
        });
    }
    return violations;
}
function mapFallowUnusedMembers(data, violations) {
    const unusedStoreMembers = [...(data.unused_store_members || []), ...(data.dead_code?.unused_store_members || [])];
    for (const sm of unusedStoreMembers) {
        violations.push({
            file: path.resolve(process.cwd(), sm.path),
            line: sm.line || 1,
            message: `Miembro de store no usado: '${sm.parent_name}.${sm.member_name}'`,
            context: sm.member_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-store-members',
            ruleDescription: 'Miembros de store no usados'
        });
    }
    const unusedClassMembers = [...(data.unused_class_members || []), ...(data.dead_code?.unused_class_members || [])];
    for (const cm of unusedClassMembers) {
        violations.push({
            file: path.resolve(process.cwd(), cm.path),
            line: cm.line || 1,
            message: `Miembro de clase no usado: '${cm.parent_name}.${cm.member_name}'`,
            context: cm.member_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-class-members',
            ruleDescription: 'Miembros de clase no usados'
        });
    }
    const unusedTypes = [...(data.unused_types || []), ...(data.dead_code?.unused_types || [])];
    for (const ut of unusedTypes) {
        violations.push({
            file: path.resolve(process.cwd(), ut.path),
            line: ut.line || 1,
            message: `Tipo exportado no usado: '${ut.export_name}'`,
            context: ut.export_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-types',
            ruleDescription: 'Tipos exportados no usados'
        });
    }
}
function mapUnusedEmitsAndProps(data, violations) {
    const unusedEmits = [...(data.unused_component_emits || []), ...(data.dead_code?.unused_component_emits || [])];
    for (const ue of unusedEmits) {
        violations.push({
            file: path.resolve(process.cwd(), ue.path),
            line: ue.line || 1,
            message: `Evento emit de componente no usado: '${ue.component_name}.${ue.emit_name}'`,
            context: ue.emit_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-emits',
            ruleDescription: 'Emits no usados'
        });
    }
    const unusedProps = [...(data.unused_component_props || []), ...(data.dead_code?.unused_component_props || [])];
    for (const up of unusedProps) {
        violations.push({
            file: path.resolve(process.cwd(), up.path),
            line: up.line || 1,
            message: `Prop de componente no usado: '${up.component_name}.${up.prop_name}'`,
            context: up.prop_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-props',
            ruleDescription: 'Props de componente no usados'
        });
    }
}
function mapUnrenderedAndUnprovided(data, violations) {
    const unrenderedComponents = [...(data.unrendered_components || []), ...(data.dead_code?.unrendered_components || [])];
    for (const uc of unrenderedComponents) {
        violations.push({
            file: path.resolve(process.cwd(), uc.path),
            line: uc.line || 1,
            message: `Componente no renderizado: '${uc.component_name}'`,
            context: uc.component_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unrendered-components',
            ruleDescription: 'Componentes no renderizados'
        });
    }
    const unprovidedInjects = [...(data.unprovided_injects || []), ...(data.dead_code?.unprovided_injects || [])];
    for (const ui of unprovidedInjects) {
        violations.push({
            file: path.resolve(process.cwd(), ui.path),
            line: ui.line || 1,
            message: `Clave inyectada no provista: '${ui.inject_key}'`,
            context: ui.inject_key,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unprovided-injects',
            ruleDescription: 'Inyecciones no provistas'
        });
    }
}
function mapUnlistedDependencies(data, violations) {
    const unlistedDeps = [...(data.unlisted_dependencies || []), ...(data.dead_code?.unlisted_dependencies || [])];
    for (const ud of unlistedDeps) {
        const targetLoc = ud.imported_from?.[0];
        violations.push({
            file: path.resolve(process.cwd(), targetLoc?.path || 'package.json'),
            line: targetLoc?.line || 1,
            message: `Dependencia no listada en package.json: '${ud.package_name}'`,
            context: ud.package_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unlisted-dependencies',
            ruleDescription: 'Dependencias no listadas'
        });
    }
}
function mapBoundaryViolations(data, violations) {
    const boundaryViolations = [...(data.boundary_violations || []), ...(data.dead_code?.boundary_violations || [])];
    for (const b of boundaryViolations) {
        violations.push({
            file: path.resolve(process.cwd(), b.from_path),
            line: b.line || 1,
            message: `Violación de límite arquitectónico (Fallow): '${b.from_zone}' no puede importar de '${b.to_zone}' (import: '${b.import_specifier || b.to_path}')`,
            context: b.from_path,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-boundary-violations',
            ruleDescription: 'Límites arquitectónicos'
        });
    }
}
function mapUnresolvedImports(data, violations) {
    const unresolvedImports = [...(data.unresolved_imports || []), ...(data.dead_code?.unresolved_imports || [])];
    for (const ui of unresolvedImports) {
        violations.push({
            file: path.resolve(process.cwd(), ui.path),
            line: ui.line || 1,
            message: `Import no resuelto (Fallow): '${ui.specifier}'`,
            context: ui.specifier,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unresolved-imports',
            ruleDescription: 'Imports no resueltos'
        });
    }
}
function mapDependenciesAndBoundaries(data, violations) {
    mapUnlistedDependencies(data, violations);
    mapBoundaryViolations(data, violations);
    mapUnresolvedImports(data, violations);
}
function mapFallowComponentEntities(data, violations) {
    mapUnusedEmitsAndProps(data, violations);
    mapUnrenderedAndUnprovided(data, violations);
    mapDependenciesAndBoundaries(data, violations);
}
function mapCircularDeps(data, violations) {
    const circularDeps = [...(data.circular_dependencies || []), ...(data.dead_code?.circular_dependencies || [])];
    for (const c of circularDeps) {
        const filesList = (Array.isArray(c.files) && c.files.length > 0) ? c.files : (Array.isArray(c.cycle) ? c.cycle : []);
        const filePath = c.path || filesList[0] || 'src';
        const cyclePathStr = filesList.length > 0 ? filesList.join(' → ') : (c.message || filePath);
        violations.push({
            file: path.resolve(process.cwd(), filePath),
            line: c.line || 1,
            message: `Dependencia circular crítica (Fallow): ${cyclePathStr}`,
            context: filePath,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-circular-dependencies',
            ruleDescription: 'Dependencias circulares'
        });
    }
}
function mapUnusedFiles(data, violations) {
    const unusedFiles = [...(data.unused_files || []), ...(data.dead_code?.unused_files || [])];
    for (const f of unusedFiles) {
        violations.push({
            file: path.resolve(process.cwd(), f.path),
            line: 1,
            message: `Archivo huérfano/no usado (Dead Code Fallow): '${f.path}'`,
            context: f.path,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-files',
            ruleDescription: 'Archivos huérfanos / Dead Code'
        });
    }
}
function mapCircularAndUnusedFiles(data, violations) {
    mapCircularDeps(data, violations);
    mapUnusedFiles(data, violations);
}
function mapStaleSuppressions(data, violations) {
    const staleSuppressions = [...(data.stale_suppressions || []), ...(data.dead_code?.stale_suppressions || [])];
    for (const s of staleSuppressions) {
        if (s.origin && (s.origin.issue_kind?.startsWith('cwe-') || s.origin.kind_known === false)) {
            continue;
        }
        violations.push({
            file: path.resolve(process.cwd(), s.path || s.file || 'src'),
            line: s.line || 1,
            message: `Supresión obsoleta de Fallow (Stale Suppression): ${s.message || s.kind || ''}`,
            context: s.path || s.file || '',
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-stale-suppressions',
            ruleDescription: 'Supresiones obsoletas'
        });
    }
}
function mapDuplicateExports(data, violations) {
    const duplicateExports = [...(data.duplicate_exports || []), ...(data.dead_code?.duplicate_exports || [])];
    for (const d of duplicateExports) {
        const locs = d.locations && d.locations.length > 0 ? d.locations : [{ path: d.path, file: d.file, line: d.line }];
        for (const loc of locs) {
            violations.push({
                file: path.resolve(process.cwd(), loc.path || loc.file || 'src'),
                line: loc.line || 1,
                message: `Export duplicado ambiguo (Fallow): '${d.export_name || d.name || ''}'`,
                context: d.export_name || d.name || '',
                severity: 'error',
                fixable: false,
                packageName: 'Fallow',
                ruleId: 'fallow-duplicate-exports',
                ruleDescription: 'Exports duplicados'
            });
        }
    }
}
function mapExportsAndSuppressions(data, violations) {
    mapStaleSuppressions(data, violations);
    mapDuplicateExports(data, violations);
}
function mapUnusedDepsAndExports(data, violations) {
    const unusedDeps = [
        ...(data.unused_dependencies || []),
        ...(data.unused_dev_dependencies || []),
        ...(data.dead_code?.unused_dependencies || []),
        ...(data.dead_code?.unused_dev_dependencies || [])
    ];
    for (const d of unusedDeps) {
        violations.push({
            file: path.resolve(process.cwd(), d.path || 'package.json'),
            line: d.line || 1,
            message: `Dependencia de package.json no usada (Fallow): '${d.package_name}'`,
            context: d.package_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-dependencies',
            ruleDescription: 'Dependencias no usadas'
        });
    }
    const unusedExports = [...(data.unused_exports || []), ...(data.dead_code?.unused_exports || [])];
    for (const x of unusedExports) {
        violations.push({
            file: path.resolve(process.cwd(), x.path),
            line: x.line || 1,
            message: `Export no usado (Fallow): '${x.export_name}'`,
            context: x.export_name,
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-unused-exports',
            ruleDescription: 'Exports no usados'
        });
    }
}
function mapWorkspaceDiagnostics(data, violations) {
    const diagnostics = [
        ...(data.workspace_diagnostics || []),
        ...(data.dead_code?.workspace_diagnostics || [])
    ];
    for (const d of diagnostics) {
        if (d.kind === 'boundaries-not-configured' || d.kind === 'rule-packs-not-configured') {
            continue;
        }
        const filePath = d.path && d.path !== '.' ? d.path : 'package.json';
        violations.push({
            file: path.resolve(process.cwd(), filePath),
            line: 1,
            message: `Diagnóstico de workspace (Fallow): [${d.kind || 'diagnostic'}] ${d.message || ''}`,
            context: d.kind || 'workspace_diagnostic',
            severity: 'error',
            fixable: false,
            packageName: 'Fallow',
            ruleId: 'fallow-workspace-diagnostic',
            ruleDescription: 'Diagnóstico de workspace'
        });
    }
}
function mapFallowTargets(data, violations) {
    const auditCfg = getAuditConfig();
    if (!auditCfg.fallow?.enforceTargets)
        return;
    const maxPriority = auditCfg.fallow.maxTargetPriority ?? 'critical';
    const targets = data.targets || [];
    for (const t of targets) {
        const priority = t.priority ?? 0;
        let meetsThreshold;
        if (maxPriority === 'all') {
            meetsThreshold = priority > 0;
        }
        else if (maxPriority === 'high') {
            meetsThreshold = priority >= FALLOW_HIGH_PRIORITY_THRESHOLD;
        }
        else {
            meetsThreshold = priority >= FALLOW_CRITICAL_PRIORITY_THRESHOLD;
        }
        if (meetsThreshold) {
            violations.push({
                file: path.resolve(process.cwd(), t.path),
                line: 1,
                message: `Objetivo de refactorización crítico (Fallow [prioridad: ${priority}]): ${t.recommendation || t.category || 'Mantenimiento crítico'}`,
                context: t.category || 'refactoring-target',
                severity: 'error',
                fixable: false,
                packageName: 'Fallow',
                ruleId: 'fallow-refactoring-targets',
                ruleDescription: 'Objetivo de refactor'
            });
        }
    }
}
function mapFallowDeadCodeItems(data) {
    const violations = [];
    mapCircularAndUnusedFiles(data, violations);
    mapExportsAndSuppressions(data, violations);
    mapUnusedDepsAndExports(data, violations);
    mapFallowUnusedMembers(data, violations);
    mapFallowComponentEntities(data, violations);
    mapWorkspaceDiagnostics(data, violations);
    mapFallowTargets(data, violations);
    return violations;
}
export function mapFallowJson(command, data) {
    if (command === 'dupes' || command === 'triplets') {
        return mapFallowClones(command, data);
    }
    if (command === 'security') {
        return mapFallowSecurity(data);
    }
    if (command === 'audit' || command === 'dead-code') {
        const violations = mapFallowDeadCodeItems(data);
        if (data.complexity?.findings) {
            for (const f of data.complexity.findings) {
                addComplexityFinding(f, violations);
            }
        }
        return violations;
    }
    if (command === 'health') {
        const violations = [];
        const findings = data.findings || [];
        for (const f of findings) {
            addComplexityFinding(f, violations);
        }
        mapFallowTargets(data, violations);
        return violations;
    }
    return [];
}
export function getViolationCategory(v) {
    const desc = v.ruleDescription || v.ruleId;
    if (desc) {
        if (v.packageName && !desc.toLowerCase().startsWith(v.packageName.toLowerCase() + ':')) {
            const combined = `${v.packageName}: ${desc}`;
            return combined.length <= MAX_AUDITOR_DESCRIPTION_LENGTH ? combined : desc;
        }
        return desc;
    }
    return 'Otros';
}
const MAX_CONTEXT_SNIPPET_LENGTH = 50;
const DEFAULT_TOP_LIMIT = 15;
const MAX_FILES_TO_SHOW_IN_TERMINAL = 25;
const MAX_VIOLATIONS_PER_FILE_IN_TERMINAL = 10;
const FALLOW_DUPES_CONFIG = ['--min-occurrences', '2'];
const FALLOW_TRIPLETS_CONFIG = ['--min-occurrences', '3', '--min-lines', '10', '--min-tokens', '60'];
function sanitizeContext(ctx) {
    if (!ctx)
        return '';
    return ctx.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT_SNIPPET_LENGTH);
}
function extractSelectedRules(values, positionals) {
    const collectedRules = [
        ...(Array.isArray(values.rule) ? values.rule : [values.rule]),
        ...(Array.isArray(values.rules) ? values.rules : [values.rules]),
        ...positionals.filter(p => p.toLowerCase() === 'dox' || p.includes(','))
    ].filter(Boolean).map(String);
    const selectedRules = new Set();
    for (const raw of collectedRules) {
        for (const part of raw.split(',')) {
            const clean = part.trim().toLowerCase();
            if (clean)
                selectedRules.add(clean);
        }
    }
    return selectedRules;
}
function filterActiveConfigRules(selectedRules) {
    const activeConfigRules = new Set();
    for (const rule of Object.values(config)) {
        if (matchesRule(rule, selectedRules)) {
            activeConfigRules.add(rule);
        }
    }
    return activeConfigRules;
}
function computeSubsystemFlags(values, selectedRules) {
    const hasSpecificRules = selectedRules.size > 0;
    return {
        isZIndexActive: (!hasSpecificRules || matchesRule(Z_INDEX_CONSISTENCY_DESCRIPTOR, selectedRules)) && getAuditConfig().styles?.zLayersEnabled !== false,
        isDoxActive: !hasSpecificRules || matchesRule(DOX_ANALYZER_DESCRIPTOR, selectedRules),
        isFallowDupesActive: !hasSpecificRules || matchesRule(FALLOW_SUITE_DESCRIPTORS.dupes, selectedRules),
        isFallowTripletsActive: !hasSpecificRules || matchesRule(FALLOW_SUITE_DESCRIPTORS.triplets, selectedRules),
        isFallowSecurityActive: !hasSpecificRules || matchesRule(FALLOW_SUITE_DESCRIPTORS.security, selectedRules),
        isFallowDeadCodeActive: !hasSpecificRules || matchesRule(FALLOW_SUITE_DESCRIPTORS['dead-code'], selectedRules),
        isFallowHealthActive: !hasSpecificRules || matchesRule(FALLOW_SUITE_DESCRIPTORS.health, selectedRules),
        isCssCheckerActive: Boolean(values['css-only']) || (hasSpecificRules && matchesRule(CSS_ANALYZER_DESCRIPTOR, selectedRules)),
        isConstantDetectorActive: hasSpecificRules && matchesRule(CONSTANT_ANALYZER_DESCRIPTOR, selectedRules),
        isSassMigratorActive: !hasSpecificRules || matchesRule(SASS_MIGRATOR_DESCRIPTOR, selectedRules),
        isHumanMode: Boolean(values.human || values.pretty || values.summary)
    };
}
function parseProjectCliContext(cliArgs) {
    const rawCliArgs = cliArgs || process.argv.slice(2);
    const normalizedCliArgs = rawCliArgs.map(cliParam => {
        if (cliParam.includes('=') && !cliParam.startsWith('-'))
            return `--${cliParam}`;
        if (['fix', 'summary', 'json', 'human', 'pretty', 'errors-only', 'css-only'].includes(cliParam))
            return `--${cliParam}`;
        return cliParam;
    });
    const parsedConfig = parseArgs({
        args: normalizedCliArgs,
        options: {
            fix: { type: 'boolean', short: 'f' },
            path: { type: 'string', short: 'p', default: '.' },
            output: { type: 'string', short: 'o' },
            summary: { type: 'boolean', short: 's' },
            json: { type: 'boolean', short: 'j' },
            human: { type: 'boolean', short: 'H' },
            pretty: { type: 'boolean' },
            top: { type: 'string', short: 't' },
            'changed-since': { type: 'string' },
            'errors-only': { type: 'boolean' },
            'css-only': { type: 'boolean' },
            rule: { type: 'string', short: 'r', multiple: true },
            rules: { type: 'string', multiple: true }
        },
        allowPositionals: true,
        strict: false
    });
    const values = parsedConfig.values;
    const positionals = parsedConfig.positionals;
    const selectedRules = extractSelectedRules(values, positionals);
    const activeConfigRules = filterActiveConfigRules(selectedRules);
    const subsystemFlags = computeSubsystemFlags(values, selectedRules);
    return {
        values,
        selectedRules,
        activeConfigRules,
        ...subsystemFlags
    };
}
async function runConsistencyAndDox(ctx, logProgress) {
    const violations = [];
    if (ctx.isZIndexActive) {
        logProgress(styleText('cyan', '[1/6] 🎨 Verificando paridad de capas Z (TypeScript <-> SCSS)...'));
        const syncErrors = await checkZIndexConsistency(Boolean(ctx.values.fix));
        if (syncErrors.length > 0) {
            logProgress(styleText('magenta', `\n[SYNC] Desincronización detectada en paridad de Z-Layers:`));
            syncErrors.forEach(e => logProgress(styleText('yellow', `  -> ${e}`)));
            const configStyles = getAuditConfig().styles;
            const rawTarget = configStyles?.zLayersScssFile ?? configStyles?.baseScssFile;
            const targetFile = resolveZLayersScssPath(process.cwd()) || rawTarget || 'audit.config.ts';
            for (const err of syncErrors) {
                violations.push({
                    file: targetFile,
                    line: 1,
                    message: `Desincronización de z-index: ${err}`,
                    context: 'z-index',
                    severity: 'error',
                    fixable: true
                });
            }
        }
    }
    if (ctx.isDoxActive) {
        logProgress(styleText('cyan', '[2/6] 📘 Escaneando jerarquía e integridad de índices AGENTS.md / DOX...'));
        const doxErrors = await checkDoxIntegrity(process.cwd(), getEffectiveIgnoreDirs());
        violations.push(...doxErrors);
    }
    return violations;
}
async function runAstFileScans(ctx, logProgress) {
    const shouldScanFiles = ctx.activeConfigRules.size > 0;
    const changedSince = ctx.values['changed-since'];
    let files = [];
    let violations = [];
    if (!shouldScanFiles)
        return { violations, files };
    if (changedSince) {
        files = getChangedFiles(changedSince);
        logProgress(styleText('cyan', `[3/6] 🔍 Auditando archivos modificados desde: '${changedSince}' (${files.length} archivos)...`));
    }
    else {
        files = await getFilesToAudit(path.resolve(process.cwd(), ctx.values.path));
        logProgress(styleText('cyan', `[3/6] 🔍 Auditando AST y reglas de código en ${files.length} archivos...`));
    }
    let processed = 0;
    const total = files.length;
    for (const f of files) {
        processed++;
        if (processed % 200 === 0 || processed === total) {
            logProgress(styleText('cyan', `   ⏳ Progreso AST: ${processed}/${total} archivos (${Math.round((processed / total) * 100)}%)`));
        }
        violations = violations.concat(await auditFile(f, Boolean(ctx.values.fix), ctx.activeConfigRules));
    }
    return { violations, files };
}
function runChangedSinceFallow(changedSince, ctx, isSecurityActive, logProgress) {
    let violations = [];
    if (ctx.isFallowDeadCodeActive || isSecurityActive) {
        logProgress(styleText('cyan', '   -> Fallow audit & security (archivos modificados)...'));
        if (ctx.isFallowDeadCodeActive)
            violations = violations.concat(runFallow('audit', ['--changed-since', changedSince]));
        if (isSecurityActive)
            violations = violations.concat(runFallow('security', ['--changed-since', changedSince]));
    }
    return violations;
}
function logFallowStepProgress(stepNumber, title, violationsCount, logProgress) {
    const badge = violationsCount > 0 ? ` (🐛 ${violationsCount})` : '';
    logProgress(styleText('cyan', `   ├─ [${stepNumber}/5] Fallow: ${title}${badge}...`));
}
function runFullFallowSuites(ctx, isSecurityActive, logProgress) {
    let violations = [];
    if (ctx.isFallowDupesActive) {
        const res = runFallow('dupes', FALLOW_DUPES_CONFIG, 'dupes');
        logFallowStepProgress(1, 'Duplicación de código', res.length, logProgress);
        violations = violations.concat(res);
    }
    if (ctx.isFallowTripletsActive) {
        const res = runFallow('dupes', FALLOW_TRIPLETS_CONFIG, 'triplets');
        logFallowStepProgress(2, 'Triplicación de código', res.length, logProgress);
        violations = violations.concat(res);
    }
    if (isSecurityActive) {
        const res = runFallow('security');
        logFallowStepProgress(3, 'Análisis de seguridad CWE', res.length, logProgress);
        violations = violations.concat(res);
    }
    if (ctx.isFallowDeadCodeActive) {
        const res = runFallow('dead-code');
        logFallowStepProgress(4, 'Análisis de código muerto', res.length, logProgress);
        violations = violations.concat(res);
    }
    if (ctx.isFallowHealthActive) {
        const res = runFallow('health');
        logProgress(styleText('cyan', '   └─ [5/5] Fallow: Cálculo de métricas de salud (completado)...'));
        violations = violations.concat(res);
    }
    return violations;
}
function runFallowSuites(ctx, logProgress) {
    const cfg = getAuditConfig();
    const fallowSecActive = cfg.fallow?.security?.enabled ?? cfg.security?.enabled ?? true;
    const isSecurityActive = ctx.isFallowSecurityActive && (cfg.fallow?.enabled !== false) && (fallowSecActive !== false);
    const isScopedSubpath = Boolean(ctx.values.path && ctx.values.path !== '.');
    const anyFallowActive = (ctx.isFallowDupesActive || ctx.isFallowTripletsActive || isSecurityActive || ctx.isFallowDeadCodeActive || ctx.isFallowHealthActive) && !isScopedSubpath;
    if (!anyFallowActive)
        return [];
    logProgress(styleText('cyan', '[4/6] 🛡️ Ejecutando suite de inteligencia Fallow (dupes, triplets, security, dead-code, health)...'));
    const changedSince = ctx.values['changed-since'];
    return changedSince
        ? runChangedSinceFallow(changedSince, ctx, isSecurityActive, logProgress)
        : runFullFallowSuites(ctx, isSecurityActive, logProgress);
}
function filterAndGroupViolations(rawViolations, ctx) {
    let all = rawViolations;
    if (ctx.values.path) {
        const normPath = path.normalize(ctx.values.path);
        all = all.filter(v => path.normalize(v.file).includes(normPath));
    }
    if (ctx.values['errors-only']) {
        all = all.filter(v => v.severity === 'error');
    }
    if (ctx.selectedRules.size > 0) {
        all = all.filter(v => {
            const category = getViolationCategory(v);
            const desc = {
                id: v.ruleId || category,
                name: v.message,
                category: category,
                aliases: [v.context, path.basename(v.file)]
            };
            return matchesRule(desc, ctx.selectedRules);
        });
    }
    all.sort((a, b) => {
        if (a.severity === 'error' && b.severity !== 'error')
            return -1;
        if (a.severity !== 'error' && b.severity === 'error')
            return 1;
        return 0;
    });
    const fileGroups = {};
    const typeGroups = {};
    for (const v of all) {
        const rel = path.relative(process.cwd(), v.file);
        if (!fileGroups[rel])
            fileGroups[rel] = [];
        fileGroups[rel].push(v);
        const category = getViolationCategory(v);
        typeGroups[category] = (typeGroups[category] || 0) + 1;
    }
    return { all, fileGroups, typeGroups };
}
function renderHumanSummaryView(typeGroups, topFiles, topLimit) {
    console.log(styleText('bold', '\n--- 📊 RESUMEN DE AUDITORÍA DE CÓDIGO ---'));
    console.log('\nPor tipo de regla:');
    Object.entries(typeGroups)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
        console.log(`  - ${cat}: ${count}`);
    });
    console.log(`\nTop ${topLimit} archivos con más problemas:`);
    topFiles.forEach(f => {
        console.log(`  - ${f.file}: ${f.total} violaciones (${f.errors} ❌, ${f.warnings} ⚠️)`);
    });
}
function renderHumanFileViolations(file, violations) {
    const fileErrors = violations.filter(v => v.severity === 'error').length;
    const fileWarns = violations.filter(v => v.severity === 'warning').length;
    console.log(`\n📁 ${styleText('bold', file)} (${violations.length} avisos: ${fileErrors} ❌, ${fileWarns} ⚠️)`);
    for (const v of violations.slice(0, MAX_VIOLATIONS_PER_FILE_IN_TERMINAL)) {
        const icon = v.severity === 'error' ? '❌ ERROR' : '⚠️ WARN ';
        const color = v.severity === 'error' ? 'red' : 'yellow';
        const lineStr = `L${v.line}`.padEnd(5);
        const snippet = sanitizeContext(v.context);
        const snippetStr = snippet ? ` ("${snippet}")` : '';
        console.log(`  ${lineStr} ${styleText(color, icon)} [${getViolationCategory(v)}] ${v.message}${snippetStr}`);
    }
    if (violations.length > MAX_VIOLATIONS_PER_FILE_IN_TERMINAL) {
        console.log(styleText('cyan', `  ... y ${violations.length - MAX_VIOLATIONS_PER_FILE_IN_TERMINAL} aviso(s) más en este archivo.`));
    }
}
function renderHumanDetailView(fileGroups) {
    console.log(styleText('bold', '\n--- 🔎 DETALLE DE VIOLACIONES POR ARCHIVO ---'));
    const entries = Object.entries(fileGroups);
    const filesToShow = entries.slice(0, MAX_FILES_TO_SHOW_IN_TERMINAL);
    for (const [file, violations] of filesToShow) {
        renderHumanFileViolations(file, violations);
    }
    if (entries.length > MAX_FILES_TO_SHOW_IN_TERMINAL) {
        console.log(styleText('cyan', `\n[INFO] Se muestran ${MAX_FILES_TO_SHOW_IN_TERMINAL} de ${entries.length} archivos con avisos para evitar saturar la terminal.`));
        console.log(styleText('cyan', `👉 Usa "npm run audit errors-only" para filtrar solo errores o consulta scratch/audits/latest_audit.json para el volcado completo.`));
    }
}
function renderHumanTerminalReport(fileGroups, typeGroups, topFiles, errorsCount, warningsCount, topLimit, values, archJsonPath) {
    if (values.summary) {
        renderHumanSummaryView(typeGroups, topFiles, topLimit);
    }
    else {
        renderHumanDetailView(fileGroups);
    }
    console.log(styleText('bold', '\n======================================================'));
    console.log(`📊 TOTAL: ${errorsCount === 0 ? styleText('green', '0 Errores') : styleText('red', `${errorsCount} Errores`)} | ${styleText('yellow', `${warningsCount} Advertencias`)} | ${Object.keys(fileGroups).length} Archivos`);
    console.log('======================================================');
    console.log(styleText('dim', `💾 Reporte detallado guardado en: ${path.relative(process.cwd(), archJsonPath)}\n`));
}
async function exportProjectReportOutput(values, jsonReport, all, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, logProgress) {
    if (!values.output)
        return;
    const outputPath = path.resolve(process.cwd(), values.output);
    if (outputPath.endsWith('.json')) {
        await fs.writeFile(outputPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
    }
    else if (outputPath.endsWith('.md')) {
        let md = `# Reporte de Auditoría del Proyecto\n\n`;
        md += `**Estado**: ${errorsCount === 0 ? '✅ Aprobado' : '❌ Fallido'}\n\n`;
        md += `| Métrica | Valor |\n| :--- | :--- |\n`;
        md += `| **Errores** | \`${errorsCount}\` |\n`;
        md += `| **Advertencias** | \`${warningsCount}\` |\n`;
        md += `| **Archivos Afectados** | \`${Object.keys(fileGroups).length}\` |\n\n`;
        md += `## 📊 Desglose por Categoría\n\n| Categoría | Cantidad |\n| :--- | :---: |\n`;
        Object.entries(typeGroups)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, count]) => {
            md += `| ${cat} | ${count} |\n`;
        });
        md += `\n## 📁 Top Archivos con Más Avisos\n\n| Archivo | Errores | Advertencias | Total |\n| :--- | :---: | :---: | :---: |\n`;
        topFiles.forEach(f => {
            md += `| \`${f.file}\` | ${f.errors} | ${f.warnings} | ${f.total} |\n`;
        });
        await fs.writeFile(outputPath, md, 'utf-8');
    }
    else {
        const lines = all.map(v => `[${v.severity.toUpperCase()}] ${path.relative(process.cwd(), v.file)}:${v.line} -> [${getViolationCategory(v)}] ${v.message} ("${sanitizeContext(v.context)}")`);
        await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    }
    logProgress(styleText('cyan', `✨ Reporte completo escrito en: ${values.output}`));
}
async function runStylelintFindings(logProgress, stepLabel) {
    logProgress(styleText('cyan', stepLabel));
    const stylelint = new StylelintAuditor({ projectRoot: process.cwd() });
    const res = await stylelint.execute();
    const violations = [];
    for (const f of res.findings) {
        violations.push({
            file: path.resolve(process.cwd(), f.file || 'src'),
            line: f.line || 1,
            message: f.message || 'Stylelint violation',
            context: f.context || f.ruleId || 'stylelint',
            severity: f.severity === 'info' ? 'warning' : f.severity,
            fixable: false,
            packageName: 'Stylelint',
            ruleId: f.ruleId,
            ruleDescription: f.ruleDescription
        });
    }
    return violations;
}
async function executeProjectAuditPhases(ctx, logProgress) {
    let all = [];
    let files = [];
    if (ctx.values['css-only']) {
        all = await runStylelintFindings(logProgress, '[1/1] 🎨 Ejecutando análisis de estilos con Stylelint (duplicados y calidad)...');
        return { all, files };
    }
    all = all.concat(await runConsistencyAndDox(ctx, logProgress));
    const astResult = await runAstFileScans(ctx, logProgress);
    files = astResult.files;
    all = all.concat(astResult.violations);
    all = all.concat(runFallowSuites(ctx, logProgress));
    if (ctx.isCssCheckerActive) {
        const styleViolations = await runStylelintFindings(logProgress, '[5/6] 🎨 Ejecutando análisis de calidad y duplicación CSS/SCSS (Stylelint)...');
        all = all.concat(styleViolations);
    }
    if (ctx.isConstantDetectorActive) {
        logProgress(styleText('cyan', '[6/6] 🧩 Ejecutando análisis de constantes duplicadas entre módulos...'));
        const filesForConstants = files.length > 0 ? files : await getFilesToAudit(path.resolve(process.cwd(), ctx.values.path || '.'));
        all = all.concat(await detectDuplicateConstants(filesForConstants));
    }
    return { all, files };
}
function buildProjectTopFiles(fileGroups, topLimit) {
    return Object.entries(fileGroups)
        .map(([file, violations]) => ({
        file,
        errors: violations.filter(v => v.severity === 'error').length,
        warnings: violations.filter(v => v.severity === 'warning').length,
        total: violations.length
    }))
        .sort((a, b) => b.total - a.total)
        .slice(0, topLimit);
}
function buildProjectJsonReport(params) {
    const { all, files, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, durationMs } = params;
    return {
        id: 'audit_project',
        name: 'Project Architecture & Style Rules',
        family: 'architecture',
        status: errorsCount > 0 ? 'failed' : 'passed',
        durationMs,
        metrics: {
            'Archivos Escaneados': files.length,
            'Archivos Afectados': Object.keys(fileGroups).length
        },
        findings: all.map(v => ({
            severity: v.severity,
            message: v.message,
            file: v.file,
            line: v.line,
            context: sanitizeContext(v.context),
            ruleId: v.ruleId || getViolationCategory(v),
            ruleDescription: getViolationCategory(v)
        })),
        summary: {
            errors: errorsCount,
            warnings: warningsCount,
            info: 0,
            totalFilesScanned: files.length,
            totalViolations: all.length,
            filesWithIssues: Object.keys(fileGroups).length,
            byCategory: typeGroups
        },
        topFiles,
        files: Object.fromEntries(Object.entries(fileGroups).map(([file, violations]) => [
            file,
            violations.map(v => ({
                line: v.line,
                severity: v.severity,
                category: getViolationCategory(v),
                message: v.message,
                context: sanitizeContext(v.context)
            }))
        ]))
    };
}
async function persistProjectReports(jsonReport) {
    const scratchArchDir = path.resolve(process.cwd(), 'scratch/audits/architecture');
    await fs.mkdir(scratchArchDir, { recursive: true });
    const archJsonPath = path.join(scratchArchDir, 'audit_project.json');
    const latestArchJsonPath = path.resolve(process.cwd(), 'scratch/audits/latest_audit_project.json');
    const jsonReportStr = JSON.stringify(jsonReport, null, 2);
    await fs.writeFile(archJsonPath, jsonReportStr, 'utf-8');
    await fs.writeFile(latestArchJsonPath, jsonReportStr, 'utf-8');
    return { archJsonPath, jsonReportStr };
}
async function main(cliArgs) {
    await loadAuditConfig();
    const startTime = performance.now();
    const ctx = parseProjectCliContext(cliArgs);
    function logProgress(msg) {
        if (process.env.AUDIT_SUBPROCESS === 'true') {
            return;
        }
        if (ctx.isHumanMode) {
            console.log(msg);
        }
        else {
            process.stderr.write(msg + '\n');
        }
    }
    logProgress(styleText('bold', '--- 🔎 REGLAS DE CÓDIGO Y ESTRUCTURA DOX (audit_project.ts) ---'));
    if (ctx.selectedRules.size > 0) {
        logProgress(styleText('cyan', `🎯 Ejecución selectiva de reglas: [ ${Array.from(ctx.selectedRules).join(', ')} ]`));
    }
    const { all: rawAll, files } = await executeProjectAuditPhases(ctx, logProgress);
    const { all, fileGroups, typeGroups } = filterAndGroupViolations(rawAll, ctx);
    const topLimit = ctx.values.top ? parseInt(ctx.values.top, 10) : DEFAULT_TOP_LIMIT;
    const topFiles = buildProjectTopFiles(fileGroups, topLimit);
    const errorsCount = all.filter(v => v.severity === 'error').length;
    const warningsCount = all.filter(v => v.severity === 'warning').length;
    const jsonReport = buildProjectJsonReport({
        all,
        files,
        fileGroups,
        typeGroups,
        topFiles,
        errorsCount,
        warningsCount,
        durationMs: Math.round(performance.now() - startTime)
    });
    const { archJsonPath, jsonReportStr } = await persistProjectReports(jsonReport);
    if (process.env.AUDIT_SUBPROCESS !== 'true') {
        if (ctx.isHumanMode) {
            renderHumanTerminalReport(fileGroups, typeGroups, topFiles, errorsCount, warningsCount, topLimit, ctx.values, archJsonPath);
        }
        else {
            console.log(jsonReportStr);
        }
    }
    await exportProjectReportOutput(ctx.values, jsonReport, all, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, logProgress);
    if (ctx.values.fix)
        logProgress(styleText('cyan', '✨ Correcciones aplicadas.'));
    return all;
}
export class ProjectArchitectureAuditor extends BaseAuditor {
    constructor() {
        super({
            capabilities: { fix: true, lint: true, md: true, ast: true, changedSince: true, heavy: true },
            id: 'audit_project',
            name: 'Project Architecture & Style Rules',
            description: 'Audita reglas de arquitectura, TypeScript y estilo',
            family: 'architecture',
            packageName: 'Arquitectura',
            icon: '🏛️',
            coverage: {
                include: ['**/*.{vue,scss,css,ts,js,md}']
            },
            ruleDescriptions: {
                'banned-ts-suppression': 'Directivas @ts-ignore o casts a any',
                'domain-type-violation': 'Violación de tipo de dominio',
                'strict-null-violation': 'Violación de chequeo de null',
                'no-tautological-integration-mocks': 'Mocks tautológicos en integración',
                'playwright-id-locators-only': 'Locators Playwright sin atributo ID',
                'no-playwright-force-click': 'Clicks forzados prohibidos',
                'fallow-duplicate-code': 'Código duplicado detectado',
                'fallow-triplicate-code': 'Código triplicado crítico',
                'fallow-complexity': 'Complejidad de función excesiva',
                'fallow-cognitive-complexity': 'Complejidad cognitiva excesiva',
                'fallow-cyclomatic-complexity': 'Complejidad ciclomática excesiva',
                'fallow-unused-export': 'Export no utilizado detectado',
                'fallow-unresolved-imports': 'Import no resuelto detectado',
                'fallow-circular-dependencies': 'Dependencia circular detectada',
                'fallow-unlisted-dependencies': 'Dependencia no listada en package',
                'fallow-boundary-violations': 'Violación de límite arquitectónico',
                'fallow-stale-suppressions': 'Supresión obsoleta de Fallow'
            }
        });
    }
    async runAudit() {
        const files = await getFilesToAudit(this.projectRoot);
        for (const f of files) {
            this.recordScanned(f);
        }
        for (const r of Object.keys(this.ruleDescriptions ?? {})) {
            this.markRuleEvaluated(r);
        }
        const violations = await main();
        for (const v of violations) {
            const relFile = v.file
                ? (path.isAbsolute(v.file) ? path.relative(this.projectRoot, v.file).replace(/\\/g, '/') : v.file.replace(/\\/g, '/'))
                : '';
            this.addViolation({
                ruleId: v.ruleId || getViolationCategory(v),
                ruleDescription: v.ruleDescription,
                severity: v.severity,
                file: relFile,
                line: v.line,
                message: v.message,
                context: v.context
            });
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ProjectArchitectureAuditor());
//# sourceMappingURL=audit_project.js.map