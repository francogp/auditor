/**
 * src/core/stylelintConfigResolver.ts
 *
 * Pre-resolves Stylelint JSON configs (`extends`, `plugins`, and `overrides[*].extends`)
 * relative to each config file's own directory so Stylelint 18+ resolves nested
 * presets (e.g. `stylelint-config-standard-scss` inside `@francogp/auditor/node_modules`)
 * independently of npm hoisting or host `cwd`.
 */
export declare function flattenStylelintJsonConfig(filePath: string, fallbackDir?: string, visited?: Set<string>): Promise<Record<string, unknown> | null>;