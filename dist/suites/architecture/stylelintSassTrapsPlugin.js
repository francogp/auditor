/**
 * packages/auditor/src/suites/architecture/stylelintSassTrapsPlugin.ts
 *
 * STYLELINT SASS TRAPS & COLLISION CASING PLUGIN (Node.js 26+ Native)
 *
 * Enforces Sass Collision Casing across stylesheets and Vue SFC <style> blocks.
 * CSS functions that collide with Dart Sass built-ins (e.g. `scale`, `saturate`,
 * `grayscale`, `invert`, `brightness`, `contrast`, `drop-shadow`, `hue-rotate`)
 * must be written with Capital initial letters (e.g. `Scale(1.1)`, `Saturate(0.9)`)
 * to prevent Dart Sass compilation crashes:
 *   [sass] $color: 1.1 is not a color.
 *   [sass] Missing argument $amount.
 *
 * In --fix mode, this plugin natively auto-repairs all lowercase occurrences on the PostCSS AST.
 */
import stylelint from 'stylelint';
import valueParser from 'postcss-value-parser';
export const SASS_TRAPS_RULE_NAME = 'sass-traps/collision-casing';
export const SASS_COLLISION_FUNCTION_MAP = Object.freeze({
    scale: 'Scale',
    scalex: 'ScaleX',
    scaley: 'ScaleY',
    scalez: 'ScaleZ',
    scale3d: 'Scale3d',
    saturate: 'Saturate',
    grayscale: 'Grayscale',
    invert: 'Invert',
    alpha: 'Alpha',
    brightness: 'Brightness',
    contrast: 'Contrast',
    'drop-shadow': 'Drop-Shadow',
    'hue-rotate': 'hue-Rotate',
    translatex: 'TranslateX',
    translatey: 'TranslateY',
    translatez: 'TranslateZ',
    translate3d: 'Translate3d',
    radialgradient: 'Radial-Gradient',
    lineargradient: 'Linear-Gradient',
    'radial-gradient': 'Radial-Gradient',
    'linear-gradient': 'Linear-Gradient'
});
export const sassTrapsMessages = stylelint.utils.ruleMessages(SASS_TRAPS_RULE_NAME, {
    expected: (actual, expected) => `Expected "${actual}" to be "${expected}" (Sass collision casing)`
});
const ruleFunction = (primary, _secondary, _context) => {
    return (root, result) => {
        if (!primary)
            return;
        root.walkDecls((decl) => {
            if (!decl.value || !decl.value.includes('('))
                return;
            const parsed = valueParser(decl.value);
            parsed.walk((node) => {
                if (node.type !== 'function')
                    return;
                const lower = node.value.toLowerCase();
                const expected = SASS_COLLISION_FUNCTION_MAP[lower];
                if (expected && node.value !== expected) {
                    stylelint.utils.report({
                        result,
                        ruleName: SASS_TRAPS_RULE_NAME,
                        message: sassTrapsMessages.expected(node.value, expected),
                        node: decl,
                        word: node.value,
                        fix: () => {
                            node.value = expected;
                            decl.value = parsed.toString();
                        }
                    });
                }
            });
        });
    };
};
export const sassTrapsRule = Object.assign(ruleFunction, {
    ruleName: SASS_TRAPS_RULE_NAME,
    messages: sassTrapsMessages,
    meta: {
        url: 'https://github.com/francogp/auditor',
        fixable: true
    }
});
export const sassTrapsPlugin = stylelint.createPlugin(SASS_TRAPS_RULE_NAME, sassTrapsRule);
//# sourceMappingURL=stylelintSassTrapsPlugin.js.map