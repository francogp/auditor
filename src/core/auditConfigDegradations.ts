/**
 * src/core/auditConfigDegradations.ts
 *
 * UNACKNOWLEDGED DEGRADATIONS DETECTOR & AUTO-FIX (Node.js 26+ Native)
 * Scans configured exemption roots (scripts, data, cli, demo, exemptFiles) and ensures
 * that any path containing code files is registered under coverage.acknowledgedDegradations.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  type AuditEngineConfig,
  type AcknowledgeableExemptionPolicy,
  AUDIT_CONFIG_FILE
} from './auditConfig.ts';
import { normalizePosixPath } from './safePath.ts';
import {
  formatSectionObjectLiteral,
  parseAuditConfigFileAst,
  appendMissingSectionsToConfigFile
} from './auditConfigAst.ts';
import { tryCatchSync } from './safeUtils.ts';

export interface UnacknowledgedDegradation {
  readonly policy: AcknowledgeableExemptionPolicy;
  readonly rootOrFile: string;
  readonly suggestedGlob: string;
  readonly reason: string;
  readonly filesCount: number;
}

interface PolicyDefinition {
  readonly policy: AcknowledgeableExemptionPolicy;
  readonly getRoots: (config: AuditEngineConfig, projectRoot: string) => readonly string[];
  readonly reason: string;
  readonly isRoot: boolean;
}

const POLICY_DEFINITIONS: readonly PolicyDefinition[] = [
  {
    policy: 'scripts',
    getRoots: (config, projectRoot) =>
      config.paths?.scriptsRoots ??
      (fs.existsSync(path.resolve(projectRoot, 'scripts')) ? ['scripts'] : []),
    reason: 'Build scripts, development tooling, and maintenance',
    isRoot: true
  },
  {
    policy: 'data',
    getRoots: (config, projectRoot) =>
      config.paths?.dataRoots ??
      (fs.existsSync(path.resolve(projectRoot, 'src/data')) ? ['src/data'] : []),
    reason: 'Static data tables, fixtures, and domain catalogs',
    isRoot: true
  },
  {
    policy: 'cli',
    getRoots: (config, projectRoot) =>
      config.paths?.cliRoots ??
      (fs.existsSync(path.resolve(projectRoot, 'src/cli')) ? ['src/cli'] : []),
    reason: 'Entry points and CLI terminal execution commands',
    isRoot: true
  },
  {
    policy: 'demo',
    getRoots: (config) => config.paths?.demoRoots ?? [],
    reason: 'Interactive demonstrations and visual test playgrounds',
    isRoot: true
  },
  {
    policy: 'exemptFiles',
    getRoots: (config) => config.paths?.exemptFiles ?? [],
    reason: 'Files exempt from domain architecture rules',
    isRoot: false
  }
];

export function collectRelativeCodeFiles(
  projectRoot: string,
  rootRelPath: string,
  maxFiles = 20
): string[] {
  const dirAbs = path.resolve(projectRoot, rootRelPath);
  if (!fs.existsSync(dirAbs)) return [];
  try {
    const stat = fs.statSync(dirAbs);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const found: string[] = []; // Non-domain relative file paths collection
  const queue = [dirAbs];
  while (queue.length > 0 && found.length < maxFiles) {
    const current = queue.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs|vue)$/i.test(entry.name)) {
        const rel = normalizePosixPath(path.relative(projectRoot, fullPath));
        found.push(rel);
        if (found.length >= maxFiles) break;
      }
    }
  }
  return found;
}

export function detectUnacknowledgedDegradations(
  config: AuditEngineConfig,
  projectRoot: string
): UnacknowledgedDegradation[] {
  if (config.coverage?.enabled === false) return [];

  const acknowledged = config.coverage?.acknowledgedDegradations ?? [];
  const missing: UnacknowledgedDegradation[] = [];

  for (const def of POLICY_DEFINITIONS) {
    const targets = def.getRoots(config, projectRoot);
    for (const target of targets) {
      if (def.isRoot) {
        const codeFiles = collectRelativeCodeFiles(projectRoot, target);
        if (codeFiles.length === 0) continue;
        const uncovered = codeFiles.filter(
          (f) =>
            !acknowledged.some(
              (ack) => ack.policy === def.policy && path.posix.matchesGlob(f, ack.glob)
            )
        );
        if (uncovered.length > 0) {
          missing.push({
            policy: def.policy,
            rootOrFile: target,
            suggestedGlob: `${normalizePosixPath(target)}/**`,
            reason: def.reason,
            filesCount: uncovered.length
          });
        }
      } else {
        const absPath = path.resolve(projectRoot, target);
        if (!fs.existsSync(absPath)) continue;
        const relPosix = normalizePosixPath(target);
        const isCovered = acknowledged.some(
          (ack) =>
            ack.policy === def.policy &&
            (ack.glob === relPosix || path.posix.matchesGlob(relPosix, ack.glob))
        );
        if (!isCovered) {
          missing.push({
            policy: def.policy,
            rootOrFile: target,
            suggestedGlob: relPosix,
            reason: def.reason,
            filesCount: 1
          });
        }
      }
    }
  }

  return missing;
}

export function applyAcknowledgedDegradationsFix(
  projectRoot: string,
  missing: readonly UnacknowledgedDegradation[]
): void {
  const tsPath = path.resolve(projectRoot, AUDIT_CONFIG_FILE);
  const jsonPath = path.resolve(projectRoot, '.auditor/audit.config.json');
  const configFilePath = fs.existsSync(tsPath)
    ? tsPath
    : fs.existsSync(jsonPath)
      ? jsonPath
      : null;
  if (!configFilePath) return;

  const newEntries = missing.map((m) => ({
    glob: m.suggestedGlob,
    policy: m.policy,
    reason: m.reason
  }));

  if (configFilePath.endsWith('.json')) {
    tryCatchSync(() => {
      const code = fs.readFileSync(configFilePath, 'utf8');
      const json = JSON.parse(code) as Record<string, unknown>;
      const coverage = (json.coverage && typeof json.coverage === 'object'
        ? json.coverage
        : {}) as Record<string, unknown>;
      const existingAcks = Array.isArray(coverage.acknowledgedDegradations)
        ? (coverage.acknowledgedDegradations as Array<Record<string, unknown>>)
        : [];
      coverage.acknowledgedDegradations = [...existingAcks, ...newEntries];
      json.coverage = coverage;
      fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    });
    return;
  }

  const parsed = parseAuditConfigFileAst(configFilePath);
  if (!parsed || !parsed.configObj) return;

  const { code, source, configObj } = parsed;
  const coverageProp = configObj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name.getText(source).replace(/^['"]|['"]$/g, '') === 'coverage'
  ) as ts.PropertyAssignment | undefined;

  if (!coverageProp || !ts.isObjectLiteralExpression(coverageProp.initializer)) {
    appendMissingSectionsToConfigFile(configFilePath, {
      coverage: {
        acknowledgedDegradations: newEntries
      }
    });
    return;
  }

  const coverageObj = coverageProp.initializer;
  const ackProp = coverageObj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name.getText(source).replace(/^['"]|['"]$/g, '') === 'acknowledgedDegradations'
  ) as ts.PropertyAssignment | undefined;

  if (!ackProp || !ts.isArrayLiteralExpression(ackProp.initializer)) {
    const formattedArray = formatSectionObjectLiteral(newEntries)
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : `    ${line}`))
      .join('\n');
    const closeBracePos = code.lastIndexOf('}', coverageObj.getEnd() - 1);
    if (closeBracePos === -1) return;

    const beforeClose = code.slice(0, closeBracePos).trimEnd();
    const needsComma = !beforeClose.endsWith(',');
    const commaPos = beforeClose.length;

    const base = needsComma
      ? code.slice(0, commaPos) + ',' + code.slice(commaPos, closeBracePos)
      : code.slice(0, closeBracePos);

    const snippet = `\n    acknowledgedDegradations: ${formattedArray}\n  `;
    const finalCode = base + snippet + code.slice(closeBracePos);
    fs.writeFileSync(configFilePath, finalCode, 'utf8');
    return;
  }

  const ackArray = ackProp.initializer;
  const closeBracketPos = code.lastIndexOf(']', ackArray.getEnd() - 1);
  if (closeBracketPos === -1) return;

  const beforeBracket = code.slice(0, closeBracketPos).trimEnd();
  const hasElements = ackArray.elements.length > 0;
  const needsComma = hasElements && !beforeBracket.endsWith(',');
  const commaPos = beforeBracket.length;

  const base = needsComma
    ? code.slice(0, commaPos) + ',' + code.slice(commaPos, closeBracketPos)
    : code.slice(0, closeBracketPos);

  const formattedItems = newEntries
    .map((entry) => {
      const itemStr = formatSectionObjectLiteral(entry);
      return itemStr
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n');
    })
    .join(',\n');
  const snippet = (hasElements ? '\n' : '\n') + formattedItems + '\n    ';
  const finalCode = base + snippet + code.slice(closeBracketPos);
  fs.writeFileSync(configFilePath, finalCode, 'utf8');
}
