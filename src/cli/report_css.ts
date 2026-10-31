#!/usr/bin/env -S node --experimental-strip-types
/**
 * packages/auditor/src/cli/report_css.ts
 *
 * CLI TOOL: CSS QUALITY, DUPLICATION AND PATTERNS REPORT (STYLELINT ENGINE)
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

import path from 'node:path';
import { styleText } from 'node:util';

import type { AuditFinding } from '../core/auditContract.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { StylelintAuditor } from '../suites/architecture/validate_stylelint.ts';
import { isMainModule } from './cliUtils.ts';

const MAX_ITEM_DISPLAY_CHARS = 30;
const MAX_ITEM_TRUNCATE_CHARS = 29;
const MAX_LOCATION_DISPLAY_CHARS = 24;
const MAX_LOCATION_TRUNCATE_CHARS = 23;

const COL_WIDTH_INDEX = 3;
const COL_WIDTH_CATEGORY = 14;
const COL_WIDTH_ITEM = 31;
const COL_WIDTH_LOCATION = 24;

function truncateItem(item: string): string {
  return item.length > MAX_ITEM_DISPLAY_CHARS ? `${item.slice(0, MAX_ITEM_TRUNCATE_CHARS)}…` : item;
}

function truncateLocation(loc: string): string {
  return loc.length > MAX_LOCATION_DISPLAY_CHARS
    ? `${loc.slice(0, MAX_LOCATION_TRUNCATE_CHARS)}…`
    : loc;
}

interface TableRow {
  index: string;
  category: string;
  item: string;
  location: string;
}

const CATEGORY_RULE_MAP: Readonly<Record<string, string>> = {
  selectors: 'css-duplicate-selectors',
  properties: 'css-duplicate-properties',
  empty: 'css-empty-blocks',
  order: 'css-order-violation',
  syntax: 'scss-syntax-issue'
};

const RULE_LABEL_MAP: Readonly<Record<string, string>> = {
  'css-duplicate-selectors': 'SELECTOR DUP',
  'css-duplicate-properties': 'PROP DUP',
  'css-empty-blocks': 'EMPTY BLOCK',
  'css-order-violation': 'CSS ORDER',
  'scss-syntax-issue': 'SCSS SYNTAX',
  'wallace-complexity': 'COMPLEXITY'
};

function matchesCssCategory(ruleId: string | undefined, category: string): boolean {
  if (category === 'all') return true;
  return CATEGORY_RULE_MAP[category] === ruleId;
}

function formatCssTableRow(f: AuditFinding, index: number): TableRow {
  const loc = `${path.basename(f.file || '')}:${f.line || 1}`;
  const catLabel = (f.ruleId && RULE_LABEL_MAP[f.ruleId]) || 'STYLE';
  const color = f.severity === 'error' ? 'red' : 'yellow';

  return {
    index: String(index),
    category: styleText(color, catLabel),
    item: truncateItem(f.message),
    location: truncateLocation(loc)
  };
}

function renderCssFindingsTable(
  filteredFindings: readonly AuditFinding[],
  category: string,
  isHuman: boolean
): void {
  if (filteredFindings.length === 0) {
    console.log(styleText('green', '[OK] No CSS/SCSS style issues or violations detected.\n'));
    return;
  }

  if (!isHuman) {
    console.log(`[CSS] Found ${filteredFindings.length} issue(s) in category '${category}':`);
    for (const f of filteredFindings) {
      const loc = f.file ? (f.line ? `${f.file}:${f.line}` : f.file) : 'general';
      console.log(
        `• [${f.severity.toUpperCase()}] ${loc} [${f.ruleId ?? 'stylelint'}]: ${f.message}`
      );
    }
    console.log('');
    return;
  }

  const rows: TableRow[] = filteredFindings.map((f, i) => formatCssTableRow(f, i + 1));
  const cols: readonly TableColumn<TableRow>[] = [
    { header: '#', width: COL_WIDTH_INDEX, align: 'center', key: 'index' },
    { header: 'CATEGORY', width: COL_WIDTH_CATEGORY, align: 'left', key: 'category' },
    { header: 'MESSAGE / RULE', width: COL_WIDTH_ITEM, align: 'left', key: 'item' },
    { header: 'LOCATION', width: COL_WIDTH_LOCATION, align: 'left', key: 'location' }
  ];

  console.log(renderBoxTable(cols, rows));
  console.log(`\n[Notice] Total issues detected in category '${category}': ${rows.length}\n`);
}

const CSS_REPORT_ARGS = {
  ...COMMON_CLI_ARGS,
  category: { type: 'string', default: 'all', description: 'CSS finding category filter' },
  categoryPos: {
    type: 'positional',
    required: false,
    description: 'CSS finding category positional filter'
  },
  'errors-only': {
    type: 'boolean',
    default: false,
    description: 'Show only error-severity findings'
  },
  fix: { type: 'boolean', default: false, description: 'Apply Stylelint auto-fixes' }
} as const satisfies CittyArgsDef;

export async function runCssReport(projectRoot: string = process.cwd()): Promise<void> {
  const parsed = parseCittyArgs(CSS_REPORT_ARGS, getProcessCliArgs());

  const isFix = Boolean(parsed.fix);
  const category = String(parsed.categoryPos || parsed.category || 'all').toLowerCase();
  const isJson = Boolean(parsed.json);
  const errorsOnly = Boolean(parsed['errors-only']);
  const isHuman = resolveHumanModeFromArgs(parsed);

  const auditor = new StylelintAuditor({ projectRoot });
  const result = isFix ? await auditor.fix() : await auditor.audit();

  const filteredFindings = result.findings.filter((f) => {
    if (errorsOnly && f.severity !== 'error') return false;
    return matchesCssCategory(f.ruleId, category);
  });

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          summary: {
            filesScanned: auditor.getFilesScanned(),
            totalErrors: result.summary.errors,
            totalWarnings: result.summary.warnings,
            durationMs: result.durationMs
          },
          findings: filteredFindings
        },
        null,
        2
      )
    );
    return;
  }

  if (isHuman) {
    console.log(
      renderBanner(
        'CSS QUALITY AND DUPLICATION REPORT (STYLELINT ENGINE)',
        'Official static analysis of styles and SCSS/Vue patterns'
      )
    );
    console.log(
      styleText(
        'dim',
        `[Scan] Analyzed ${auditor.getFilesScanned()} files in ${result.durationMs}ms (Category: ${category})\n`
      )
    );

    if (isFix) {
      console.log(
        styleText('cyan', '[Notice] Auto-fix mode: Stylelint applied automated fixes.\n')
      );
    }
  }

  renderCssFindingsTable(filteredFindings, category, isHuman);
}

if (isMainModule(import.meta.url)) {
  await runCssReport();
}
