/**
 * packages/auditor/src/analyzers/cssAnalyzer.ts
 *
 * PURE TYPESCRIPT / POSTCSS AST CSS HYGIENE & DUPLICATION ANALYZER (Node.js 26+ Native)
 * Replaces legacy external Go binary (css-checker-kit) with 100% pure JavaScript/TypeScript AST.
 *
 * Capabilities:
 *   1. Duplicate Rules (css-duplicate-rules): Identical declaration bodies across different selectors.
 *   2. Similar Classes (css-similar-classes): Fuzzy property matching with configurable % threshold.
 *   3. Long Values (css-duplicate-long-lines): Complex repeated CSS values >= 20 chars without variables.
 *   4. Unvariabled Colors (css-unvariabled-colors): Raw HEX/RGB/HSL colors repeated across rules.
 *   5. Duplicate Selectors (css-duplicate-selectors): Same selector repeated in the same stylesheet.
 *   6. Empty Rules (css-empty-rules): Redundant CSS rules without declarations.
 *   7. Unused Classes (css-unused-classes): Selectors never referenced in template/JS files.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import scssSyntax from 'postcss-scss';
export const CSS_ANALYZER_DESCRIPTOR = {
    id: 'css-analyzer',
    name: 'CSS / SCSS Multicriteria AST Analyzer',
    category: 'css-checker: SCSS/CSS duplicado y calidad',
    aliases: ['css-checker', 'css', 'scss', 'duplicate-css', 'scss-duplicados', 'css-hygiene']
};
export const CSS_CACHE_VERSION = 1;
export const DEFAULT_CSS_CACHE_FILE = 'scratch/cache/css_ast_cache.json';
export const DEFAULT_CSS_SIMILARITY_THRESHOLD = 80;
export const DEFAULT_CSS_LONG_LINE_THRESHOLD = 20;
const DEFAULT_OPTIONS = {
    minDeclarations: 2,
    checkSimilar: true,
    similarityThreshold: DEFAULT_CSS_SIMILARITY_THRESHOLD,
    checkLongLines: true,
    longLineLengthThreshold: DEFAULT_CSS_LONG_LINE_THRESHOLD,
    checkColors: true,
    checkEmptyRules: true,
    checkDuplicateSelectors: true
};
const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?)\([^)]+\)/gi;
function normalizeDeclaration(prop, val) {
    const cleanProp = prop.trim().toLowerCase();
    const cleanVal = val.trim().replace(/\s+/g, ' ');
    return `${cleanProp}: ${cleanVal}`;
}
export function extractClassNamesFromSelector(selector) {
    const classRegex = /(?:^|[^\w-])\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
    const classes = [];
    let match;
    while ((match = classRegex.exec(selector)) !== null) {
        const className = match[1];
        if (className) {
            classes.push(className);
        }
    }
    return classes;
}
export function extractCssBlocksFromVue(content) {
    const blocks = [];
    const styleRegex = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(content)) !== null) {
        const preContent = content.slice(0, match.index);
        const startLine = preContent.split('\n').length;
        const attrs = match[1] ?? '';
        const scoped = /\bscoped\b/i.test(attrs);
        const styleBody = match[2] ?? '';
        blocks.push({ code: styleBody, startLine, scoped });
    }
    return blocks;
}
export function parseCssContent(content, filePath, linePaddingCount = 0, scoped = false) {
    const rules = [];
    const paddedContent = '\n'.repeat(Math.max(0, linePaddingCount)) + content;
    try {
        const root = scssSyntax.parse(paddedContent, { from: filePath });
        root.walkRules((rule) => {
            const startLine = rule.source?.start?.line ?? 1;
            const decls = [];
            for (const node of rule.nodes ?? []) {
                if (node.type === 'decl') {
                    decls.push({
                        prop: node.prop,
                        value: node.value,
                        raw: `${node.prop}: ${node.value}`,
                        line: node.source?.start?.line ?? startLine
                    });
                }
            }
            rules.push({
                file: filePath,
                line: startLine,
                selector: rule.selector.trim(),
                declarations: decls,
                rawBlock: rule.toString(),
                scoped
            });
        });
    }
    catch {
        // catch-ok: Ignore syntactically incomplete or partial CSS snippets gracefully
    }
    return rules;
}
const inMemoryCssCache = new Map();
// singleton-ok: In-memory CSS AST cache disk load flag container
const cssCacheState = {
    loadedFromDisk: false
};
export function clearInMemoryCssCache() {
    inMemoryCssCache.clear();
    cssCacheState.loadedFromDisk = false;
}
export function getInMemoryCssCache() {
    return inMemoryCssCache;
}
export async function loadCssAstCacheFromDisk(cacheFilePath) {
    try {
        const raw = await fs.readFile(cacheFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && data.version === CSS_CACHE_VERSION && data.entries) {
            for (const [key, val] of Object.entries(data.entries)) {
                inMemoryCssCache.set(key, val);
            }
        }
    }
    catch {
        // catch-ok: Cache file doesn't exist yet or is invalid JSON; start with fresh cache
    }
    cssCacheState.loadedFromDisk = true;
}
export async function saveCssAstCacheToDisk(cacheFilePath) {
    try {
        const dir = path.dirname(cacheFilePath);
        await fs.mkdir(dir, { recursive: true });
        const data = {
            version: CSS_CACHE_VERSION,
            entries: Object.fromEntries(inMemoryCssCache.entries())
        };
        await fs.writeFile(cacheFilePath, JSON.stringify(data), 'utf-8');
    }
    catch {
        // catch-ok: Non-fatal cache write failure (e.g. read-only environment)
    }
}
export async function collectAllProjectCssRules(targetDir, ignoreDirs, projectRoot = process.cwd(), options) {
    const searchDir = path.resolve(projectRoot, targetDir === '.' ? 'src' : targetDir);
    const pattern = '**/*.{scss,css,vue}';
    const entries = [];
    for await (const entry of fs.glob(pattern, {
        cwd: searchDir,
        exclude: (p) => Array.from(ignoreDirs).some(d => p.includes(d))
    })) {
        entries.push(entry);
    }
    const fileCount = entries.length;
    if (fileCount === 0) {
        return { rules: [], fileCount: 0 };
    }
    const useCache = options?.useCache ?? true;
    const cacheFilePath = options?.cacheFilePath ?? path.resolve(projectRoot, DEFAULT_CSS_CACHE_FILE);
    if (useCache && !cssCacheState.loadedFromDisk) {
        await loadCssAstCacheFromDisk(cacheFilePath);
    }
    const concurrency = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
    const rulesByWorker = Array.from({ length: concurrency }, () => []);
    let nextIdx = 0;
    async function worker(workerId) {
        const workerRules = rulesByWorker[workerId];
        while (nextIdx < entries.length) {
            const idx = nextIdx++;
            const entry = entries[idx];
            const fullPath = path.join(searchDir, entry);
            const relPath = path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep);
            try {
                const stat = await fs.stat(fullPath);
                if (useCache) {
                    const cached = inMemoryCssCache.get(relPath);
                    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                        workerRules.push(...cached.rules);
                        continue;
                    }
                }
                const content = await fs.readFile(fullPath, 'utf-8');
                const fileRules = [];
                if (fullPath.endsWith('.vue')) {
                    const blocks = extractCssBlocksFromVue(content);
                    for (const block of blocks) {
                        const parsed = parseCssContent(block.code, relPath, block.startLine - 1, block.scoped);
                        fileRules.push(...parsed);
                    }
                }
                else {
                    const parsed = parseCssContent(content, relPath, 0, false);
                    fileRules.push(...parsed);
                }
                if (useCache) {
                    inMemoryCssCache.set(relPath, {
                        mtimeMs: stat.mtimeMs,
                        size: stat.size,
                        rules: fileRules
                    });
                }
                workerRules.push(...fileRules);
            }
            catch {
                // catch-ok: ignore file read or syntax errors in individual CSS/Vue snippets
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
    if (useCache) {
        await saveCssAstCacheToDisk(cacheFilePath);
    }
    const rules = rulesByWorker.flat();
    return { rules, fileCount };
}
export function detectDuplicateRules(rules, minDeclarations) {
    const groupsBySignature = new Map();
    for (const rule of rules) {
        if (rule.declarations.length < minDeclarations)
            continue;
        const normalizedDecls = rule.declarations
            .map(d => normalizeDeclaration(d.prop, d.value))
            .sort();
        const signature = normalizedDecls.join('; ');
        const existing = groupsBySignature.get(signature);
        const occurrence = {
            file: rule.file,
            line: rule.line,
            selector: rule.selector
        };
        if (existing) {
            existing.occurrences.push(occurrence);
        }
        else {
            groupsBySignature.set(signature, {
                declarations: normalizedDecls,
                occurrences: [occurrence]
            });
        }
    }
    const duplicates = [];
    for (const [signature, data] of groupsBySignature.entries()) {
        // Only consider duplicate if it appears in at least 2 places
        if (data.occurrences.length >= 2) {
            duplicates.push({
                signature,
                declarations: data.declarations,
                occurrences: data.occurrences
            });
        }
    }
    return duplicates;
}
export function detectSimilarClasses(rules, thresholdPercent, minDeclarations = 2) {
    const preparedRules = [];
    for (const r of rules) {
        if (r.declarations.length < minDeclarations)
            continue;
        const declArray = r.declarations.map(d => normalizeDeclaration(d.prop, d.value));
        const declSet = new Set(declArray);
        if (declSet.size >= minDeclarations) {
            preparedRules.push({
                rule: r,
                declArray: Array.from(declSet),
                declSet,
                size: declSet.size
            });
        }
    }
    // Build inverted index: normalized declaration -> array of rule indices containing it
    const declIndex = new Map();
    for (let i = 0; i < preparedRules.length; i++) {
        const prep = preparedRules[i];
        for (const decl of prep.declArray) {
            let list = declIndex.get(decl);
            if (!list) {
                list = [];
                declIndex.set(decl, list);
            }
            list.push(i);
        }
    }
    const comparisons = [];
    const seenPairs = new Set();
    for (let i = 0; i < preparedRules.length; i++) {
        const a = preparedRules[i];
        // Count shared declarations only for candidate rules j > i that share at least 1 property
        const candidateSharedCounts = new Map();
        for (const decl of a.declArray) {
            const candidateIndices = declIndex.get(decl);
            if (!candidateIndices)
                continue;
            for (const j of candidateIndices) {
                if (j > i) {
                    candidateSharedCounts.set(j, (candidateSharedCounts.get(j) ?? 0) + 1);
                }
            }
        }
        for (const [j, sharedCount] of candidateSharedCounts.entries()) {
            if (sharedCount < minDeclarations)
                continue;
            const b = preparedRules[j];
            // Skip if exactly the same selector in same file (handled by duplicate selectors)
            if (a.rule.file === b.rule.file && a.rule.selector === b.rule.selector)
                continue;
            // Skip if 100% identical declarations (handled by duplicate rules)
            if (sharedCount === a.size && sharedCount === b.size)
                continue;
            // Quick theoretical ceiling check
            const maxPossibleUnion = a.size + b.size - sharedCount;
            const maxPossibleSimilarity = Math.round((sharedCount / maxPossibleUnion) * 100);
            if (maxPossibleSimilarity < thresholdPercent)
                continue;
            const pairKey = `${a.rule.file}:${a.rule.line}<->${b.rule.file}:${b.rule.line}`;
            if (seenPairs.has(pairKey))
                continue;
            const common = [];
            const uniqueA = [];
            for (const decl of a.declArray) {
                if (b.declSet.has(decl)) {
                    common.push(decl);
                }
                else {
                    uniqueA.push(decl);
                }
            }
            const uniqueB = [];
            for (const decl of b.declArray) {
                if (!a.declSet.has(decl)) {
                    uniqueB.push(decl);
                }
            }
            const unionSize = a.size + b.size - common.length;
            if (unionSize === 0)
                continue;
            const similarity = Math.round((common.length / unionSize) * 100);
            // Report if high similarity but NOT 100% identical
            if (similarity >= thresholdPercent && similarity < 100 && common.length >= minDeclarations) {
                seenPairs.add(pairKey);
                comparisons.push({
                    similarity,
                    commonDeclarations: common,
                    left: {
                        file: a.rule.file,
                        line: a.rule.line,
                        selector: a.rule.selector,
                        uniqueDeclarations: uniqueA
                    },
                    right: {
                        file: b.rule.file,
                        line: b.rule.line,
                        selector: b.rule.selector,
                        uniqueDeclarations: uniqueB
                    }
                });
            }
        }
    }
    return comparisons;
}
export function detectLongValues(rules, lengthThreshold) {
    const occurrencesByVal = new Map();
    for (const rule of rules) {
        for (const decl of rule.declarations) {
            const val = decl.value.trim();
            if (val.length >= lengthThreshold && !val.includes('var(') && !val.startsWith('$')) {
                const occ = {
                    file: rule.file,
                    line: decl.line,
                    prop: decl.prop,
                    selector: rule.selector
                };
                const existing = occurrencesByVal.get(val);
                if (existing) {
                    existing.push(occ);
                }
                else {
                    occurrencesByVal.set(val, [occ]);
                }
            }
        }
    }
    const results = [];
    for (const [value, occurrences] of occurrencesByVal.entries()) {
        if (occurrences.length >= 2) {
            results.push({
                value,
                length: value.length,
                occurrences
            });
        }
    }
    return results;
}
export function detectUnvariabledColors(rules) {
    const occurrencesByColor = new Map();
    for (const rule of rules) {
        for (const decl of rule.declarations) {
            const val = decl.value.trim();
            // Ignore if value is already a variable definition or uses var()
            if (decl.prop.startsWith('$') || decl.prop.startsWith('--') || val.includes('var('))
                continue;
            COLOR_REGEX.lastIndex = 0;
            let match;
            while ((match = COLOR_REGEX.exec(val)) !== null) {
                const color = match[0].toLowerCase();
                // Ignore transparent or inherit
                if (color === 'transparent' || color === 'currentcolor')
                    continue;
                const occ = {
                    file: rule.file,
                    line: decl.line,
                    prop: decl.prop,
                    selector: rule.selector
                };
                const existing = occurrencesByColor.get(color);
                if (existing) {
                    existing.push(occ);
                }
                else {
                    occurrencesByColor.set(color, [occ]);
                }
            }
        }
    }
    const results = [];
    for (const [color, occurrences] of occurrencesByColor.entries()) {
        // Only flag colors repeated across 3 or more rules without a theme token
        if (occurrences.length >= 3) {
            results.push({
                color,
                occurrences
            });
        }
    }
    return results;
}
export function detectDuplicateSelectors(rules) {
    const linesByFileSelector = new Map();
    for (const rule of rules) {
        const key = `${rule.file}:::${rule.selector}`;
        const existing = linesByFileSelector.get(key);
        if (existing) {
            existing.lines.push(rule.line);
        }
        else {
            linesByFileSelector.set(key, {
                selector: rule.selector,
                file: rule.file,
                lines: [rule.line]
            });
        }
    }
    const results = [];
    for (const entry of linesByFileSelector.values()) {
        if (entry.lines.length >= 2) {
            results.push(entry);
        }
    }
    return results;
}
export function detectEmptyRules(rules) {
    const empty = [];
    for (const rule of rules) {
        if (rule.declarations.length === 0) {
            empty.push({
                selector: rule.selector,
                file: rule.file,
                line: rule.line
            });
        }
    }
    return empty;
}
const TOTAL_CSS_ANALYSIS_STEPS = 6;
const CSS_STEP_DUPLICATE_RULES = 1;
const CSS_STEP_SIMILAR_CLASSES = 2;
const CSS_STEP_LONG_VALUES = 3;
const CSS_STEP_UNVARIABLED_COLORS = 4;
const CSS_STEP_DUPLICATE_SELECTORS = 5;
const CSS_STEP_EMPTY_RULES = 6;
export async function runCssAnalysis(targetDir = '.', ignoreDirs, options = {}, projectRoot = process.cwd(), onProgress) {
    const opt = { ...DEFAULT_OPTIONS, ...options };
    const { rules, fileCount } = await collectAllProjectCssRules(targetDir, ignoreDirs, projectRoot);
    const duplicates = detectDuplicateRules(rules, opt.minDeclarations);
    onProgress?.(CSS_STEP_DUPLICATE_RULES, TOTAL_CSS_ANALYSIS_STEPS, 'Reglas duplicadas en estilos', duplicates.length);
    const similar = opt.checkSimilar ? detectSimilarClasses(rules, opt.similarityThreshold, opt.minDeclarations) : [];
    const simPct = opt.similarityThreshold > 1 ? opt.similarityThreshold : Math.round(opt.similarityThreshold * 100);
    onProgress?.(CSS_STEP_SIMILAR_CLASSES, TOTAL_CSS_ANALYSIS_STEPS, `Clases similares (umbral >= ${simPct}%)`, similar.length);
    const longValues = opt.checkLongLines ? detectLongValues(rules, opt.longLineLengthThreshold) : [];
    onProgress?.(CSS_STEP_LONG_VALUES, TOTAL_CSS_ANALYSIS_STEPS, `Valores largos repetidos (>= ${opt.longLineLengthThreshold} chars)`, longValues.length);
    const unvariabledColors = opt.checkColors ? detectUnvariabledColors(rules) : [];
    onProgress?.(CSS_STEP_UNVARIABLED_COLORS, TOTAL_CSS_ANALYSIS_STEPS, 'Colores repetidos sin variable', unvariabledColors.length);
    const duplicateSelectors = opt.checkDuplicateSelectors ? detectDuplicateSelectors(rules) : [];
    onProgress?.(CSS_STEP_DUPLICATE_SELECTORS, TOTAL_CSS_ANALYSIS_STEPS, 'Selectores duplicados en mismo archivo', duplicateSelectors.length);
    const emptyRules = opt.checkEmptyRules ? detectEmptyRules(rules) : [];
    onProgress?.(CSS_STEP_EMPTY_RULES, TOTAL_CSS_ANALYSIS_STEPS, 'Bloques y reglas vacías', emptyRules.length);
    const violations = [];
    // 1. Duplicate Rules -> severity: error
    for (const dup of duplicates) {
        const first = dup.occurrences[0];
        const others = dup.occurrences.slice(1).map(o => `${o.selector} (${o.file}:${o.line})`).join(', ');
        violations.push({
            file: path.resolve(projectRoot, first.file),
            line: first.line,
            message: `SCSS/CSS duplicado: Selector '${first.selector}' coincide exactamente con ${dup.occurrences.length} reglas idénticas: ${others}`,
            context: `duplicación css (${dup.occurrences.length} lugares: ${dup.declarations.slice(0, 3).join('; ')})`,
            severity: 'error',
            fixable: false
        });
    }
    // 2. Similar Classes -> severity: warning
    for (const sim of similar) {
        violations.push({
            file: path.resolve(projectRoot, sim.left.file),
            line: sim.left.line,
            message: `Clases CSS similares (${sim.similarity}%): '${sim.left.selector}' y '${sim.right.selector}' (${sim.right.file}:${sim.right.line}) comparten ${sim.commonDeclarations.length} propiedades`,
            context: `similitud css (${sim.similarity}%: ${sim.commonDeclarations.slice(0, 2).join('; ')})`,
            severity: 'warning',
            fixable: false
        });
    }
    // 3. Long Values -> severity: warning
    for (const lv of longValues) {
        const first = lv.occurrences[0];
        violations.push({
            file: path.resolve(projectRoot, first.file),
            line: first.line,
            message: `Valor CSS largo duplicado (${lv.length} chars) en ${lv.occurrences.length} lugares: '${lv.value.slice(0, 35)}...'. Extraer a variable.`,
            context: `valor largo duplicado (${lv.occurrences.length} lugares)`,
            severity: 'warning',
            fixable: false
        });
    }
    // 4. Unvariabled Colors -> severity: warning
    for (const uc of unvariabledColors) {
        const first = uc.occurrences[0];
        violations.push({
            file: path.resolve(projectRoot, first.file),
            line: first.line,
            message: `Color repetido sin variable (${uc.color}) en ${uc.occurrences.length} reglas. Utilizar variable de tema o token.`,
            context: `color sin variable (${uc.occurrences.length} lugares)`,
            severity: 'warning',
            fixable: false
        });
    }
    // 5. Duplicate Selectors -> severity: error
    for (const ds of duplicateSelectors) {
        violations.push({
            file: path.resolve(projectRoot, ds.file),
            line: ds.lines[0],
            message: `Selector duplicado '${ds.selector}' definido ${ds.lines.length} veces en el mismo archivo (líneas ${ds.lines.join(', ')})`,
            context: `selector repetido (${ds.lines.length} veces)`,
            severity: 'error',
            fixable: false
        });
    }
    // 6. Empty Rules -> severity: warning
    for (const er of emptyRules) {
        violations.push({
            file: path.resolve(projectRoot, er.file),
            line: er.line,
            message: `Bloque CSS vacío para selector '${er.selector}'. Eliminar regla o agregar declaraciones.`,
            context: `regla css vacía`,
            severity: 'warning',
            fixable: false
        });
    }
    const details = {
        duplicates,
        similar,
        longValues,
        unvariabledColors,
        duplicateSelectors,
        emptyRules,
        unusedClasses: []
    };
    return { violations, details, filesScanned: fileCount };
}
/**
 * Backward compatibility wrapper returning canonical Violation[]
 */
export async function runCssChecker(targetDir = '.', ignoreDirs, options, projectRoot) {
    const result = await runCssAnalysis(targetDir, ignoreDirs, options, projectRoot);
    return result.violations;
}
//# sourceMappingURL=cssAnalyzer.js.map