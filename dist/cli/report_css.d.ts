#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_css.ts
 *
 * CLI TOOL: REPORTE DE CALIDAD, DUPLICACIÓN Y PATRONES CSS (POSTCSS AST)
 *
 * Generates an 80-column Box-Drawing report or structured JSON output of CSS issues:
 * duplicate rules, similar classes, unvariabled colors, long lines, and duplicate selectors.
 *
 * Usage:
 *   auditor-css
 *   auditor-css --category=duplicates
 *   auditor-css --category=similar
 *   auditor-css --category=colors
 *   auditor-css --category=long-lines
 *   auditor-css --category=selectors
 *   auditor-css --category=empty
 *   auditor-css --json
 */
export declare function runCssReport(projectRoot?: string): Promise<void>;
//# sourceMappingURL=report_css.d.ts.map