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
export declare const SASS_TRAPS_RULE_NAME: "sass-traps/collision-casing";
export declare const SASS_COLLISION_FUNCTION_MAP: Readonly<Record<string, string>>;
export declare const sassTrapsMessages: {
    expected: (actual: string, expected: string) => string;
};
export declare const sassTrapsRule: stylelint.Rule;
export declare const sassTrapsPlugin: stylelint.Plugin;
//# sourceMappingURL=stylelintSassTrapsPlugin.d.ts.map