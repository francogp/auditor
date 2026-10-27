#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_review.ts
 *
 * CLI TOOL: CHANGE REVIEW AND PR RISK (Fallow Review)
 *
 * Runs graph-grounded change review via fallow review, displaying structural
 * decisions, blast radius, public API changes, and code risk.
 */

import { styleText } from 'node:util';
import { spawnSync } from 'node:child_process';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { renderBanner } from '../core/unifiedTheme.ts';
import { isMainModule } from './cliUtils.ts';
import { resolveFallowBinary } from '../suites/architecture/validate_similar_code.ts';

const REVIEW_CLI_ARGS = {
  ...COMMON_CLI_ARGS,
  base: { type: 'string', description: 'Git base branch or ref for review' },
  'changed-since': { type: 'string', description: 'Git ref to review changes since' },
  ref: { type: 'positional', required: false, description: 'Git ref to review changes since' }
} as const satisfies CittyArgsDef;

export function runReviewReport(projectRoot: string = process.cwd()): void {
  const parsed = parseCittyArgs(REVIEW_CLI_ARGS, getProcessCliArgs());

  const fallowBin = resolveFallowBinary(projectRoot);
  if (!fallowBin) {
    console.error(styleText('red', '[Error] Fallow binary not found in node_modules.'));
    process.exit(1);
  }

  const isJson = Boolean(parsed.json);
  const args = ['review'];

  const targetRef = (parsed.ref as string | undefined) ?? (parsed['changed-since'] as string | undefined);
  if (parsed.base) {
    args.push('--base', String(parsed.base));
  } else if (targetRef) {
    args.push('--changed-since', targetRef);
  }

  if (isJson) {
    args.push('--format', 'json');
  }

  const isHuman = resolveHumanModeFromArgs(parsed);
  if (!isJson && isHuman) {
    console.log(
      renderBanner(
        'CHANGE REVIEW (FALLOW REVIEW)',
        'Structural decisions and blast radius'
      )
    );
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
