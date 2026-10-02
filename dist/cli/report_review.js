#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_review.ts
 *
 * CLI TOOL: REVISIÓN DE CAMBIOS Y RIESGO DE PR (Fallow Review)
 *
 * Runs graph-grounded change review via fallow review, displaying structural
 * decisions, blast radius, public API changes, and code risk.
 */
import { parseArgs, styleText } from 'node:util';
import { spawnSync } from 'node:child_process';
import { renderBanner } from "../core/unifiedTheme.js";
import { isMainModule } from "./cliUtils.js";
import { resolveFallowBinary } from "../suites/architecture/validate_similar_code.js";
export function runReviewReport(projectRoot = process.cwd()) {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            base: { type: 'string' },
            'changed-since': { type: 'string' },
            json: { type: 'boolean', default: false }
        },
        strict: false,
        allowPositionals: true
    });
    const fallowBin = resolveFallowBinary(projectRoot);
    if (!fallowBin) {
        console.error(styleText('red', '❌ No se encontró el binario de Fallow en node_modules.'));
        process.exit(1);
    }
    const isJson = Boolean(values.json);
    const args = ['review'];
    if (values.base) {
        args.push('--base', String(values.base));
    }
    else if (values['changed-since']) {
        args.push('--changed-since', String(values['changed-since']));
    }
    else if (positionals.length > 0 && positionals[0]) {
        args.push('--changed-since', positionals[0]);
    }
    if (isJson) {
        args.push('--format', 'json');
    }
    if (!isJson) {
        renderBanner('REVISIÓN DE CAMBIOS (FALLOW REVIEW)', 'Decisiones estructurales y radio de impacto');
    }
    const result = spawnSync('node', [fallowBin, ...args], {
        cwd: projectRoot,
        stdio: 'inherit'
    });
    if (result.status !== null && result.status !== 0) {
        process.exit(result.status);
    }
}
if (isMainModule(import.meta.url)) {
    runReviewReport();
}
//# sourceMappingURL=report_review.js.map