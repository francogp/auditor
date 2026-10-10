/**
 * src/suites/architecture/validate_magic_numbers.ts
 *
 * UNIFIED TYPESCRIPT AST MAGIC NUMBERS AUDITOR (Node.js 26+ Native)
 *
 * Enforces zero naked magic numbers in business logic by leveraging the TypeScript Compiler AST:
 *   - Allows legitimate constants declared anywhere:
 *     * Top-level const: const TIMEOUT = 5000
 *     * as const expressions: const X = [10, 20] as const
 *     * Arrays & Matrices: const MATRIX = [[1, 2], [3, 4]]
 *     * Dictionaries: const DICT = { A: 1, B: 2 }
 *     * Formulas: const TIME = 1000 * 60 * 5
 *     * Enums: enum Status { OK = 200 }
 *     * Types & Interfaces: type Port = 8080; interface C { port: 8080 }
 *     * Class readonly fields: static readonly MAX = 100
 *   - Universal exemptions:
 *     * Universal sentinels: -1, 0, 1, 2, 10, 100, 1000, 1024
 *     * Octal, Hex & Binary bitmasks / permissions: 0o755, 0xFF, 0b1010
 *     * Array/Tuple element indexing (ignoreArrayIndexes): arr[0], match[2], lines[i - 2]
 *     * Default parameter values (ignoreDefaultValues): function foo(limit = 5)
 *     * Precision arguments: .toFixed(0), .toFixed(1), .toFixed(2)
 *     * CLI and slice boundaries: .slice(2)
 *     * Radix arguments: parseInt(x, 10), (num).toString(16)
 *     * JSON formatting indentation: JSON.stringify(obj, null, 2)
 *   - Escape hatch: '// const-ok: <justification>'
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_magic_numbers.ts
 */
import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, isInCodeRoots, isDataPath } from "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const MAGIC_NUMBERS_RULES = ['magic-number-naked'];
const UNIVERSAL_SENTINELS = new Set([
    -1,
    0,
    0.5,
    1,
    2,
    3,
    4,
    5,
    10,
    24,
    60,
    100,
    360,
    1000,
    1024
]);
const STANDARD_RADIX = new Set([2, 8, 10, 16, 32, 36]);
function isDeclaredConstant(node) {
    let curr = node.parent;
    while (curr) {
        if (ts.isVariableDeclaration(curr)) {
            const declList = curr.parent;
            if (ts.isVariableDeclarationList(declList) && (declList.flags & ts.NodeFlags.Const)) {
                return true;
            }
        }
        if (ts.isPropertyDeclaration(curr)) {
            const isReadonly = curr.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword);
            if (isReadonly)
                return true;
        }
        if (ts.isEnumMember(curr) || ts.isEnumDeclaration(curr)) {
            return true;
        }
        if (ts.isTypeAliasDeclaration(curr) ||
            ts.isTypeNode(curr) ||
            ts.isInterfaceDeclaration(curr) ||
            ts.isPropertySignature(curr)) {
            return true;
        }
        curr = curr.parent;
    }
    return false;
}
function isRadixArg(node) {
    const p = node.parent;
    if (!p || !ts.isCallExpression(p))
        return false;
    if (p.arguments.length >= 2 && p.arguments[1] === node) {
        const callee = p.expression.getText();
        if (callee === 'parseInt' || callee === 'Number.parseInt')
            return true;
    }
    if (p.arguments.length === 1 && p.arguments[0] === node) {
        if (ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'toString')
            return true;
    }
    return false;
}
function isJsonIndentation(node) {
    const p = node.parent;
    if (!p || !ts.isCallExpression(p))
        return false;
    if (p.arguments.length >= 3 && p.arguments[2] === node) {
        const callee = p.expression.getText();
        if (callee === 'JSON.stringify')
            return true;
    }
    return false;
}
function isArrayIndex(node) {
    const p = node.parent;
    if (!p)
        return false;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node)
        return true;
    if (p.parent && ts.isElementAccessExpression(p.parent) && p.parent.argumentExpression === p)
        return true;
    return false;
}
function isDefaultParameterValue(node) {
    let curr = node;
    while (curr && curr.parent) {
        if (ts.isParameter(curr.parent) && curr.parent.initializer === curr) {
            return true;
        }
        if (ts.isFunctionDeclaration(curr) ||
            ts.isFunctionExpression(curr) ||
            ts.isArrowFunction(curr) ||
            ts.isMethodDeclaration(curr)) {
            break;
        }
        curr = curr.parent;
    }
    return false;
}
function isPrecisionOrSliceArg(node) {
    const p = node.parent;
    if (!p || !ts.isCallExpression(p))
        return false;
    if (ts.isPropertyAccessExpression(p.expression)) {
        const methodName = p.expression.name.text;
        if (methodName === 'toFixed' || methodName === 'toPrecision' || methodName === 'slice') {
            return true;
        }
    }
    return false;
}
function isObjectPropertyKey(node) {
    const p = node.parent;
    if (!p)
        return false;
    if (ts.isPropertyAssignment(p) && p.name === node)
        return true;
    return false;
}
function isTimerDelayArg(node) {
    const p = node.parent;
    if (!p || !ts.isCallExpression(p))
        return false;
    let calleeText = '';
    if (ts.isIdentifier(p.expression)) {
        calleeText = p.expression.text;
    }
    else if (ts.isPropertyAccessExpression(p.expression)) {
        calleeText = p.expression.name.text;
    }
    if (calleeText === 'setTimeout' || calleeText === 'setInterval') {
        return p.arguments.length >= 2 && p.arguments[1] === node;
    }
    if (calleeText === 'delayedCall') {
        return p.arguments.length >= 1 && p.arguments[0] === node;
    }
    return false;
}
function isExplicitBaseLiteral(node, sourceFile) {
    const rawText = node.getText(sourceFile);
    return rawText.startsWith('0o') || rawText.startsWith('0O') ||
        rawText.startsWith('0x') || rawText.startsWith('0X') ||
        rawText.startsWith('0b') || rawText.startsWith('0B');
}
const ANIMATION_PROPERTIES = new Set([
    'duration',
    'delay',
    'opacity',
    'autoAlpha',
    'scale',
    'scaleX',
    'scaleY',
    'rotation',
    'rotate',
    'skewX',
    'skewY',
    'stagger',
    'repeat',
    'repeatDelay',
    'feetX',
    'feetY'
]);
function isAnimationPropertyArg(node) {
    const p = node.parent;
    if (!p || !ts.isPropertyAssignment(p))
        return false;
    if (p.initializer !== node)
        return false;
    if (ts.isIdentifier(p.name) && ANIMATION_PROPERTIES.has(p.name.text)) {
        return true;
    }
    return false;
}
export class ValidateMagicNumbersAuditor extends FileScanAuditor {
    constructor(options, maybeProjectRoot) {
        const optionsObj = options && !Array.isArray(options)
            ? options
            : undefined;
        const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
        const config = getAuditConfig(projectRoot);
        const rawRoots = optionsObj?.roots ?? (Array.isArray(options) ? options : (config.paths.codeRoots ?? ['src', 'scripts']));
        const effectiveRoots = rawRoots.map(r => toPosixRelative(projectRoot, r));
        super({
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: true,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            id: 'validate_magic_numbers',
            name: 'Magic Numbers Validator',
            description: 'Gobernanza de números mágicos desnudos en lógica',
            family: 'architecture',
            packageName: 'MagicNumbers',
            configKey: 'constants',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            icon: '🔢',
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']),
            requiresAst: true,
            ruleIds: MAGIC_NUMBERS_RULES,
            ruleDescriptions: {
                'magic-number-naked': 'Número mágico no en constante'
            },
            projectRoot
        });
    }
    inspectAst(sourceFile, relPath, rawFileContent, customExempt) {
        const lines = rawFileContent.split('\n');
        const visit = (node) => {
            if (ts.isNumericLiteral(node)) {
                let val = parseFloat(node.text);
                let reportedNode = node;
                if (node.parent &&
                    ts.isPrefixUnaryExpression(node.parent) &&
                    (node.parent.operator === ts.SyntaxKind.MinusToken || node.parent.operator === ts.SyntaxKind.PlusToken)) {
                    if (node.parent.operator === ts.SyntaxKind.MinusToken) {
                        val = -val;
                    }
                    reportedNode = node.parent;
                }
                const isTimerDelay = isTimerDelayArg(reportedNode);
                const isAllowedSentinel = UNIVERSAL_SENTINELS.has(val) && !(isTimerDelay && val !== 0);
                if (!isAllowedSentinel &&
                    !customExempt.has(val) &&
                    !isExplicitBaseLiteral(node, sourceFile) &&
                    !(STANDARD_RADIX.has(val) && isRadixArg(reportedNode)) &&
                    !((val === 2 || val === 4) && isJsonIndentation(reportedNode)) &&
                    !isArrayIndex(reportedNode) &&
                    !isDefaultParameterValue(reportedNode) &&
                    !isPrecisionOrSliceArg(reportedNode) &&
                    !isObjectPropertyKey(reportedNode) &&
                    !isAnimationPropertyArg(reportedNode) &&
                    !isDeclaredConstant(reportedNode)) {
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(reportedNode.getStart(sourceFile));
                    const actualLine = line + 1;
                    const actualCol = character + 1;
                    const lineText = lines[actualLine - 1] ?? '';
                    if (!lineText.includes('// const-ok:')) {
                        const message = isTimerDelay
                            ? `Retardo de temporizador numérico desnudo: ${val}. Declara una constante explícita para este tiempo ('const RETRY_DELAY_MS = ${val}').`
                            : `Número mágico no declarado: ${val}. Declara una constante explícita para este valor ('const NOMBRE = ${val}').`;
                        this.addViolation({
                            ruleId: 'magic-number-naked',
                            severity: 'error',
                            filePath: relPath,
                            line: actualLine,
                            column: actualCol,
                            message,
                            context: lineText.trim() || String(val)
                        });
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
    scanFile(relPath, content, sourceFile, doc) {
        if (relPath.endsWith('.d.ts')) {
            return;
        }
        const config = getAuditConfig(this.projectRoot);
        if (!isInCodeRoots(relPath, config) || isDataPath(relPath)) {
            return;
        }
        const sf = sourceFile ?? doc?.getAst();
        if (!sf)
            return;
        const customExempt = new Set(config.constants?.exemptMagicNumbers ?? []);
        this.inspectAst(sf, relPath, content, customExempt);
    }
}
export { ValidateMagicNumbersAuditor as MagicNumbersAuditor };
// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateMagicNumbersAuditor());
//# sourceMappingURL=validate_magic_numbers.js.map