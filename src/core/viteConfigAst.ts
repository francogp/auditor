/**
 * packages/auditor/src/core/viteConfigAst.ts
 *
 * Pure TypeScript Compiler AST engine for reading, inspecting, constructing,
 * and transforming vite.config.ts and legacy ESLint/Vitest configuration files.
 * Zero regex or manual string manipulation.
 */
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import type { AuditConfig } from './auditConfig.ts';
import {
  DEFAULT_AUDIT_CONFIG,
  DEFAULT_CANONICAL_LINT_RULES,
  DEFAULT_VITE_PLUS_AUDIT_CONFIG
} from './auditConfigDefaults.ts';
import type { AuditVitePlusTestProjects } from './auditConfigTypes.ts';
import { getEffectiveIgnoreGlobs } from './canonicalIgnoreRegistry.ts';
import { isPatternContainedInGlobs } from './globContainment.ts';
import { isPathContained, normalizePosixPath, stripGlobSuffix } from './safePath.ts';
import { getAllowedSatellitePathExcludes } from './satelliteGlobMatcher.ts';

function normalizePosixRoot(rawRoot: string): string {
  return (stripGlobSuffix(normalizePosixPath(rawRoot)) || '.').toLowerCase();
}

function isPathUnderRoot(candidatePath: string, rootDir: string, baseDir = process.cwd()): boolean {
  return isPathContained(normalizePosixRoot(rootDir), normalizePosixRoot(candidatePath), baseDir);
}

export { DEFAULT_CANONICAL_LINT_RULES as CANONICAL_LINT_RULES_MAP } from './auditConfigDefaults.ts';

export function parseTsSourceFile(fileContent: string, fileName = 'vite.config.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

export function getPropertyKeyName(name: ts.PropertyName, sf: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  const raw = name.getText(sf);
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function isSimpleIdentifierKey(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

export function createPropertyNameNode(key: string, forceQuote = false): ts.PropertyName {
  if (!forceQuote && isSimpleIdentifierKey(key)) {
    return ts.factory.createIdentifier(key);
  }
  return ts.factory.createStringLiteral(key, true);
}

export function valueToAstExpression(val: unknown, quoteObjectKeys = false): ts.Expression {
  if (typeof val === 'string') {
    return ts.factory.createStringLiteral(val, true);
  }
  if (typeof val === 'number') {
    return ts.factory.createNumericLiteral(val);
  }
  if (typeof val === 'boolean') {
    return val ? ts.factory.createTrue() : ts.factory.createFalse();
  }
  if (Array.isArray(val)) {
    const elements = val.map((item) => valueToAstExpression(item, false));
    return ts.factory.createArrayLiteralExpression(elements, val.length > 2);
  }
  if (typeof val === 'object' && val !== null) {
    const entries = Object.entries(val as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    const props = entries.map(([k, v]) =>
      ts.factory.createPropertyAssignment(
        createPropertyNameNode(k, quoteObjectKeys),
        valueToAstExpression(v, false)
      )
    );
    return ts.factory.createObjectLiteralExpression(props, true);
  }
  return ts.factory.createNull();
}

export function astExpressionToValue(expr: ts.Expression, sf: ts.SourceFile): unknown {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isNumericLiteral(expr)) {
    return Number(expr.text);
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((el) => astExpressionToValue(el, sf));
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const obj: Record<string, unknown> = {};
    for (const prop of expr.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = getPropertyKeyName(prop.name, sf);
        obj[key] = astExpressionToValue(prop.initializer, sf);
      }
    }
    return obj;
  }
  return expr.getText(sf);
}

function unwrapReturnedObject(fnBody: ts.ConciseBody): ts.ObjectLiteralExpression | null {
  if (ts.isParenthesizedExpression(fnBody) && ts.isObjectLiteralExpression(fnBody.expression)) {
    return fnBody.expression;
  }
  if (ts.isObjectLiteralExpression(fnBody)) {
    return fnBody;
  }
  if (ts.isBlock(fnBody)) {
    for (const stmt of fnBody.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        if (ts.isObjectLiteralExpression(stmt.expression)) {
          return stmt.expression;
        }
        if (
          ts.isParenthesizedExpression(stmt.expression) &&
          ts.isObjectLiteralExpression(stmt.expression.expression)
        ) {
          return stmt.expression.expression;
        }
      }
    }
  }
  return null;
}

export function findConfigRootObject(sf: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let rootObj: ts.ObjectLiteralExpression | null = null;

  function checkExpression(expr: ts.Expression): ts.ObjectLiteralExpression | null {
    if (ts.isObjectLiteralExpression(expr)) {
      return expr;
    }
    if (ts.isCallExpression(expr) && expr.arguments.length > 0) {
      const firstArg = expr.arguments[0]!;
      if (ts.isObjectLiteralExpression(firstArg)) {
        return firstArg;
      }
      if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) {
        return unwrapReturnedObject(firstArg.body);
      }
    }
    return null;
  }

  for (const stmt of sf.statements) {
    if (ts.isExportAssignment(stmt)) {
      const found = checkExpression(stmt.expression);
      if (found) return found;
    }
  }

  function visit(node: ts.Node): void {
    if (rootObj) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (callee === 'defineConfig' || callee.endsWith('.defineConfig')) {
        const found = checkExpression(node);
        if (found) {
          rootObj = found;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return rootObj;
}

export function findPropertyAssignment(
  obj: ts.ObjectLiteralExpression,
  propName: string,
  sf: ts.SourceFile
): ts.PropertyAssignment | null {
  let matched: ts.PropertyAssignment | null = null;
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === propName) {
      matched = prop;
    }
  }
  return matched;
}

export function extractAstPropertyBlock(fileContent: string, propName: string): string | null {
  const sf = parseTsSourceFile(fileContent);
  const rootObj = findConfigRootObject(sf);
  if (rootObj) {
    const prop = findPropertyAssignment(rootObj, propName, sf);
    if (prop) {
      return prop.getText(sf);
    }
  }

  let fallbackProp: ts.PropertyAssignment | null = null;
  function visit(node: ts.Node): void {
    if (fallbackProp) return;
    if (
      ts.isPropertyAssignment(node) &&
      getPropertyKeyName(node.name, sf) === propName &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      fallbackProp = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return fallbackProp ? (fallbackProp as ts.PropertyAssignment).getText(sf) : null;
}

export interface ParsedVitestProjectSummary {
  readonly name: string;
  readonly include: readonly string[];
}

export interface ParsedVitePlusConfigSummary {
  readonly definesFromVitePlus: boolean;
  readonly hasSection: (name: string) => boolean;
  readonly lintRules: ReadonlyMap<string, unknown>;
  readonly lintOptions: Readonly<Record<string, unknown>>;
  readonly lintPlugins: readonly string[];
  readonly lintJsPlugins: readonly string[];
  readonly lintIgnorePatterns: readonly string[];
  readonly fmtConfig: Readonly<Record<string, unknown>>;
  readonly fmtIgnorePatterns: readonly string[];
  readonly packConfig: Readonly<Record<string, unknown>>;
  readonly hasPackAttw: boolean;
  readonly testInclude: readonly string[];
  readonly testProjects: readonly ParsedVitestProjectSummary[];
  readonly hasTestProjects: boolean;
  readonly hasRootTestInclude: boolean;
  readonly rootTestInclude: readonly string[];
  readonly testCoverageExclude: readonly string[];
}

function extractStringProp(
  obj: ts.ObjectLiteralExpression,
  propName: string,
  sf: ts.SourceFile
): string | null {
  const prop = findPropertyAssignment(obj, propName, sf);
  if (prop) {
    const val = astExpressionToValue(prop.initializer, sf);
    if (typeof val === 'string') return val;
  }
  return null;
}

function extractStringArrayProp(
  obj: ts.ObjectLiteralExpression,
  propName: string,
  sf: ts.SourceFile
): string[] {
  const prop = findPropertyAssignment(obj, propName, sf);
  const items: string[] = []; // no-domain: Dynamic AST string list
  if (prop && ts.isArrayLiteralExpression(prop.initializer)) {
    for (const el of prop.initializer.elements) {
      const v = astExpressionToValue(el, sf);
      if (typeof v === 'string') items.push(v);
    }
  }
  return items;
}

function extractLintSummaryFromAst(
  lintExpr: ts.Expression | undefined,
  sf: ts.SourceFile
): {
  lintRules: Map<string, unknown>;
  lintOptions: Record<string, unknown>;
  lintPlugins: string[];
  lintJsPlugins: string[];
  lintIgnorePatterns: string[];
} {
  const lintRules = new Map<string, unknown>();
  let lintOptions: Record<string, unknown> = {};
  let lintPlugins: string[] = []; // no-domain: Dynamic AST string list
  let lintJsPlugins: string[] = []; // no-domain: Dynamic AST string list
  let lintIgnorePatterns: string[] = []; // no-domain: Dynamic AST string list

  if (lintExpr && ts.isObjectLiteralExpression(lintExpr)) {
    const rulesProp = findPropertyAssignment(lintExpr, 'rules', sf);
    if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
      for (const rProp of rulesProp.initializer.properties) {
        if (ts.isPropertyAssignment(rProp)) {
          lintRules.set(
            getPropertyKeyName(rProp.name, sf),
            astExpressionToValue(rProp.initializer, sf)
          );
        }
      }
    }
    const optProp = findPropertyAssignment(lintExpr, 'options', sf);
    if (optProp && ts.isObjectLiteralExpression(optProp.initializer)) {
      lintOptions = astExpressionToValue(optProp.initializer, sf) as Record<string, unknown>;
    }
    lintPlugins = extractStringArrayProp(lintExpr, 'plugins', sf);
    lintJsPlugins = extractStringArrayProp(lintExpr, 'jsPlugins', sf);
    lintIgnorePatterns = extractStringArrayProp(lintExpr, 'ignorePatterns', sf);
  }

  return { lintRules, lintOptions, lintPlugins, lintJsPlugins, lintIgnorePatterns };
}

function collectConfigSections(sf: ts.SourceFile): Map<string, ts.Expression> {
  const rootObj = findConfigRootObject(sf);
  const sections = new Map<string, ts.Expression>();
  if (rootObj) {
    for (const prop of rootObj.properties) {
      if (ts.isPropertyAssignment(prop)) {
        sections.set(getPropertyKeyName(prop.name, sf), prop.initializer);
      }
    }
    return sections;
  }
  function visitTopProps(node: ts.Node): void {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
      const key = getPropertyKeyName(node.name, sf);
      if (['lint', 'fmt', 'test', 'pack', 'staged'].includes(key) && !sections.has(key)) {
        sections.set(key, node.initializer);
      }
    }
    ts.forEachChild(node, visitTopProps);
  }
  visitTopProps(sf);
  return sections;
}

function extractProjectInfoFromElement(
  el: ts.ObjectLiteralExpression,
  sf: ts.SourceFile
): {
  name: string;
  innerTestObj: ts.ObjectLiteralExpression | null;
  include: string[];
} {
  const testPropInEl = findPropertyAssignment(el, 'test', sf);
  const innerTestObj =
    testPropInEl && ts.isObjectLiteralExpression(testPropInEl.initializer)
      ? testPropInEl.initializer
      : null;

  const nameVal = innerTestObj
    ? (extractStringProp(innerTestObj, 'name', sf) ?? extractStringProp(el, 'name', sf))
    : extractStringProp(el, 'name', sf);

  const incList = innerTestObj
    ? extractStringArrayProp(innerTestObj, 'include', sf)
    : extractStringArrayProp(el, 'include', sf);

  return {
    name: nameVal ?? '',
    innerTestObj,
    include: incList
  };
}

function extractFmtSummaryFromAst(
  fmtExpr: ts.Expression | undefined,
  sf: ts.SourceFile
): { fmtConfig: Record<string, unknown>; fmtIgnorePatterns: string[] } {
  let fmtConfig: Record<string, unknown> = {};
  let fmtIgnorePatterns: string[] = [];
  if (fmtExpr && ts.isObjectLiteralExpression(fmtExpr)) {
    fmtConfig = astExpressionToValue(fmtExpr, sf) as Record<string, unknown>;
    if (Array.isArray(fmtConfig.ignorePatterns)) {
      fmtIgnorePatterns = fmtConfig.ignorePatterns.filter(
        (v): v is string => typeof v === 'string'
      );
    }
  }
  return { fmtConfig, fmtIgnorePatterns };
}

function extractPackSummaryFromAst(
  packExpr: ts.Expression | undefined,
  sf: ts.SourceFile
): { packConfig: Record<string, unknown>; hasPackAttw: boolean } {
  let packConfig: Record<string, unknown> = {};
  let hasPackAttw = false;
  if (packExpr && ts.isObjectLiteralExpression(packExpr)) {
    packConfig = astExpressionToValue(packExpr, sf) as Record<string, unknown>;
    const attwProp = findPropertyAssignment(packExpr, 'attw', sf);
    hasPackAttw = Boolean(attwProp && ts.isObjectLiteralExpression(attwProp.initializer));
  }
  return { packConfig, hasPackAttw };
}

function extractTestSummaryFromAst(
  testExpr: ts.Expression | undefined,
  sf: ts.SourceFile
): {
  hasRootTestInclude: boolean;
  rootTestInclude: string[];
  testProjects: ParsedVitestProjectSummary[];
  hasTestProjects: boolean;
  testInclude: string[];
  testCoverageExclude: string[];
} {
  let hasRootTestInclude = false;
  let rootTestInclude: string[] = [];
  const testProjects: ParsedVitestProjectSummary[] = [];
  let testCoverageExclude: string[] = [];

  if (testExpr && ts.isObjectLiteralExpression(testExpr)) {
    const incProp = findPropertyAssignment(testExpr, 'include', sf);
    if (incProp) {
      hasRootTestInclude = true;
      rootTestInclude = extractStringArrayProp(testExpr, 'include', sf);
    }

    const coverageProp = findPropertyAssignment(testExpr, 'coverage', sf);
    if (coverageProp && ts.isObjectLiteralExpression(coverageProp.initializer)) {
      testCoverageExclude = extractStringArrayProp(coverageProp.initializer, 'exclude', sf);
    }

    const projectsProp = findPropertyAssignment(testExpr, 'projects', sf);
    if (projectsProp && ts.isArrayLiteralExpression(projectsProp.initializer)) {
      for (const el of projectsProp.initializer.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;

        const info = extractProjectInfoFromElement(el, sf);
        if (info.name || info.include.length > 0) {
          testProjects.push({
            name: info.name,
            include: info.include
          });
        }
      }
    }
  }

  const hasTestProjects = testProjects.length > 0;
  const testInclude = hasTestProjects
    ? Array.from(new Set([...rootTestInclude, ...testProjects.flatMap((p) => p.include)]))
    : rootTestInclude;

  return {
    hasRootTestInclude,
    rootTestInclude,
    testProjects,
    hasTestProjects,
    testInclude,
    testCoverageExclude
  };
}

export function extractParsedConfigSummary(fileContent: string): ParsedVitePlusConfigSummary {
  const sf = parseTsSourceFile(fileContent);
  const definesFromVitePlus = sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text === 'vite-plus'
  );

  const sections = collectConfigSections(sf);
  const { lintRules, lintOptions, lintPlugins, lintJsPlugins, lintIgnorePatterns } =
    extractLintSummaryFromAst(sections.get('lint'), sf);
  const { fmtConfig, fmtIgnorePatterns } = extractFmtSummaryFromAst(sections.get('fmt'), sf);
  const { packConfig, hasPackAttw } = extractPackSummaryFromAst(sections.get('pack'), sf);
  const {
    hasRootTestInclude,
    rootTestInclude,
    testProjects,
    hasTestProjects,
    testInclude,
    testCoverageExclude
  } = extractTestSummaryFromAst(sections.get('test'), sf);

  return {
    definesFromVitePlus,
    hasSection: (name: string) => sections.has(name),
    lintRules,
    lintOptions,
    lintPlugins,
    lintJsPlugins,
    lintIgnorePatterns,
    fmtConfig,
    fmtIgnorePatterns,
    packConfig,
    hasPackAttw,
    testInclude,
    testProjects,
    hasTestProjects,
    hasRootTestInclude,
    rootTestInclude,
    testCoverageExclude
  };
}

export function extractEslintIgnoresFromAst(rawContent: string): string[] {
  const sf = parseTsSourceFile(rawContent, 'eslint.config.ts');
  const globs: string[] = []; // no-domain: Dynamic AST string list

  function collectStringsFromArray(arr: ts.ArrayLiteralExpression): void {
    for (const el of arr.elements) {
      if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
        if (el.text) globs.push(el.text);
      }
    }
  }

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === 'globalIgnores' &&
      node.arguments.length > 0 &&
      ts.isArrayLiteralExpression(node.arguments[0]!)
    ) {
      collectStringsFromArray(node.arguments[0]);
    } else if (
      ts.isPropertyAssignment(node) &&
      getPropertyKeyName(node.name, sf) === 'ignores' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      collectStringsFromArray(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return globs;
}

export function buildPackAstObject(): ts.ObjectLiteralExpression {
  const outExtensionsArrow = ts.factory.createArrowFunction(
    undefined,
    undefined,
    [],
    undefined,
    ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    ts.factory.createParenthesizedExpression(valueToAstExpression({ js: '.js', dts: '.d.ts' }))
  );
  return ts.factory.createObjectLiteralExpression(
    [
      ts.factory.createPropertyAssignment(
        'entry',
        valueToAstExpression(['src/index.ts', 'src/cli/*.ts', 'src/suites/**/*.ts'])
      ),
      ts.factory.createPropertyAssignment('unbundle', ts.factory.createTrue()),
      ts.factory.createPropertyAssignment('dts', ts.factory.createTrue()),
      ts.factory.createPropertyAssignment('publint', ts.factory.createTrue()),
      ts.factory.createPropertyAssignment('attw', valueToAstExpression({ profile: 'esm-only' })),
      ts.factory.createPropertyAssignment('outExtensions', outExtensionsArrow)
    ],
    true
  );
}

function buildLintOverridesArrayAst(
  overrides: readonly { files: readonly string[]; rules?: Readonly<Record<string, unknown>> }[]
): ts.ArrayLiteralExpression {
  const ovElements = overrides.map((ov) =>
    ts.factory.createObjectLiteralExpression(
      [
        ts.factory.createPropertyAssignment('files', valueToAstExpression(ov.files)),
        ts.factory.createPropertyAssignment('rules', valueToAstExpression(ov.rules ?? {}, true))
      ],
      true
    )
  );
  return ts.factory.createArrayLiteralExpression(ovElements, true);
}

export function buildLintAstObject(
  auditConfig: AuditConfig,
  lintIgnores: readonly string[]
): ts.ObjectLiteralExpression {
  const lintCfg = auditConfig.vitePlusConfig?.lint;
  const typeAware = lintCfg?.typeAware ?? true;
  const typeCheck = lintCfg?.typeCheck ?? true;

  const mergedRules: Record<string, unknown> = { ...DEFAULT_CANONICAL_LINT_RULES };
  if (auditConfig.vitePlusConfig?.extraLintRules) {
    for (const [k, v] of Object.entries(auditConfig.vitePlusConfig.extraLintRules)) {
      mergedRules[k] = v;
    }
  }
  if (lintCfg?.rules) {
    for (const [k, v] of Object.entries(lintCfg.rules)) {
      mergedRules[k] = v;
    }
  }

  const props: ts.ObjectLiteralElementLike[] = [
    ts.factory.createPropertyAssignment('options', valueToAstExpression({ typeAware, typeCheck }))
  ];

  if (lintCfg?.categories && Object.keys(lintCfg.categories).length > 0) {
    props.push(
      ts.factory.createPropertyAssignment(
        'categories',
        valueToAstExpression(lintCfg.categories, true)
      )
    );
  }

  const configuredPlugins = lintCfg?.plugins ?? DEFAULT_VITE_PLUS_AUDIT_CONFIG.lint?.plugins ?? [];
  if (configuredPlugins.length > 0) {
    props.push(
      ts.factory.createPropertyAssignment('plugins', valueToAstExpression([...configuredPlugins]))
    );
  }

  props.push(
    ts.factory.createPropertyAssignment(
      'jsPlugins',
      valueToAstExpression(['@francogp/auditor/domain-type-plugin'])
    ),
    ts.factory.createPropertyAssignment('rules', valueToAstExpression(mergedRules, true)),
    ts.factory.createPropertyAssignment('ignorePatterns', valueToAstExpression(lintIgnores))
  );

  if (lintCfg?.overrides && lintCfg.overrides.length > 0) {
    props.push(
      ts.factory.createPropertyAssignment(
        'overrides',
        buildLintOverridesArrayAst(lintCfg.overrides)
      )
    );
  }

  return ts.factory.createObjectLiteralExpression(props, true);
}

export function buildFmtAstObject(
  auditConfig: AuditConfig,
  fmtIgnores: readonly string[]
): ts.ObjectLiteralExpression {
  const fmtCfg = auditConfig.vitePlusConfig?.fmt;
  const fmtData: Record<string, unknown> = {
    singleQuote: fmtCfg?.singleQuote ?? true,
    semi: fmtCfg?.semi ?? true,
    trailingComma: fmtCfg?.trailingComma ?? 'none',
    printWidth: fmtCfg?.printWidth ?? 100,
    sortPackageJson: fmtCfg?.sortPackageJson ?? true,
    sortImports: fmtCfg?.sortImports ?? true,
    ignorePatterns: fmtIgnores
  };
  if (fmtCfg?.tabWidth !== undefined) fmtData.tabWidth = fmtCfg.tabWidth;
  if (fmtCfg?.useTabs !== undefined) fmtData.useTabs = fmtCfg.useTabs;
  return valueToAstExpression(fmtData) as ts.ObjectLiteralExpression;
}

export function resolveVitestRoots(auditConfig: AuditConfig): readonly string[] {
  const rawTestRoots = auditConfig.paths?.testRoots ?? DEFAULT_AUDIT_CONFIG.paths.testRoots;
  const e2eRootsList = auditConfig.paths?.e2eRoots ??
    DEFAULT_AUDIT_CONFIG.paths.e2eRoots ?? ['e2e'];
  const normalizedE2eRoots = e2eRootsList.map(normalizePosixRoot);
  const vitestRoots = rawTestRoots.filter((r) => {
    const normR = normalizePosixRoot(r);
    return !normalizedE2eRoots.some((e2e) => isPathUnderRoot(normR, e2e)) && normR !== 'e2e';
  });
  return vitestRoots.length > 0 ? vitestRoots : DEFAULT_AUDIT_CONFIG.paths.testRoots;
}

export function buildTestAstObject(auditConfig: AuditConfig): ts.ObjectLiteralExpression {
  const coverageThreshold = auditConfig.testCoverage?.threshold ?? 80;
  const rawTestRoots = auditConfig.paths?.testRoots ?? DEFAULT_AUDIT_CONFIG.paths.testRoots;
  const e2eRootsList = auditConfig.paths?.e2eRoots ??
    DEFAULT_AUDIT_CONFIG.paths.e2eRoots ?? ['e2e'];
  const testRoots = resolveVitestRoots(auditConfig);
  const srcRoots = auditConfig.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
  const cliRoots = auditConfig.paths?.cliRoots ?? DEFAULT_AUDIT_CONFIG.paths.cliRoots ?? [];
  const testProjectsConfig = auditConfig.vitePlusConfig?.test?.projects;
  const hasProjects = Boolean(testProjectsConfig && Object.keys(testProjectsConfig).length > 0);

  const testData: Record<string, unknown> = {
    environment: 'node',
    ...(hasProjects && testProjectsConfig
      ? {
          projects: Object.entries(testProjectsConfig).map(([projName, roots]) => ({
            test: {
              name: projName,
              include: roots.map((r) => (r.includes('*') ? r : `${r}/**/*.{test,spec}.ts`))
            }
          }))
        }
      : {
          include: testRoots.map((r) => `${r}/**/*.{test,spec}.ts`)
        }),
    coverage: {
      provider: 'v8',
      reportsDirectory: 'scratch/coverage',
      include: srcRoots.map((r) => `${r}/**/*.ts`),
      exclude: [
        ...cliRoots.map((r) => `${r}/**`),
        ...rawTestRoots.map((r) => `${r}/**`),
        ...e2eRootsList.map((r) => `${r}/**`)
      ],
      thresholds: {
        lines: coverageThreshold,
        functions: coverageThreshold,
        branches: coverageThreshold,
        statements: coverageThreshold
      }
    }
  };
  return valueToAstExpression(testData) as ts.ObjectLiteralExpression;
}

export function buildStagedAstObject(auditConfig: AuditConfig): ts.ObjectLiteralExpression {
  const stagedCfg = auditConfig.vitePlusConfig?.staged;
  let rulesObj: Record<string, string> = { '*': 'vp check --fix' };
  if (stagedCfg) {
    const candidate: unknown =
      'rules' in stagedCfg && stagedCfg.rules ? stagedCfg.rules : stagedCfg;
    if (typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)) {
      const nextRules: Record<string, string> = {};
      for (const [k, v] of Object.entries(candidate)) {
        if (typeof v === 'string') {
          nextRules[k] = v;
        }
      }
      if (Object.keys(nextRules).length > 0) {
        rulesObj = nextRules;
      }
    }
  }
  return valueToAstExpression(rulesObj, true) as ts.ObjectLiteralExpression;
}

export function printAstNode(node: ts.Node, sf?: ts.SourceFile): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const sourceFile = sf ?? parseTsSourceFile('', 'vite.config.ts');
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

export function buildCanonicalVitePlusAstSource(
  auditConfig: AuditConfig,
  lintIgnores: readonly string[],
  fmtIgnores: readonly string[],
  legacyTestProperty?: ts.PropertyAssignment | null
): string {
  const isLibrary = auditConfig.packageDistribution?.enabled !== false;
  const rootProps: ts.ObjectLiteralElementLike[] = [];

  if (isLibrary) {
    rootProps.push(ts.factory.createPropertyAssignment('pack', buildPackAstObject()));
  }
  rootProps.push(
    ts.factory.createPropertyAssignment('lint', buildLintAstObject(auditConfig, lintIgnores)),
    ts.factory.createPropertyAssignment('fmt', buildFmtAstObject(auditConfig, fmtIgnores)),
    legacyTestProperty ??
      ts.factory.createPropertyAssignment('test', buildTestAstObject(auditConfig)),
    ts.factory.createPropertyAssignment('staged', buildStagedAstObject(auditConfig))
  );

  const importDecl = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier('defineConfig')
        )
      ])
    ),
    ts.factory.createStringLiteral('vite-plus', true)
  );

  const exportDefault = ts.factory.createExportAssignment(
    undefined,
    false,
    ts.factory.createCallExpression(ts.factory.createIdentifier('defineConfig'), undefined, [
      ts.factory.createObjectLiteralExpression(rootProps, true)
    ])
  );

  const sf = ts.factory.createSourceFile(
    [importDecl, exportDefault],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printFile(sf);
}

export function detachNodeFromSourceFile<T extends ts.Node>(node: T): T {
  const transformer: ts.TransformerFactory<T> = (context) => {
    const visit: ts.Visitor = (curr): ts.Node => {
      const visited = ts.visitEachChild(curr, visit, context);
      if (ts.isIdentifier(visited)) {
        return ts.factory.createIdentifier(visited.text);
      }
      if (ts.isStringLiteral(visited)) {
        return ts.factory.createStringLiteral(visited.text, true);
      }
      if (ts.isNumericLiteral(visited)) {
        return ts.factory.createNumericLiteral(visited.text);
      }
      return ts.setTextRange(visited, { pos: -1, end: -1 });
    };
    return (root) => ts.visitNode(root, visit) as T;
  };
  const res = ts.transform(node, [transformer]);
  const transformed = res.transformed[0]!;
  res.dispose();
  return transformed;
}

export function parseLegacyTestPropertyNode(legacyTestBlock: string): ts.PropertyAssignment | null {
  const wrapped = `export default defineConfig({\n${legacyTestBlock}\n});`;
  const sf = parseTsSourceFile(wrapped, 'vitest.config.ts');
  const rootObj = findConfigRootObject(sf);
  if (!rootObj) return null;
  const testProp = findPropertyAssignment(rootObj, 'test', sf);
  if (!testProp) return null;
  return detachNodeFromSourceFile(testProp);
}

const TUPLE_REQUIRED_RULE_LIST = [
  '@typescript-eslint/consistent-type-assertions',
  'no-empty',
  'eqeqeq'
] as const;

const TUPLE_REQUIRED_RULES: ReadonlySet<string> = new Set<string>(TUPLE_REQUIRED_RULE_LIST);

function checkTupleRuleOption(ruleName: string, second: unknown): boolean {
  if (ruleName === '@typescript-eslint/consistent-type-assertions') {
    const cfg =
      typeof second === 'object' && second !== null ? (second as Record<string, unknown>) : null;
    return (
      cfg !== null && cfg.assertionStyle === 'as' && cfg.objectLiteralTypeAssertions === 'never'
    );
  }
  if (ruleName === 'no-empty') {
    const cfg =
      typeof second === 'object' && second !== null ? (second as Record<string, unknown>) : null;
    return cfg !== null && cfg.allowEmptyCatch === false;
  }
  if (ruleName === 'eqeqeq') {
    return second === 'always';
  }
  return true;
}

export function isRuleValueCompliant(ruleName: string, val: unknown): boolean {
  if (typeof val === 'string') {
    if (TUPLE_REQUIRED_RULES.has(ruleName)) return false;
    return val.toLowerCase() === 'error';
  }
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first !== 'string' || first.toLowerCase() !== 'error') {
      return false;
    }
    return checkTupleRuleOption(ruleName, val[1]);
  }
  return false;
}

function updateObjectProperty(
  props: readonly ts.ObjectLiteralElementLike[],
  key: string,
  newInitializer: ts.Expression,
  sf: ts.SourceFile,
  forceQuote = false
): ts.ObjectLiteralElementLike[] {
  const newProp = ts.factory.createPropertyAssignment(
    createPropertyNameNode(key, forceQuote),
    newInitializer
  );
  let replaced = false;
  const nextProps = props.map((prop) => {
    if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === key) {
      replaced = true;
      return newProp;
    }
    return prop;
  });
  if (!replaced) {
    nextProps.push(newProp);
  }
  return nextProps;
}

function removeObjectProperty(
  props: readonly ts.ObjectLiteralElementLike[],
  key: string,
  sf: ts.SourceFile
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  let modified = false;
  const filtered = props.filter((prop) => {
    if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === key) {
      modified = true;
      return false;
    }
    return true;
  });
  return { props: filtered, modified };
}

function deduplicateObjectProperties(
  props: readonly ts.ObjectLiteralElementLike[],
  sf: ts.SourceFile
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  const lastIdxByKey = new Map<string, number>();
  props.forEach((p, idx) => {
    if (ts.isPropertyAssignment(p)) {
      lastIdxByKey.set(getPropertyKeyName(p.name, sf), idx);
    }
  });
  let modified = false;
  const filtered = props.filter((p, idx) => {
    if (ts.isPropertyAssignment(p)) {
      const key = getPropertyKeyName(p.name, sf);
      if (lastIdxByKey.get(key) !== idx) {
        modified = true;
        return false;
      }
    }
    return true;
  });
  return { props: filtered, modified };
}

function syncStringArrayExpression(
  existingProp: ts.PropertyAssignment | null,
  requiredStrings: readonly string[],
  sf: ts.SourceFile,
  exact = false
): { expr: ts.ArrayLiteralExpression; modified: boolean } {
  const currentValues: string[] = []; // no-domain: Dynamic AST string list
  if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer)) {
    for (const el of existingProp.initializer.elements) {
      const v = astExpressionToValue(el, sf);
      if (typeof v === 'string') currentValues.push(v);
    }
  }
  if (exact) {
    const isSameLength = currentValues.length === requiredStrings.length;
    const allMatch = isSameLength && requiredStrings.every((req, i) => currentValues[i] === req);
    if (existingProp && ts.isArrayLiteralExpression(existingProp.initializer) && allMatch) {
      return { expr: existingProp.initializer, modified: false };
    }
    return {
      expr: valueToAstExpression([...requiredStrings]) as ts.ArrayLiteralExpression,
      modified: true
    };
  }
  const missing = requiredStrings.filter((req) => !currentValues.includes(req));
  if (
    existingProp &&
    ts.isArrayLiteralExpression(existingProp.initializer) &&
    missing.length === 0
  ) {
    return { expr: existingProp.initializer, modified: false };
  }
  const merged = Array.from(new Set([...currentValues, ...requiredStrings]));
  return {
    expr: valueToAstExpression(merged) as ts.ArrayLiteralExpression,
    modified: true
  };
}

function syncLintRulesAst(
  rulesProp: ts.PropertyAssignment | null | undefined,
  auditConfig: AuditConfig,
  sf: ts.SourceFile
): { rulesProps: ts.ObjectLiteralElementLike[]; modified: boolean } {
  let rulesProps: ts.ObjectLiteralElementLike[] = [];
  let rulesModified = false;
  if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
    const rDedup = deduplicateObjectProperties(rulesProp.initializer.properties, sf);
    rulesProps = rDedup.props;
    if (rDedup.modified) rulesModified = true;
  } else {
    rulesModified = true;
  }

  const currentRuleMap = new Map<string, unknown>();
  for (const rp of rulesProps) {
    if (ts.isPropertyAssignment(rp)) {
      currentRuleMap.set(getPropertyKeyName(rp.name, sf), astExpressionToValue(rp.initializer, sf));
    }
  }

  for (const [ruleName, canonicalVal] of Object.entries(DEFAULT_CANONICAL_LINT_RULES)) {
    const existingVal = currentRuleMap.get(ruleName);
    if (!isRuleValueCompliant(ruleName, existingVal)) {
      rulesProps = updateObjectProperty(
        rulesProps,
        ruleName,
        valueToAstExpression(canonicalVal),
        sf,
        true
      );
      currentRuleMap.set(ruleName, canonicalVal);
      rulesModified = true;
    }
  }

  if (auditConfig.vitePlusConfig?.extraLintRules) {
    for (const [ruleName, ruleLevel] of Object.entries(auditConfig.vitePlusConfig.extraLintRules)) {
      if (currentRuleMap.get(ruleName) !== ruleLevel) {
        rulesProps = updateObjectProperty(
          rulesProps,
          ruleName,
          valueToAstExpression(ruleLevel),
          sf,
          true
        );
        currentRuleMap.set(ruleName, ruleLevel);
        rulesModified = true;
      }
    }
  }

  if (auditConfig.vitePlusConfig?.lint?.rules) {
    for (const [ruleName, ruleVal] of Object.entries(auditConfig.vitePlusConfig.lint.rules)) {
      if (JSON.stringify(currentRuleMap.get(ruleName)) !== JSON.stringify(ruleVal)) {
        rulesProps = updateObjectProperty(
          rulesProps,
          ruleName,
          valueToAstExpression(ruleVal),
          sf,
          true
        );
        currentRuleMap.set(ruleName, ruleVal);
        rulesModified = true;
      }
    }
  }

  const allowedRuleKeys = new Set<string>([
    ...Object.keys(DEFAULT_CANONICAL_LINT_RULES),
    ...Object.keys(auditConfig.vitePlusConfig?.extraLintRules ?? {}),
    ...Object.keys(auditConfig.vitePlusConfig?.lint?.rules ?? {})
  ]);

  const purge = purgeOrphanLintRulesAst(rulesProps, currentRuleMap, allowedRuleKeys, sf);
  if (purge.modified) {
    rulesProps = purge.rulesProps;
    rulesModified = true;
  }

  return { rulesProps, modified: rulesModified };
}

function purgeOrphanLintRulesAst(
  rulesProps: ts.ObjectLiteralElementLike[],
  currentRuleMap: Map<string, unknown>,
  allowedRuleKeys: ReadonlySet<string>,
  sf: ts.SourceFile
): { rulesProps: ts.ObjectLiteralElementLike[]; modified: boolean } {
  let modified = false;
  let nextProps = rulesProps;
  for (const ruleKey of currentRuleMap.keys()) {
    if (!allowedRuleKeys.has(ruleKey)) {
      const rmResult = removeObjectProperty(nextProps, ruleKey, sf);
      if (rmResult.modified) {
        nextProps = rmResult.props;
        currentRuleMap.delete(ruleKey);
        modified = true;
      }
    }
  }
  return { rulesProps: nextProps, modified };
}

function syncLintSectionAst(
  lintObj: ts.ObjectLiteralExpression,
  auditConfig: AuditConfig,
  lintIgnores: readonly string[],
  sf: ts.SourceFile
): { obj: ts.ObjectLiteralExpression; modified: boolean } {
  const dedup = deduplicateObjectProperties(lintObj.properties, sf);
  let props = dedup.props;
  let modified = dedup.modified;

  const tempObj = ts.factory.createObjectLiteralExpression(props, true);

  // 1. options: { typeAware, typeCheck }
  const optProp = findPropertyAssignment(tempObj, 'options', sf);
  const typeAware = auditConfig.vitePlusConfig?.lint?.typeAware ?? true;
  const typeCheck = auditConfig.vitePlusConfig?.lint?.typeCheck ?? true;
  if (!optProp || !ts.isObjectLiteralExpression(optProp.initializer)) {
    props = [
      ts.factory.createPropertyAssignment(
        'options',
        valueToAstExpression({ typeAware, typeCheck })
      ),
      ...props.filter(
        (p) => !(ts.isPropertyAssignment(p) && getPropertyKeyName(p.name, sf) === 'options')
      )
    ];
    modified = true;
  } else {
    const optVal = astExpressionToValue(optProp.initializer, sf) as Record<string, unknown>;
    if (optVal.typeAware === undefined || optVal.typeCheck === undefined) {
      props = updateObjectProperty(
        props,
        'options',
        valueToAstExpression({ ...optVal, typeAware, typeCheck }),
        sf
      );
      modified = true;
    }
  }

  // 2. plugins
  const requiredPlugins =
    auditConfig.vitePlusConfig?.lint?.plugins ?? DEFAULT_VITE_PLUS_AUDIT_CONFIG.lint?.plugins ?? [];
  if (requiredPlugins.length > 0) {
    const linterPluginsProp = findPropertyAssignment(
      ts.factory.createObjectLiteralExpression(props, true),
      'plugins',
      sf
    );
    const linterPluginSync = syncStringArrayExpression(linterPluginsProp, requiredPlugins, sf);
    if (linterPluginSync.modified) {
      props = updateObjectProperty(props, 'plugins', linterPluginSync.expr, sf);
      modified = true;
    }
  }

  // 3. jsPlugins
  const pluginsProp = findPropertyAssignment(
    ts.factory.createObjectLiteralExpression(props, true),
    'jsPlugins',
    sf
  );
  const pluginSync = syncStringArrayExpression(
    pluginsProp,
    ['@francogp/auditor/domain-type-plugin'],
    sf
  );
  if (pluginSync.modified) {
    props = updateObjectProperty(props, 'jsPlugins', pluginSync.expr, sf);
    modified = true;
  }

  // 3. rules
  const rulesProp = findPropertyAssignment(
    ts.factory.createObjectLiteralExpression(props, true),
    'rules',
    sf
  );
  const syncedRules = syncLintRulesAst(rulesProp, auditConfig, sf);
  if (syncedRules.modified) {
    props = updateObjectProperty(
      props,
      'rules',
      ts.factory.createObjectLiteralExpression(syncedRules.rulesProps, true),
      sf
    );
    modified = true;
  }

  // 4. ignorePatterns
  const ignoreProp = findPropertyAssignment(
    ts.factory.createObjectLiteralExpression(props, true),
    'ignorePatterns',
    sf
  );
  const ignoreSync = syncStringArrayExpression(ignoreProp, lintIgnores, sf, true);
  if (ignoreSync.modified) {
    props = updateObjectProperty(props, 'ignorePatterns', ignoreSync.expr, sf);
    modified = true;
  }

  // 5. overrides
  const configuredOverrides = auditConfig.vitePlusConfig?.lint?.overrides;
  if (configuredOverrides && configuredOverrides.length > 0) {
    const ovProp = findPropertyAssignment(
      ts.factory.createObjectLiteralExpression(props, true),
      'overrides',
      sf
    );
    const currentOvVal = ovProp ? astExpressionToValue(ovProp.initializer, sf) : undefined;
    if (JSON.stringify(currentOvVal) !== JSON.stringify(configuredOverrides)) {
      props = updateObjectProperty(
        props,
        'overrides',
        buildLintOverridesArrayAst(configuredOverrides),
        sf
      );
      modified = true;
    }
  }

  return {
    obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : lintObj,
    modified
  };
}

function syncFmtSectionAst(
  fmtObj: ts.ObjectLiteralExpression,
  auditConfig: AuditConfig,
  fmtIgnores: readonly string[],
  sf: ts.SourceFile
): { obj: ts.ObjectLiteralExpression; modified: boolean } {
  const dedup = deduplicateObjectProperties(fmtObj.properties, sf);
  let props = dedup.props;
  let modified = dedup.modified;

  const sortPackageJson = auditConfig.vitePlusConfig?.fmt?.sortPackageJson ?? true;
  const sortImports = auditConfig.vitePlusConfig?.fmt?.sortImports ?? true;

  const curVal = astExpressionToValue(fmtObj, sf) as Record<string, unknown>;
  if (sortPackageJson && curVal.sortPackageJson !== true) {
    props = updateObjectProperty(props, 'sortPackageJson', ts.factory.createTrue(), sf);
    modified = true;
  }
  if (sortImports && curVal.sortImports !== true) {
    props = updateObjectProperty(props, 'sortImports', ts.factory.createTrue(), sf);
    modified = true;
  }

  const ignoreProp = findPropertyAssignment(
    ts.factory.createObjectLiteralExpression(props, true),
    'ignorePatterns',
    sf
  );
  const ignoreSync = syncStringArrayExpression(ignoreProp, fmtIgnores, sf, true);
  if (ignoreSync.modified) {
    props = updateObjectProperty(props, 'ignorePatterns', ignoreSync.expr, sf);
    modified = true;
  }

  return {
    obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : fmtObj,
    modified
  };
}

function syncTestIncludeAst(
  props: ts.ObjectLiteralElementLike[],
  auditConfig: AuditConfig,
  sf: ts.SourceFile
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  let modified = false;
  const e2eRootsList = auditConfig.paths?.e2eRoots ?? ['e2e'];
  const normalizedE2eRoots = e2eRootsList.map(normalizePosixRoot);
  const testRoots = resolveVitestRoots(auditConfig);
  const includeProp = findPropertyAssignment(
    ts.factory.createObjectLiteralExpression(props, true),
    'include',
    sf
  );
  const existingIncludes: string[] = []; // no-domain: Dynamic AST string list
  if (includeProp && ts.isArrayLiteralExpression(includeProp.initializer)) {
    for (const el of includeProp.initializer.elements) {
      const v = astExpressionToValue(el, sf);
      if (typeof v === 'string') {
        const isE2e =
          normalizedE2eRoots.some((e2e) => isPathUnderRoot(v, e2e)) || isPathUnderRoot(v, 'e2e');
        if (!isE2e) {
          existingIncludes.push(v);
        } else {
          modified = true;
        }
      }
    }
  }

  const missingRoots: string[] = []; // no-domain: Dynamic AST string list
  for (const root of testRoots) {
    const pattern = `${root}/**/*.{test,spec}.ts`;
    const simple = `${root}/**/*.test.ts`;
    const covered = existingIncludes.some(
      (inc) => inc === pattern || inc === simple || isPathUnderRoot(inc, root)
    );
    if (!covered) {
      missingRoots.push(pattern);
    }
  }

  if (missingRoots.length > 0 || (includeProp && modified)) {
    const merged = Array.from(new Set([...existingIncludes, ...missingRoots]));
    const updatedProps = updateObjectProperty(props, 'include', valueToAstExpression(merged), sf);
    return { props: updatedProps, modified: true };
  }

  return { props, modified };
}

export function buildAllowedCoverageExcludes(
  auditConfig: AuditConfig,
  projectRoot?: string
): Set<string> {
  const root = projectRoot ?? process.cwd();
  const srcRoots = auditConfig.paths?.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots;
  const coverageExemptGlobs = (auditConfig.coverage?.exemptGlobs ?? []).map((e) => e.glob);
  const rawAllowedGlobs: string[] = [
    '**/*.d.ts',
    ...srcRoots.map((r) => `${normalizePosixRoot(r)}/**/*.d.ts`),
    ...getAllowedSatellitePathExcludes(auditConfig, root),
    ...(auditConfig.testCoverage?.exemptGlobs ?? []).map((p) => normalizePosixPath(p)),
    ...coverageExemptGlobs.map((p) => normalizePosixPath(p))
  ];
  return new Set<string>(rawAllowedGlobs);
}

function syncCoverageCorePropertiesAst(
  covObj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  let covProps = [...covObj.properties];
  let covModified = false;

  const repDirProp = findPropertyAssignment(covObj, 'reportsDirectory', sf);
  const repVal = repDirProp ? astExpressionToValue(repDirProp.initializer, sf) : null;
  if (!repDirProp || (typeof repVal === 'string' && repVal !== 'scratch/coverage')) {
    covProps = updateObjectProperty(
      covProps,
      'reportsDirectory',
      ts.factory.createStringLiteral('scratch/coverage', true),
      sf
    );
    covModified = true;
  }

  const providerProp = findPropertyAssignment(covObj, 'provider', sf);
  if (!providerProp) {
    covProps = updateObjectProperty(
      covProps,
      'provider',
      ts.factory.createStringLiteral('v8', true),
      sf
    );
    covModified = true;
  }

  return { props: covProps, modified: covModified };
}

function syncCoverageExcludePropertyAst(
  covProps: ts.ObjectLiteralElementLike[],
  covObj: ts.ObjectLiteralExpression,
  auditConfig: AuditConfig,
  sf: ts.SourceFile,
  projectRoot?: string
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  const excludeProp = findPropertyAssignment(covObj, 'exclude', sf);
  if (!excludeProp || !ts.isArrayLiteralExpression(excludeProp.initializer)) {
    return { props: covProps, modified: false };
  }

  const allowedCoverageExcludes = buildAllowedCoverageExcludes(auditConfig, projectRoot);
  const effectiveGlobs = getEffectiveIgnoreGlobs(projectRoot ?? process.cwd());
  const remainingElements: ts.Expression[] = [];
  let excludeModified = false;

  for (const el of excludeProp.initializer.elements) {
    const text = astExpressionToValue(el, sf);
    if (typeof text !== 'string') {
      remainingElements.push(el);
      continue;
    }
    if (isPatternContainedInGlobs(text, allowedCoverageExcludes, effectiveGlobs)) {
      remainingElements.push(el);
    } else {
      excludeModified = true;
    }
  }

  if (!excludeModified) {
    return { props: covProps, modified: false };
  }

  const finalElements =
    remainingElements.length > 0
      ? remainingElements
      : [ts.factory.createStringLiteral('**/*.d.ts', true)];
  const updatedProps = updateObjectProperty(
    covProps,
    'exclude',
    ts.factory.createArrayLiteralExpression(finalElements, true),
    sf
  );
  return { props: updatedProps, modified: true };
}

function syncTestCoverageAst(
  props: ts.ObjectLiteralElementLike[],
  auditConfig: AuditConfig,
  sf: ts.SourceFile,
  projectRoot?: string
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  const coverageProp = findPropertyAssignment(
    ts.factory.createObjectLiteralExpression(props, true),
    'coverage',
    sf
  );

  if (!coverageProp) {
    const defaultCoverageObj = ts.factory.createObjectLiteralExpression(
      [
        ts.factory.createPropertyAssignment('provider', ts.factory.createStringLiteral('v8', true)),
        ts.factory.createPropertyAssignment(
          'reportsDirectory',
          ts.factory.createStringLiteral('scratch/coverage', true)
        )
      ],
      true
    );
    return {
      props: updateObjectProperty(props, 'coverage', defaultCoverageObj, sf),
      modified: true
    };
  }

  if (!ts.isObjectLiteralExpression(coverageProp.initializer)) {
    return { props, modified: false };
  }

  const covObj = coverageProp.initializer;
  const coreRes = syncCoverageCorePropertiesAst(covObj, sf);
  const excludeRes = syncCoverageExcludePropertyAst(
    coreRes.props,
    covObj,
    auditConfig,
    sf,
    projectRoot
  );

  const modified = coreRes.modified || excludeRes.modified;
  if (!modified) {
    return { props, modified: false };
  }

  return {
    props: updateObjectProperty(
      props,
      'coverage',
      ts.factory.createObjectLiteralExpression(excludeRes.props, true),
      sf
    ),
    modified: true
  };
}

function toTestGlobPattern(root: string): string {
  return root.includes('*') ? root : `${root}/**/*.{test,spec}.ts`;
}

function findPropInList(
  props: readonly ts.ObjectLiteralElementLike[],
  propName: string,
  sf: ts.SourceFile
): ts.PropertyAssignment | undefined {
  for (const prop of props) {
    if (ts.isPropertyAssignment(prop) && getPropertyKeyName(prop.name, sf) === propName) {
      return prop;
    }
  }
  return undefined;
}

function syncTestProjectsAst(
  props: ts.ObjectLiteralElementLike[],
  testProjectsConfig: AuditVitePlusTestProjects,
  sf: ts.SourceFile
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  let modified = false;
  const projectsProp = findPropInList(props, 'projects', sf);

  const existingElements: ts.Expression[] =
    projectsProp && ts.isArrayLiteralExpression(projectsProp.initializer)
      ? [...projectsProp.initializer.elements]
      : [];

  const updatedElements = [...existingElements];
  const handledProjects = new Set<string>();

  for (let i = 0; i < updatedElements.length; i++) {
    const el = updatedElements[i];
    if (!el || !ts.isObjectLiteralExpression(el)) continue;

    const info = extractProjectInfoFromElement(el, sf);
    const configuredRoots = info.name ? testProjectsConfig[info.name] : undefined;

    if (info.name && configuredRoots) {
      handledProjects.add(info.name);
      const expectedPatterns = configuredRoots.map(toTestGlobPattern);

      const targetObj = info.innerTestObj ?? el;
      const targetProps = [...targetObj.properties];
      const existingIncludes = extractStringArrayProp(targetObj, 'include', sf);
      const missing = expectedPatterns.filter(
        (p) => !existingIncludes.some((inc) => inc === p || isPathUnderRoot(inc, p))
      );

      if (missing.length > 0) {
        const merged = Array.from(new Set([...existingIncludes, ...missing]));
        const updatedTargetProps = updateObjectProperty(
          targetProps,
          'include',
          valueToAstExpression(merged),
          sf
        );

        if (info.innerTestObj) {
          const updatedOuterProps = updateObjectProperty(
            el.properties,
            'test',
            ts.factory.createObjectLiteralExpression(updatedTargetProps, true),
            sf
          );
          updatedElements[i] = ts.factory.createObjectLiteralExpression(updatedOuterProps, true);
        } else {
          updatedElements[i] = ts.factory.createObjectLiteralExpression(updatedTargetProps, true);
        }
        modified = true;
      }
    }
  }

  // Add any configured projects that don't exist yet in AST
  for (const [projName, roots] of Object.entries(testProjectsConfig)) {
    if (!handledProjects.has(projName)) {
      const patterns = roots.map(toTestGlobPattern);
      const newProj = ts.factory.createObjectLiteralExpression(
        [
          ts.factory.createPropertyAssignment(
            'test',
            ts.factory.createObjectLiteralExpression(
              [
                ts.factory.createPropertyAssignment(
                  'name',
                  ts.factory.createStringLiteral(projName, true)
                ),
                ts.factory.createPropertyAssignment('include', valueToAstExpression(patterns))
              ],
              true
            )
          )
        ],
        true
      );
      updatedElements.push(newProj);
      modified = true;
    }
  }

  if (modified || !projectsProp) {
    const nextProps = updateObjectProperty(
      props,
      'projects',
      ts.factory.createArrayLiteralExpression(updatedElements, true),
      sf
    );
    return { props: nextProps, modified: true };
  }

  return { props, modified: false };
}

function syncTestSectionAst(
  testObj: ts.ObjectLiteralExpression,
  auditConfig: AuditConfig,
  sf: ts.SourceFile,
  projectRoot?: string
): { obj: ts.ObjectLiteralExpression; modified: boolean } {
  const dedup = deduplicateObjectProperties(testObj.properties, sf);
  let props = dedup.props;
  let modified = dedup.modified;

  const testProjectsConfig = auditConfig.vitePlusConfig?.test?.projects;
  const hasConfiguredProjects = Boolean(
    testProjectsConfig && Object.keys(testProjectsConfig).length > 0
  );

  const projectsProp = findPropInList(props, 'projects', sf);
  const hasExistingProjects = Boolean(
    projectsProp && ts.isArrayLiteralExpression(projectsProp.initializer)
  );

  if (hasConfiguredProjects || hasExistingProjects) {
    // 1. Anti-contamination: purge root include if projects exist
    const rmRes = removeObjectProperty(props, 'include', sf);
    props = rmRes.props;
    if (rmRes.modified) modified = true;

    // 2. Synchronize projects if configured in audit.config.ts
    if (hasConfiguredProjects && testProjectsConfig) {
      const projRes = syncTestProjectsAst(props, testProjectsConfig, sf);
      props = projRes.props;
      if (projRes.modified) modified = true;
    }
  } else {
    // Flat test configuration
    const includeRes = syncTestIncludeAst(props, auditConfig, sf);
    props = includeRes.props;
    if (includeRes.modified) modified = true;
  }

  const covRes = syncTestCoverageAst(props, auditConfig, sf, projectRoot);
  props = covRes.props;
  if (covRes.modified) modified = true;

  return {
    obj: modified ? ts.factory.createObjectLiteralExpression(props, true) : testObj,
    modified
  };
}

function syncPackSectionOnRoot(
  rootProps: ts.ObjectLiteralElementLike[],
  sf: ts.SourceFile
): { props: ts.ObjectLiteralElementLike[]; modified: boolean } {
  const tempRoot = ts.factory.createObjectLiteralExpression(rootProps, true);
  const packProp = findPropertyAssignment(tempRoot, 'pack', sf);
  if (!packProp || !ts.isObjectLiteralExpression(packProp.initializer)) {
    return {
      props: [ts.factory.createPropertyAssignment('pack', buildPackAstObject()), ...rootProps],
      modified: true
    };
  }
  const packVal = astExpressionToValue(packProp.initializer, sf) as Record<string, unknown>;
  let packSubProps = [...packProp.initializer.properties];
  let packModified = false;
  if (packVal.publint !== true) {
    packSubProps = updateObjectProperty(packSubProps, 'publint', ts.factory.createTrue(), sf);
    packModified = true;
  }
  if (typeof packVal.attw !== 'object' || packVal.attw === null) {
    packSubProps = updateObjectProperty(
      packSubProps,
      'attw',
      valueToAstExpression({ profile: 'esm-only' }),
      sf
    );
    packModified = true;
  }
  if (!packModified) {
    return { props: rootProps, modified: false };
  }
  return {
    props: updateObjectProperty(
      rootProps,
      'pack',
      ts.factory.createObjectLiteralExpression(packSubProps, true),
      sf
    ),
    modified: true
  };
}

export function printTransformedSourceFile(
  sf: ts.SourceFile,
  transformer: ts.TransformerFactory<ts.SourceFile>
): string {
  const result = ts.transform(sf, [transformer]);
  const transformedSf = result.transformed[0]!;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printFile(transformedSf);
  result.dispose();
  return printed;
}

export function synchronizeViteConfigAst(
  fileContent: string,
  auditConfig: AuditConfig,
  lintIgnores: readonly string[],
  fmtIgnores: readonly string[],
  legacyTestProp: ts.PropertyAssignment | null,
  projectRoot?: string
): { content: string; modified: boolean } {
  const sf = parseTsSourceFile(fileContent);
  const rootObj = findConfigRootObject(sf);
  if (!rootObj) {
    return { content: fileContent, modified: false };
  }

  const dedupRoot = deduplicateObjectProperties(rootObj.properties, sf);
  let rootProps = dedupRoot.props;
  let modified = dedupRoot.modified;

  const currentRootObj = (): ts.ObjectLiteralExpression =>
    ts.factory.createObjectLiteralExpression(rootProps, true);

  if (auditConfig.packageDistribution?.enabled === true) {
    const syncedPack = syncPackSectionOnRoot(rootProps, sf);
    rootProps = syncedPack.props;
    if (syncedPack.modified) modified = true;
  }

  const testProp = findPropertyAssignment(currentRootObj(), 'test', sf);
  if (!testProp || !ts.isObjectLiteralExpression(testProp.initializer)) {
    const newTestProp =
      legacyTestProp ??
      ts.factory.createPropertyAssignment('test', buildTestAstObject(auditConfig));
    rootProps = [...rootProps, newTestProp];
    modified = true;
  } else {
    const syncedTest = syncTestSectionAst(testProp.initializer, auditConfig, sf, projectRoot);
    if (syncedTest.modified) {
      rootProps = updateObjectProperty(rootProps, 'test', syncedTest.obj, sf);
      modified = true;
    }
  }

  const lintProp = findPropertyAssignment(currentRootObj(), 'lint', sf);
  if (!lintProp || !ts.isObjectLiteralExpression(lintProp.initializer)) {
    rootProps = [
      ...rootProps,
      ts.factory.createPropertyAssignment('lint', buildLintAstObject(auditConfig, lintIgnores))
    ];
    modified = true;
  } else {
    const syncedLint = syncLintSectionAst(lintProp.initializer, auditConfig, lintIgnores, sf);
    if (syncedLint.modified) {
      rootProps = updateObjectProperty(rootProps, 'lint', syncedLint.obj, sf);
      modified = true;
    }
  }

  const fmtProp = findPropertyAssignment(currentRootObj(), 'fmt', sf);
  if (!fmtProp || !ts.isObjectLiteralExpression(fmtProp.initializer)) {
    rootProps = [
      ...rootProps,
      ts.factory.createPropertyAssignment('fmt', buildFmtAstObject(auditConfig, fmtIgnores))
    ];
    modified = true;
  } else {
    const syncedFmt = syncFmtSectionAst(fmtProp.initializer, auditConfig, fmtIgnores, sf);
    if (syncedFmt.modified) {
      rootProps = updateObjectProperty(rootProps, 'fmt', syncedFmt.obj, sf);
      modified = true;
    }
  }

  const stagedProp = findPropertyAssignment(currentRootObj(), 'staged', sf);
  if (!stagedProp || !ts.isObjectLiteralExpression(stagedProp.initializer)) {
    rootProps = [
      ...rootProps,
      ts.factory.createPropertyAssignment('staged', buildStagedAstObject(auditConfig))
    ];
    modified = true;
  }

  if (
    sf.statements.some(
      (stmt) =>
        ts.isImportDeclaration(stmt) &&
        ts.isStringLiteral(stmt.moduleSpecifier) &&
        stmt.moduleSpecifier.text === 'vite'
    )
  ) {
    modified = true;
  }

  if (!modified) {
    return { content: fileContent, modified: false };
  }

  const updatedRootObj = ts.factory.createObjectLiteralExpression(rootProps, true);
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node): ts.Node => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === 'vite'
      ) {
        return ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          ts.factory.createStringLiteral('vite-plus', true),
          node.attributes
        );
      }
      if (node === rootObj) {
        return updatedRootObj;
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (source) => ts.visitNode(source, visit) as ts.SourceFile;
  };

  return { content: printTransformedSourceFile(sf, transformer), modified: true };
}

/**
 * Rewrites import/export module specifiers from 'vitest' -> 'vite-plus/test' and 'vite' -> 'vite-plus'
 * strictly via TypeScript Compiler AST spans (never touching string literals inside code or comments).
 */
export function rewriteModuleSpecifiersToVitePlusAst(content: string, fileName: string): string {
  const sf = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const replacements: { start: number; end: number; text: string }[] = [];

  function checkLiteral(lit: ts.StringLiteral): void {
    if (lit.text === 'vitest') {
      replacements.push({
        start: lit.getStart(sf),
        end: lit.getEnd(),
        text: "'vite-plus/test'"
      });
    } else if (lit.text === 'vite') {
      replacements.push({
        start: lit.getStart(sf),
        end: lit.getEnd(),
        text: "'vite-plus'"
      });
    }
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkLiteral(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      checkLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  if (replacements.length === 0) {
    return content;
  }

  replacements.sort((a, b) => b.start - a.start);
  let updated = content;
  for (const r of replacements) {
    updated = updated.slice(0, r.start) + r.text + updated.slice(r.end);
  }
  return updated;
}

export interface InlineVitePluginsDetection {
  readonly hasPlugins: boolean;
  readonly isAlreadyModular: boolean;
  readonly hasInlinePlugins: boolean;
  readonly pluginsProperty?: ts.ObjectLiteralElementLike;
}

export interface ExtractVitePluginsResult {
  readonly hasPlugins: boolean;
  readonly isAlreadyModular: boolean;
  readonly viteConfigContent: string;
  readonly vitePluginsContent: string | null;
  readonly modified: boolean;
}

function countIdentifierOccurrences(id: string, node: ts.Node): number {
  let count = 0;
  function visit(n: ts.Node): void {
    if (ts.isIdentifier(n) && n.text === id) {
      count++;
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return count;
}

function collectIdentifiersInNode(node: ts.Node): Set<string> {
  const ids = new Set<string>();
  function visit(n: ts.Node): void {
    if (ts.isIdentifier(n)) {
      ids.add(n.text);
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return ids;
}

function findVariableStatementForName(
  rootNode: ts.Node,
  varName: string
): ts.VariableStatement | null {
  let found: ts.VariableStatement | null = null;
  function walk(node: ts.Node): void {
    if (found) return;
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (decl) => ts.isIdentifier(decl.name) && decl.name.text === varName
      )
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, walk);
  }
  walk(rootNode);
  return found;
}

function isPluginsPushCall(expr: ts.Expression, varName: string): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  return (
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === varName &&
    callee.name.text === 'push'
  );
}

function hasPluginsPushInNode(root: ts.Node, varName: string): boolean {
  let found = false;
  function walk(node: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(node) && isPluginsPushCall(node, varName)) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  }
  walk(root);
  return found;
}

function collectPluginsPushArguments(root: ts.Node, varName: string, sf: ts.SourceFile): string[] {
  const args: string[] = [];
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node) && isPluginsPushCall(node, varName)) {
      for (const arg of node.arguments) {
        args.push(arg.getText(sf));
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(root);
  return args;
}

function shouldRemovePluginStatement(
  stmt: ts.Statement,
  varStmtToRemove: ts.Statement | null,
  varName: string | null
): boolean {
  if (varStmtToRemove && stmt === varStmtToRemove) return true;
  if (!varName) return false;
  if (ts.isExpressionStatement(stmt) && isPluginsPushCall(stmt.expression, varName)) {
    return true;
  }
  if (ts.isIfStatement(stmt)) {
    if (
      ts.isExpressionStatement(stmt.thenStatement) &&
      isPluginsPushCall(stmt.thenStatement.expression, varName)
    ) {
      return !stmt.elseStatement;
    }
    if (ts.isBlock(stmt.thenStatement)) {
      const blockStmts = stmt.thenStatement.statements;
      if (
        blockStmts.length > 0 &&
        blockStmts.every(
          (s) => ts.isExpressionStatement(s) && isPluginsPushCall(s.expression, varName)
        )
      ) {
        return !stmt.elseStatement;
      }
    }
  }
  return false;
}

function isPluginOptionUsedElsewhere(
  sf: ts.SourceFile,
  varStmtToRemove: ts.Statement | null
): boolean {
  let count = 0;
  function walk(node: ts.Node): void {
    if (varStmtToRemove && node === varStmtToRemove) return;
    if (ts.isImportSpecifier(node) && node.name.text === 'PluginOption') return;
    if (ts.isIdentifier(node) && node.text === 'PluginOption') {
      count++;
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return count > 0;
}

function combinePluginsExpressions(
  baseExprText: string,
  pushedPluginTexts: readonly string[]
): string {
  if (pushedPluginTexts.length === 0) return baseExprText;
  const trimmed = baseExprText.trim();
  if (trimmed === '[]') {
    return `[\n  ${pushedPluginTexts.join(',\n  ')}\n]`;
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return `[\n  ${pushedPluginTexts.join(',\n  ')}\n]`;
    }
    return `[\n  ${inner},\n  ${pushedPluginTexts.join(',\n  ')}\n]`;
  }
  return `[\n  ...${trimmed},\n  ${pushedPluginTexts.join(',\n  ')}\n]`;
}

function hasVitePluginsImportDeclaration(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      (stmt.moduleSpecifier.text === './vite.plugins.ts' ||
        stmt.moduleSpecifier.text === './vite.plugins')
  );
}

/**
 * Detects whether vite.config.ts contains inline Vite plugins vs modular vite.plugins.ts.
 */
export function detectInlineVitePlugins(sf: ts.SourceFile): InlineVitePluginsDetection {
  const hasVitePluginsImport = hasVitePluginsImportDeclaration(sf);

  const rootObj = findConfigRootObject(sf);
  if (!rootObj) {
    return { hasPlugins: false, isAlreadyModular: false, hasInlinePlugins: false };
  }

  let pluginsProperty: ts.ObjectLiteralElementLike | undefined;
  for (const p of rootObj.properties) {
    if (
      (ts.isPropertyAssignment(p) && getPropertyKeyName(p.name, sf) === 'plugins') ||
      (ts.isShorthandPropertyAssignment(p) && p.name.text === 'plugins')
    ) {
      pluginsProperty = p;
      break;
    }
  }

  if (!pluginsProperty) {
    return { hasPlugins: false, isAlreadyModular: false, hasInlinePlugins: false };
  }

  const localPluginsVar = findVariableStatementForName(sf, 'plugins');
  const hasPluginsPush = hasPluginsPushInNode(sf, 'plugins');

  if (hasVitePluginsImport) {
    const isShorthand = ts.isShorthandPropertyAssignment(pluginsProperty);
    const isIdentifierMatch =
      ts.isPropertyAssignment(pluginsProperty) &&
      ts.isIdentifier(pluginsProperty.initializer) &&
      pluginsProperty.initializer.text === 'plugins';

    if ((isShorthand || isIdentifierMatch) && !localPluginsVar && !hasPluginsPush) {
      return {
        hasPlugins: true,
        isAlreadyModular: true,
        hasInlinePlugins: false,
        pluginsProperty
      };
    }
    return {
      hasPlugins: true,
      isAlreadyModular: false,
      hasInlinePlugins: true,
      pluginsProperty
    };
  }

  if (
    ts.isPropertyAssignment(pluginsProperty) &&
    ts.isArrayLiteralExpression(pluginsProperty.initializer)
  ) {
    const elements = pluginsProperty.initializer.elements;
    if (
      elements.length > 0 &&
      elements.every((el) => el.getText(sf).includes('vitePrecompressPlugin'))
    ) {
      return {
        hasPlugins: true,
        isAlreadyModular: true,
        hasInlinePlugins: false,
        pluginsProperty
      };
    }
    return {
      hasPlugins: true,
      isAlreadyModular: false,
      hasInlinePlugins: true,
      pluginsProperty
    };
  }

  return {
    hasPlugins: true,
    isAlreadyModular: false,
    hasInlinePlugins: Boolean(localPluginsVar || hasPluginsPush),
    pluginsProperty
  };
}

function extractImportedNames(importClause?: ts.ImportClause): string[] {
  if (!importClause) return [];
  const names: string[] = [];
  if (importClause.name) {
    names.push(importClause.name.text);
  }
  const bindings = importClause.namedBindings;
  if (!bindings) return names;

  if (ts.isNamedImports(bindings)) {
    for (const el of bindings.elements) {
      names.push(el.name.text);
    }
  } else if (ts.isNamespaceImport(bindings)) {
    names.push(bindings.name.text);
  }
  return names;
}

function resolvePluginsExpressionAndVariable(
  sf: ts.SourceFile,
  pluginProp: ts.ObjectLiteralElementLike
): {
  pluginsExprText: string;
  varStmtToRemove: ts.Statement | null;
  pushedPluginTexts: string[];
  pluginVarName: string | null;
} {
  let pluginsExprText = '[]';
  let varName: string | null = null;

  if (ts.isShorthandPropertyAssignment(pluginProp)) {
    varName = pluginProp.name.text;
  } else if (ts.isPropertyAssignment(pluginProp)) {
    const init = pluginProp.initializer;
    if (ts.isArrayLiteralExpression(init)) {
      pluginsExprText = init.getText(sf);
    } else if (ts.isIdentifier(init)) {
      varName = init.text;
    } else if (
      (ts.isAsExpression(init) || ts.isTypeAssertionExpression(init)) &&
      ts.isIdentifier(init.expression)
    ) {
      varName = init.expression.text;
    } else {
      pluginsExprText = init.getText(sf);
    }
  }

  const effectiveVarName = varName ?? 'plugins';
  const foundStmt = findVariableStatementForName(sf, effectiveVarName);
  let varStmtToRemove: ts.Statement | null = null;

  if (foundStmt && ts.isVariableStatement(foundStmt)) {
    const decl = foundStmt.declarationList.declarations.find(
      (d) => ts.isIdentifier(d.name) && d.name.text === effectiveVarName
    );
    if (decl?.initializer) {
      pluginsExprText = decl.initializer.getText(sf);
    }
    varStmtToRemove = foundStmt;
  }

  const pushedPluginTexts = collectPluginsPushArguments(sf, effectiveVarName, sf);
  const combinedPluginsExprText = combinePluginsExpressions(pluginsExprText, pushedPluginTexts);

  return {
    pluginsExprText: combinedPluginsExprText,
    varStmtToRemove,
    pushedPluginTexts,
    pluginVarName: effectiveVarName
  };
}

function isPluginModuleSpecifier(modSpec: string): boolean {
  return (
    modSpec.startsWith('@vitejs/plugin-') ||
    modSpec.startsWith('vite-plugin-') ||
    modSpec.startsWith('rollup-plugin-') ||
    modSpec === '@tailwindcss/vite' ||
    modSpec.includes('vite-plugin')
  );
}

function countIdentifierOccurrencesInRemovableStatements(
  name: string,
  sf: ts.SourceFile,
  varStmtToRemove: ts.Statement | null,
  pluginVarName: string | null
): number {
  let count = 0;
  function walk(node: ts.Node): void {
    if (ts.isStatement(node) && shouldRemovePluginStatement(node, varStmtToRemove, pluginVarName)) {
      count += countIdentifierOccurrences(name, node);
      return;
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return count;
}

function isImportUsedElsewhere(
  names: readonly string[],
  sf: ts.SourceFile,
  stmt: ts.ImportDeclaration,
  varStmtToRemove: ts.Statement | null,
  pluginProp: ts.ObjectLiteralElementLike,
  pluginVarName: string | null
): boolean {
  for (const name of names) {
    const total = countIdentifierOccurrences(name, sf);
    const inImport = countIdentifierOccurrences(name, stmt);
    const inRemovable = countIdentifierOccurrencesInRemovableStatements(
      name,
      sf,
      varStmtToRemove,
      pluginVarName
    );
    const inProp =
      ts.isPropertyAssignment(pluginProp) && !varStmtToRemove
        ? countIdentifierOccurrences(name, pluginProp.initializer)
        : 0;

    if (total > inImport + inRemovable + inProp) {
      return true;
    }
  }
  return false;
}

function categorizePluginImports(
  sf: ts.SourceFile,
  pluginIds: Set<string>,
  varStmtToRemove: ts.Statement | null,
  pluginProp: ts.ObjectLiteralElementLike,
  pluginVarName: string | null
): { movedImportStmts: Set<ts.ImportDeclaration>; pluginImportsForNewFile: string[] } {
  const movedImportStmts = new Set<ts.ImportDeclaration>();
  const pluginImportsForNewFile: string[] = [];

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;

    const importedNames = extractImportedNames(stmt.importClause);
    const modSpec =
      stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
        ? stmt.moduleSpecifier.text
        : '';

    // Never move or copy root vite/vite-plus imports; vite.plugins.ts generates its own PluginOption import
    if (modSpec === 'vite' || modSpec === 'vite-plus') continue;

    const isPluginPackage = isPluginModuleSpecifier(modSpec);
    const matchesPluginId = importedNames.some((n) => pluginIds.has(n));

    if (!isPluginPackage && !matchesPluginId) continue;

    const usedElsewhere = isImportUsedElsewhere(
      importedNames,
      sf,
      stmt,
      varStmtToRemove,
      pluginProp,
      pluginVarName
    );
    if (!usedElsewhere) {
      movedImportStmts.add(stmt);
    }
    pluginImportsForNewFile.push(stmt.getText(sf));
  }

  return { movedImportStmts, pluginImportsForNewFile };
}

/**
 * Extracts inline Vite plugins from vite.config.ts into a modular vite.plugins.ts file.
 * Returns the transformed vite.config.ts and the generated vite.plugins.ts content.
 */
export function extractVitePluginsToModule(
  viteConfigContent: string,
  projectRoot?: string
): ExtractVitePluginsResult {
  const sf = parseTsSourceFile(viteConfigContent, 'vite.config.ts');
  const detection = detectInlineVitePlugins(sf);

  if (!detection.hasPlugins) {
    return {
      hasPlugins: false,
      isAlreadyModular: false,
      viteConfigContent,
      vitePluginsContent: null,
      modified: false
    };
  }

  const rootObj = findConfigRootObject(sf);
  if (!rootObj || !detection.pluginsProperty) {
    return {
      hasPlugins: false,
      isAlreadyModular: false,
      viteConfigContent,
      vitePluginsContent: null,
      modified: false
    };
  }

  if (detection.isAlreadyModular && !detection.hasInlinePlugins) {
    return {
      hasPlugins: true,
      isAlreadyModular: true,
      viteConfigContent,
      vitePluginsContent: null,
      modified: false
    };
  }

  const pluginsFileExists = projectRoot
    ? fs.existsSync(path.resolve(projectRoot, 'vite.plugins.ts'))
    : false;

  const pluginProp = detection.pluginsProperty;
  const { pluginsExprText, varStmtToRemove, pushedPluginTexts, pluginVarName } =
    resolvePluginsExpressionAndVariable(sf, pluginProp);

  // Collect identifiers referenced inside the plugins expression or variable statement or pushed plugins
  const pluginIds = new Set<string>();
  if (varStmtToRemove) {
    for (const id of collectIdentifiersInNode(varStmtToRemove)) pluginIds.add(id);
  }
  if (ts.isPropertyAssignment(pluginProp)) {
    for (const id of collectIdentifiersInNode(pluginProp.initializer)) pluginIds.add(id);
  }
  for (const pushedText of pushedPluginTexts) {
    const tempSf = parseTsSourceFile(pushedText, 'temp.ts');
    for (const id of collectIdentifiersInNode(tempSf)) pluginIds.add(id);
  }

  // Identify plugin imports to move or copy
  const { movedImportStmts, pluginImportsForNewFile } = categorizePluginImports(
    sf,
    pluginIds,
    varStmtToRemove,
    pluginProp,
    pluginVarName
  );

  let generatedPluginsContent: string | null = null;
  if (!pluginsFileExists) {
    const importLines =
      pluginImportsForNewFile.length > 0 ? pluginImportsForNewFile.join('\n') + '\n\n' : '\n';
    generatedPluginsContent = `import type { PluginOption } from 'vite-plus';\n${importLines}export const plugins: PluginOption[] = ${pluginsExprText};\n`;
  }

  // Construct updated vite.config.ts
  const hasVitePluginsImportAlready = hasVitePluginsImportDeclaration(sf);

  const newImportDecl = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('plugins'))
      ])
    ),
    ts.factory.createStringLiteral('./vite.plugins.ts', true)
  );

  const updatedProperties = rootObj.properties.map((p) => {
    if (p === pluginProp) {
      return ts.factory.createShorthandPropertyAssignment(ts.factory.createIdentifier('plugins'));
    }
    return p;
  });

  const updatedRootObj = ts.factory.createObjectLiteralExpression(updatedProperties, true);
  const shouldPrunePluginOption = !isPluginOptionUsedElsewhere(sf, varStmtToRemove);

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    return (source) => {
      const newStatements: ts.Statement[] = [];
      let importInjected = hasVitePluginsImportAlready;
      let lastImportIdx = -1;

      for (let i = 0; i < source.statements.length; i++) {
        if (ts.isImportDeclaration(source.statements[i]!)) {
          lastImportIdx = i;
        }
      }

      function visitSubtree(node: ts.Node): ts.Node | undefined {
        if (
          ts.isStatement(node) &&
          shouldRemovePluginStatement(node, varStmtToRemove, pluginVarName)
        ) {
          return undefined;
        }
        if (node === rootObj) {
          return updatedRootObj;
        }
        if (ts.isBlock(node)) {
          const remainingStmts: ts.Statement[] = [];
          for (const childStmt of node.statements) {
            if (shouldRemovePluginStatement(childStmt, varStmtToRemove, pluginVarName)) {
              continue;
            }
            const visited = visitSubtree(childStmt);
            if (visited && ts.isStatement(visited)) {
              remainingStmts.push(visited);
            }
          }
          return ts.factory.updateBlock(node, remainingStmts);
        }
        return ts.visitEachChild(node, visitSubtree, context);
      }

      for (let i = 0; i < source.statements.length; i++) {
        let stmt = source.statements[i]!;

        if (movedImportStmts.has(stmt as ts.ImportDeclaration)) {
          continue;
        }
        if (shouldRemovePluginStatement(stmt, varStmtToRemove, pluginVarName)) {
          continue;
        }

        // Prune unused type PluginOption from vite-plus / vite import if present
        if (
          shouldPrunePluginOption &&
          ts.isImportDeclaration(stmt) &&
          ts.isStringLiteral(stmt.moduleSpecifier) &&
          (stmt.moduleSpecifier.text === 'vite-plus' || stmt.moduleSpecifier.text === 'vite') &&
          stmt.importClause?.namedBindings &&
          ts.isNamedImports(stmt.importClause.namedBindings)
        ) {
          const remainingSpecifiers = stmt.importClause.namedBindings.elements.filter(
            (spec) => spec.name.text !== 'PluginOption'
          );
          if (remainingSpecifiers.length !== stmt.importClause.namedBindings.elements.length) {
            if (remainingSpecifiers.length > 0) {
              stmt = ts.factory.updateImportDeclaration(
                stmt,
                stmt.modifiers,
                ts.factory.updateImportClause(
                  stmt.importClause,
                  stmt.importClause.isTypeOnly,
                  stmt.importClause.name,
                  ts.factory.updateNamedImports(
                    stmt.importClause.namedBindings,
                    remainingSpecifiers
                  )
                ),
                stmt.moduleSpecifier,
                stmt.attributes
              );
            }
          }
        }

        const visitedStmt = visitSubtree(stmt);
        if (visitedStmt && ts.isStatement(visitedStmt)) {
          newStatements.push(visitedStmt);
        }

        if (i === lastImportIdx && !importInjected) {
          newStatements.push(newImportDecl);
          importInjected = true;
        }
      }

      if (!importInjected) {
        newStatements.unshift(newImportDecl);
      }

      return ts.factory.updateSourceFile(source, newStatements);
    };
  };

  const updatedConfigContent = printTransformedSourceFile(sf, transformer);

  return {
    hasPlugins: true,
    isAlreadyModular: true,
    viteConfigContent: updatedConfigContent,
    vitePluginsContent: generatedPluginsContent,
    modified: true
  };
}
