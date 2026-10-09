/**
 * packages/auditor/src/analyzers/auditRuleTypes.ts
 *
 * Core rule descriptors, violation schemas, and matching primitives
 * for architectural audits.
 */

import { normalizePosixPath } from '../core/safePath.ts';
import { isTestPath } from '../core/auditTestPredicates.ts';

export const AUDIT_SEVERITIES = ['error', 'warning'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export interface RuleDescriptor {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly aliases?: readonly string[];
  readonly packageName?: string;
}

export interface AuditRule extends Partial<RuleDescriptor> {
  regex: RegExp;
  message: string | ((match: string) => string);
  fix?: (match: string) => string;
  appliesTo?: (filePath: string) => boolean;
  check?: (context: string, match: RegExpExecArray, filePath?: string) => boolean;
  severity?: AuditSeverity;
  fixable?: boolean;
  addImport?: string;
  maxLines?: number;
  ignorePattern?: RegExp;
  exemptConfigFiles?: RegExp;
}

export interface Violation {
  file: string;
  line: number;
  message: string;
  context?: string;
  severity: AuditSeverity;
  fixable?: boolean;
  packageName?: string;
  ruleId?: string;
  ruleDescription?: string;
}

function collectRuleTokens(descriptor: RuleDescriptor | AuditRule): string[] {
  const tokens: string[] = [];
  if (descriptor.id) tokens.push(descriptor.id.toLowerCase()); // string-ok: Case-insensitive token lookup
  if (descriptor.name) tokens.push(descriptor.name.toLowerCase()); // string-ok: Case-insensitive token lookup
  if (descriptor.category) tokens.push(descriptor.category.toLowerCase()); // string-ok: Case-insensitive token lookup
  if (descriptor.aliases) {
    for (const a of descriptor.aliases) {
      if (a) tokens.push(a.toLowerCase()); // string-ok: Case-insensitive token lookup
    }
  }
  return tokens;
}

export function matchesRule(descriptor: RuleDescriptor | AuditRule, selectedRules: ReadonlySet<string>): boolean {
  if (selectedRules.size === 0) return true;
  const tokens = collectRuleTokens(descriptor);
  for (const selected of selectedRules) {
    for (const t of tokens) {
      if (t === selected || t.includes(selected) || selected.includes(t)) {
        return true;
      }
    }
  }
  return false;
}

export function normalizeFilePath(filePath: string): string {
  return normalizePosixPath(filePath).toLowerCase();
}

export function getLineAtMatch(content: string, matchIndex: number): { line: string; lineStartPos: number; lineEndPos: number; trimmed: string } {
  const lineStartPos = content.lastIndexOf('\n', matchIndex - 1) + 1;
  const lineEndPos = content.indexOf('\n', matchIndex);
  const line = lineEndPos === -1 ? content.slice(lineStartPos) : content.slice(lineStartPos, lineEndPos);
  return { line, lineStartPos, lineEndPos, trimmed: line.trim() };
}

export function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function isTestOrNodeModules(filePath?: string): boolean {
  if (!filePath) return true;
  return filePath.includes('node_modules') || isTestPath(filePath);
}
