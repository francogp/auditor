/**
 * src/cli/guideRenderer.ts
 *
 * ON-DEMAND EXTENSIVE AUDIT REMEDIATION & DIAGNOSTIC GUIDE RENDERER (Node.js 26+ Native)
 * Provides detailed, unbounded troubleshooting manuals for individual rules, suites, or families.
 * Formatted with Unicode Box-Drawing (≤ 80 cols) and Markdown support.
 */

import { styleText } from 'node:util';

import boxen from 'boxen';

import type { AuditTaskDefinition } from '../core/auditContract.ts';

export interface GuideQueryMatch {
  readonly ruleId: string;
  readonly ruleDescription: string;
  readonly remediation: string;
  readonly task: AuditTaskDefinition;
}

export function findRuleGuide(
  allTasks: readonly AuditTaskDefinition[],
  ruleIdOrName: string
): GuideQueryMatch | undefined {
  const cleanId = ruleIdOrName.trim().toLowerCase();
  const normalizedClean = cleanId.replace(/_/g, '-');
  for (const task of allTasks) {
    const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
    const remediations = task.ruleRemediations ?? task.manifest?.remediations ?? {};

    for (const [rId, rDesc] of Object.entries(rules)) {
      const lowerRId = rId.toLowerCase();
      if (lowerRId === cleanId || lowerRId.replace(/_/g, '-') === normalizedClean) {
        return {
          ruleId: rId,
          ruleDescription: rDesc,
          remediation: remediations[rId] ?? 'No remediation guide registered.',
          task
        };
      }
    }
  }
  return undefined;
}

import { themeStyles } from '../core/unifiedTheme.ts';

export function renderRuleGuideCard(match: GuideQueryMatch, isVerbose: boolean = false): string {
  const { boldWhite, boldYellow, boldCyan, dim, white } = themeStyles;
  const sections: string[][] = [];

  // 1. Header
  const title = `📖 REMEDIATION GUIDE: ${match.ruleId}`;
  const subtitle = `Suite: ${match.task.name} [${match.task.id}] | Family: ${match.task.family.toUpperCase()}`;
  sections.push([boldCyan(title), dim(subtitle)]);

  // 2. Rule purpose and description
  sections.push([boldYellow('📋 RULE DESCRIPTION:'), white(`  ${match.ruleDescription}`)]);

  // 3. Isolated execution command for diagnostic reproduction
  const runCommand = `npm run auditor suite=${match.task.id}`;
  sections.push([boldYellow('🚀 ISOLATED DIAGNOSTIC COMMAND:'), white(`  ${runCommand}`)]);

  // 4. Step-by-step remediation guide
  const remediationLines = match.remediation.split('\n').map((l) => `  ${l}`);

  sections.push([
    boldYellow('💡 DIAGNOSIS, ROOT CAUSE & STEP-BY-STEP REMEDIATION:'),
    white(remediationLines.join('\n'))
  ]);

  // 5. Linked configuration if applicable
  if (match.task.configKey) {
    sections.push([
      boldYellow('🛠️ LINKED CONFIGURATION:'),
      dim(`  Section in .auditor/audit.config.ts: `) + boldWhite(match.task.configKey)
    ]);
  }

  const content = sections.map((sec) => sec.join('\n')).join('\n\n');

  if (!isVerbose) {
    return `\n${content}\n`;
  }

  const box = boxen(content, {
    borderColor: 'yellow',
    borderStyle: 'double',
    padding: { top: 0, bottom: 0, left: 1, right: 1 }
  });

  return `${box}\n`;
}

export function renderSuiteGuideCards(
  task: AuditTaskDefinition,
  isVerbose: boolean = false
): string {
  const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
  const remediations = task.ruleRemediations ?? task.manifest?.remediations ?? {};
  const ruleEntries = Object.entries(rules);

  if (ruleEntries.length === 0) {
    return styleText('yellow', `\n⚠️ Suite '${task.id}' does not declare evaluable rules.\n`);
  }

  const output: string[] = [];
  output.push(styleText(['bold', 'cyan'], `\n🏛️ SUITE RULES GUIDE: ${task.name} [${task.id}]\n`));

  for (const [rId, rDesc] of ruleEntries) {
    output.push(
      renderRuleGuideCard(
        {
          ruleId: rId,
          ruleDescription: rDesc,
          remediation: remediations[rId] ?? 'No guide declared.',
          task
        },
        isVerbose
      )
    );
  }

  return output.join('\n');
}

export function renderFamilyGuideIndex(
  family: string,
  tasksInFamily: readonly AuditTaskDefinition[]
): string {
  const boldYellow = (s: string): string => styleText(['bold', 'yellow'], s);
  const boldWhite = (s: string): string => styleText(['bold', 'white'], s);
  const dim = (s: string): string => styleText('dim', s);

  const lines: string[] = [];
  lines.push(boldYellow(`\n📚 RULES & GUIDES CATALOG FOR FAMILY: ${family.toUpperCase()}\n`));

  for (const task of tasksInFamily) {
    const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
    lines.push(`  ${task.icon ?? '🧩'} ${boldWhite(task.name)} [${task.id}]:`);
    for (const [rId, rDesc] of Object.entries(rules)) {
      lines.push(`     • ${styleText('cyan', rId)}: ${dim(rDesc)}`);
    }
    lines.push('');
  }

  lines.push(dim(`👉 To view the full guide for a rule: auditor guide <ruleId>\n`));
  return lines.join('\n');
}

export function renderGlobalGuideIndex(allTasks: readonly AuditTaskDefinition[]): string {
  const { boldYellow, boldCyan, dim } = themeStyles;

  const lines: string[] = [];
  lines.push(boldYellow('\n📚 ON-DEMAND AUDIT GUIDES & MANUALS (@francogp/auditor)\n'));
  lines.push('USAGE:');
  lines.push(
    `  ${boldCyan('auditor guide <ruleId>')}              Shows full guide for a specific rule.`
  );
  lines.push(
    `  ${boldCyan('auditor guide suite=<suiteId>')}        Shows all rule guides for a suite.`
  );
  lines.push(
    `  ${boldCyan('auditor guide family=<family>')}        Shows rules index for an architectural family.\n`
  );

  lines.push(boldYellow('QUICK EXAMPLES:'));
  lines.push(`  npm run auditor guide coverage-missing-ledger`);
  lines.push(`  npm run auditor guide audit-config-missing-section`);
  lines.push(`  npm run auditor guide suite=validate_audit_coverage\n`);

  const totalRules = allTasks.reduce(
    (acc, t) => acc + Object.keys(t.ruleDescriptions ?? t.manifest?.rules ?? {}).length,
    0
  );
  lines.push(dim(`Total documented rules available in this repository: ${totalRules}\n`));

  return lines.join('\n');
}
