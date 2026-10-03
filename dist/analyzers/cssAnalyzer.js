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
import path from 'node:path';
import scssSyntax from 'postcss-scss';
export const CSS_ANALYZER_DESCRIPTOR = {
    id: 'css-analyzer',
    name: 'CSS / SCSS Multicriteria AST Analyzer',
    category: 'css-checker: SCSS/CSS duplicado y calidad',
    aliases: ['css-checker', 'css', 'scss', 'duplicate-css', 'scss-duplicados', 'css-hygiene']
};
const DEFAULT_OPTIONS = {
    minDeclarations: 2,
    checkSimilar: true,
    similarityThreshold: 80,
    checkLongLines: true,
    longLineLengthThreshold: 20,
    checkColors: true,
    checkEmptyRules: true,
    checkUnused: false,
    checkDuplicateSelectors: true
};
const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?)\([^)]+\)/gi;
function normalizeDeclaration(prop, val) {
    const cleanProp = prop.trim().toLowerCase();
    const cleanVal = val.trim().replace(/\s+/g, ' ');
    return `${cleanProp}: ${cleanVal}`;
}
export function extractCssBlocksFromVue(content) {
    const blocks = [];
    const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(content)) !== null) {
        const preContent = content.slice(0, match.index);
        const startLine = preContent.split('\n').length;
        const styleBody = match[1] ?? '';
        blocks.push({ code: styleBody, startLine });
    }
    return blocks;
}
export function parseCssContent(content, filePath, linePaddingCount = 0) {
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
                rawBlock: rule.toString()
            });
        });
    }
    catch {
        // catch-ok: Ignore syntactically incomplete or partial CSS snippets gracefully
    }
    return rules;
}
export async function collectAllProjectCssRules(targetDir, ignoreDirs, projectRoot = process.cwd()) {
    const rules = [];
    let fileCount = 0;
    const searchDir = path.resolve(projectRoot, targetDir === '.' ? 'src' : targetDir);
    const pattern = '**/*.{scss,css,vue}';
    for await (const entry of fs.glob(pattern, {
        cwd: searchDir,
        exclude: (p) => Array.from(ignoreDirs).some(d => p.includes(d))
    })) {
        const fullPath = path.join(searchDir, entry);
        const relPath = path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep);
        const content = await fs.readFile(fullPath, 'utf-8');
        fileCount++;
        if (fullPath.endsWith('.vue')) {
            const blocks = extractCssBlocksFromVue(content);
            for (const block of blocks) {
                const parsed = parseCssContent(block.code, relPath, block.startLine - 1);
                rules.push(...parsed);
            }
        }
        else {
            const parsed = parseCssContent(content, relPath, 0);
            rules.push(...parsed);
        }
    }
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
    const eligibleRules = rules.filter(r => r.declarations.length >= minDeclarations);
    const comparisons = [];
    const seenPairs = new Set();
    for (let i = 0; i < eligibleRules.length; i++) {
        const a = eligibleRules[i];
        const setA = new Set(a.declarations.map(d => normalizeDeclaration(d.prop, d.value)));
        for (let j = i + 1; j < eligibleRules.length; j++) {
            const b = eligibleRules[j];
            // Skip if exactly the same selector in same file (handled by duplicate selectors)
            if (a.file === b.file && a.selector === b.selector)
                continue;
            const pairKey = `${a.file}:${a.line}<->${b.file}:${b.line}`;
            if (seenPairs.has(pairKey))
                continue;
            const setB = new Set(b.declarations.map(d => normalizeDeclaration(d.prop, d.value)));
            const common = Array.from(setA).filter(item => setB.has(item));
            const unionSize = new Set([...setA, ...setB]).size;
            if (unionSize === 0)
                continue;
            const similarity = Math.round((common.length / unionSize) * 100);
            // Report if high similarity but NOT 100% identical (100% is handled by duplicate rules)
            if (similarity >= thresholdPercent && similarity < 100 && common.length >= minDeclarations) {
                seenPairs.add(pairKey);
                comparisons.push({
                    similarity,
                    commonDeclarations: common,
                    left: {
                        file: a.file,
                        line: a.line,
                        selector: a.selector,
                        uniqueDeclarations: Array.from(setA).filter(item => !setB.has(item))
                    },
                    right: {
                        file: b.file,
                        line: b.line,
                        selector: b.selector,
                        uniqueDeclarations: Array.from(setB).filter(item => !setA.has(item))
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
export async function detectUnusedClasses(rules, projectRoot) {
    const classNames = new Set();
    const classRules = [];
    for (const rule of rules) {
        const matches = rule.selector.match(/\.([a-zA-Z0-9_-]+)/g);
        if (matches) {
            for (const m of matches) {
                const cls = m.slice(1);
                classNames.add(cls);
                classRules.push({ name: cls, file: rule.file, line: rule.line });
            }
        }
    }
    if (classNames.size === 0)
        return [];
    // Search templates and script files for class references
    const usedTokens = new Set();
    const pattern = '**/*.{vue,html,ts,js,tsx,jsx}';
    const searchDir = path.resolve(projectRoot, 'src');
    try {
        for await (const entry of fs.glob(pattern, { cwd: searchDir })) {
            const fullPath = path.join(searchDir, entry);
            const text = await fs.readFile(fullPath, 'utf-8');
            const tokens = text.match(/[a-zA-Z0-9_-]+/g);
            if (tokens) {
                for (const t of tokens)
                    usedTokens.add(t);
            }
        }
    }
    catch {
        // catch-ok: Ignore template scanning errors
    }
    const unused = [];
    for (const cr of classRules) {
        if (!usedTokens.has(cr.name)) {
            unused.push({
                className: cr.name,
                file: cr.file,
                line: cr.line
            });
        }
    }
    return unused;
}
export async function runCssAnalysis(targetDir = '.', ignoreDirs, options = {}, projectRoot = process.cwd(), onProgress) {
    const opt = { ...DEFAULT_OPTIONS, ...options };
    const { rules, fileCount } = await collectAllProjectCssRules(targetDir, ignoreDirs, projectRoot);
    const duplicates = detectDuplicateRules(rules, opt.minDeclarations);
    onProgress?.(1, 7, 'Reglas duplicadas en estilos', duplicates.length);
    const similar = opt.checkSimilar ? detectSimilarClasses(rules, opt.similarityThreshold, opt.minDeclarations) : [];
    const simPct = opt.similarityThreshold > 1 ? opt.similarityThreshold : Math.round(opt.similarityThreshold * 100);
    onProgress?.(2, 7, `Clases similares (umbral >= ${simPct}%)`, similar.length);
    const longValues = opt.checkLongLines ? detectLongValues(rules, opt.longLineLengthThreshold) : [];
    onProgress?.(3, 7, `Valores largos repetidos (>= ${opt.longLineLengthThreshold} chars)`, longValues.length);
    const unvariabledColors = opt.checkColors ? detectUnvariabledColors(rules) : [];
    onProgress?.(4, 7, 'Colores repetidos sin variable', unvariabledColors.length);
    const duplicateSelectors = opt.checkDuplicateSelectors ? detectDuplicateSelectors(rules) : [];
    onProgress?.(5, 7, 'Selectores duplicados en mismo archivo', duplicateSelectors.length);
    const emptyRules = opt.checkEmptyRules ? detectEmptyRules(rules) : [];
    onProgress?.(6, 7, 'Bloques y reglas vacías', emptyRules.length);
    const unusedClasses = opt.checkUnused ? await detectUnusedClasses(rules, projectRoot) : [];
    onProgress?.(7, 7, 'Clases de estilos sin uso en plantillas', unusedClasses.length);
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
    // 7. Unused Classes -> severity: warning
    for (const uc of unusedClasses) {
        violations.push({
            file: path.resolve(projectRoot, uc.file),
            line: uc.line,
            message: `Clase CSS '${uc.className}' no encontrada en componentes ni plantillas del proyecto`,
            context: `clase css huérfana`,
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
        unusedClasses
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