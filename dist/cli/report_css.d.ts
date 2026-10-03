#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_css.ts
 *
 * CLI TOOL: REPORTE DE CALIDAD, DUPLICACIÓN Y PATRONES CSS (STYLELINT ENGINE)
 *
 * Generates an 80-column Box-Drawing report or structured JSON output of CSS issues:
 * duplicate selectors, duplicate properties, empty blocks, order, and SCSS syntax.
 *
 * Usage:
 *   auditor-css
 *   auditor-css --category=selectors
 *   auditor-css --category=properties
 *   auditor-css --category=empty
 *   auditor-css --json
 *   auditor-css --errors-only
 */
export declare function runCssReport(projectRoot?: string): Promise<void>;
//# sourceMappingURL=report_css.d.ts.map