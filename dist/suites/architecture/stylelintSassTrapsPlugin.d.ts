import stylelint from "stylelint";
//#region src/suites/architecture/stylelintSassTrapsPlugin.d.ts
export declare const SASS_TRAPS_RULE_NAME: "sass-traps/collision-casing";
export declare const SASS_COLLISION_FUNCTION_MAP: Readonly<Record<string, string>>;
export declare const sassTrapsMessages: {
  expected: (actual: string, expected: string) => string;
};
export declare const sassTrapsRule: stylelint.Rule;
export declare const sassTrapsPlugin: stylelint.Plugin;
//#endregion