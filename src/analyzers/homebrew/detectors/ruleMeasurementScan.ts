/**
 * src/analyzers/homebrew/detectors/ruleMeasurementScan.ts
 *
 * Shared AST scan used by the rule-measurement detectors (`auditor-unmeasured-rule`,
 * `auditor-redundant-rule-evaluated`). Parses each inspected file once (cached per
 * inspection context) through the canonical SharedAstContext and cross-references:
 *   - violation sites:  `this.addViolation({ ruleId: 'literal', ... })`
 *   - evaluation wrappers (mark the rule evaluated AND time it): runSubAuditor(Sync),
 *     evaluateRule(Sync), declareSubAuditor, declareFileSubAuditor, declarePatternSubAuditor
 *   - other measurement sources: reportRuleDuration, recordRuleDuration, markRuleNotApplicable
 *   - explicit stamps: `this.markRuleEvaluated('literal')`
 *
 * Only string-literal rule ids are reasoned about. Whenever a measurement call receives a
 * non-literal rule id (e.g. a `for (const r of this.ruleIds)` loop) the scan reports
 * `hasDynamicMeasurement` so detectors abstain instead of guessing.
 */

import ts from 'typescript';
import { SharedAstContext } from '../../../core/astContext.ts';
import type { HomebrewInspectionContext } from '../homebrewTypes.ts';

export interface RuleSite {
  readonly ruleId: string;
  readonly line: number;
}

export interface RuleMeasurementScan {
  readonly violations: readonly RuleSite[];
  readonly marks: readonly RuleSite[];
  /** Rule ids measured by a wrapper or a duration/applicability report. */
  readonly measured: ReadonlySet<string>;
  /** Rule ids evaluated by a wrapper that also marks them evaluated internally. */
  readonly wrapped: ReadonlySet<string>;
  readonly hasDynamicMeasurement: boolean;
}

const EVALUATION_WRAPPER_METHOD_NAMES = [
  'runSubAuditor',
  'runSubAuditorSync',
  'evaluateRule',
  'evaluateRuleSync',
  'declareSubAuditor',
  'declareFileSubAuditor',
  'declarePatternSubAuditor'
] as const;

export type EvaluationWrapperMethod = (typeof EVALUATION_WRAPPER_METHOD_NAMES)[number];
const EVALUATION_WRAPPER_METHODS: ReadonlySet<string> = new Set(EVALUATION_WRAPPER_METHOD_NAMES);

const REPORTING_METHOD_NAMES = [
  'reportRuleDuration',
  'recordRuleDuration',
  'markRuleNotApplicable'
] as const;

export type ReportingMethod = (typeof REPORTING_METHOD_NAMES)[number];
const REPORTING_METHODS: ReadonlySet<string> = new Set(REPORTING_METHOD_NAMES);

const scanCache = new WeakMap<HomebrewInspectionContext, RuleMeasurementScan>();

function literalText(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  let current: ts.Expression = node;
  while (ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)
    ? current.text
    : undefined;
}

function violationRuleLiteral(call: ts.CallExpression): string | undefined {
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return undefined;
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name =
      ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
    if (name === 'ruleId') return literalText(prop.initializer);
  }
  return undefined;
}

function isExtendingFileScanAuditor(node: ts.Node): boolean {
  if (!ts.isClassDeclaration(node) || !node.heritageClauses) return false;
  for (const clause of node.heritageClauses) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      if (ts.isIdentifier(type.expression) && type.expression.text === 'FileScanAuditor') {
        return true;
      }
    }
  }
  return false;
}

interface ScanAccumulator {
  readonly violations: RuleSite[];
  readonly marks: RuleSite[];
  readonly measured: Set<string>;
  readonly wrapped: Set<string>;
  hasDynamicMeasurement: boolean;
}

function processCallSite(call: ts.CallExpression, line: number, acc: ScanAccumulator): void {
  if (!ts.isPropertyAccessExpression(call.expression)) return;
  const method = call.expression.name.text;

  if (method === 'addViolation') {
    const ruleId = violationRuleLiteral(call);
    if (ruleId !== undefined) acc.violations.push({ ruleId, line });
    return;
  }

  if (method === 'markRuleEvaluated') {
    const ruleId = literalText(call.arguments[0]);
    if (ruleId !== undefined) acc.marks.push({ ruleId, line });
    return;
  }

  const isWrapper = EVALUATION_WRAPPER_METHODS.has(method);
  const isReporter = REPORTING_METHODS.has(method);
  if (!isWrapper && !isReporter) return;

  const ruleId = literalText(call.arguments[0]);
  if (ruleId === undefined) {
    acc.hasDynamicMeasurement = true;
    return;
  }

  acc.measured.add(ruleId);
  if (isWrapper) acc.wrapped.add(ruleId);
}

export function scanRuleMeasurement(context: HomebrewInspectionContext): RuleMeasurementScan {
  const cached = scanCache.get(context);
  if (cached) return cached;

  const sourceFile = new SharedAstContext().getSourceFile(context.absolutePath, context.content);
  const acc: ScanAccumulator = {
    violations: [],
    marks: [],
    measured: new Set<string>(),
    wrapped: new Set<string>(),
    hasDynamicMeasurement: false
  };

  let extendsFileScan = false;

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const visit = (node: ts.Node): void => {
    if (!extendsFileScan && isExtendingFileScanAuditor(node)) {
      extendsFileScan = true;
    }

    if (ts.isCallExpression(node)) {
      processCallSite(node, lineOf(node), acc);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (extendsFileScan) {
    const distinctRules = new Set<string>([
      ...acc.violations.map((v) => v.ruleId),
      ...acc.marks.map((m) => m.ruleId)
    ]);
    if (distinctRules.size === 1) {
      for (const singleRule of distinctRules) {
        acc.measured.add(singleRule);
      }
    }
  }

  const scan: RuleMeasurementScan = {
    violations: acc.violations,
    marks: acc.marks,
    measured: acc.measured,
    wrapped: acc.wrapped,
    hasDynamicMeasurement: acc.hasDynamicMeasurement
  };

  scanCache.set(context, scan);
  return scan;
}
