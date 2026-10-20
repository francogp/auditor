/**
 * src/suites/architecture/validate_magic_numbers.ts
 *
 * UNIFIED TYPESCRIPT AST MAGIC NUMBERS AUDITOR (Node.js 26+ Native)
 *
 * Enforces zero naked magic numbers in business logic by leveraging the TypeScript Compiler AST:
 *   - Allows legitimate constants declared anywhere:
 *     * Top-level const: const TIMEOUT = 5000
 *     * as const expressions: const X = [10, 20] as const
 *     * Arrays & Matrices: const MATRIX = [[1, 2], [3, 4]]
 *     * Dictionaries: const DICT = { A: 1, B: 2 }
 *     * Formulas: const TIME = 1000 * 60 * 5
 *     * Enums: enum Status { OK = 200 }
 *     * Types & Interfaces: type Port = 8080; interface C { port: 8080 }
 *     * Class readonly fields: static readonly MAX = 100
 *   - Universal exemptions:
 *     * Universal sentinels: -1, 0, 1, 2, 10, 100, 1000, 1024
 *     * Octal, Hex & Binary bitmasks / permissions: 0o755, 0xFF, 0b1010
 *     * Array/Tuple element indexing (ignoreArrayIndexes): arr[0], match[2], lines[i - 2]
 *     * Default parameter values (ignoreDefaultValues): function foo(limit = 5)
 *     * Precision arguments: .toFixed(0), .toFixed(1), .toFixed(2)
 *     * CLI and slice boundaries: .slice(2)
 *     * Radix arguments: parseInt(x, 10), (num).toString(16)
 *     * JSON formatting indentation: JSON.stringify(obj, null, 2)
 *   - Escape hatch: '// const-ok: <justification>'
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_magic_numbers.ts
 */

import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import {
  FileScanAuditor,
  createUniformRemediationPhases,
  type AuditedDocument,
  createRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions
} from '../../core/auditorBase.ts';
import { getAuditConfig, isInCodeRoots, isDataPath } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/safePath.ts';

enableCompileCache();

export const MAGIC_NUMBERS_RULES = ['magic-number-naked'] as const;
export type MagicNumbersRuleId = (typeof MAGIC_NUMBERS_RULES)[number];

const UNIVERSAL_SENTINELS = new Set<number>([
  -1, 0, 0.5, 1, 2, 3, 4, 5, 10, 24, 60, 100, 360, 1000, 1024
]);

const STANDARD_RADIX = new Set<number>([2, 8, 10, 16, 32, 36]);

function isDeclaredConstant(node: ts.Node): boolean {
  let curr: ts.Node | undefined = node.parent;
  while (curr) {
    if (ts.isVariableDeclaration(curr)) {
      const declList = curr.parent;
      if (ts.isVariableDeclarationList(declList) && declList.flags & ts.NodeFlags.Const) {
        return true;
      }
    }
    if (ts.isPropertyDeclaration(curr)) {
      const isReadonly = curr.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
      if (isReadonly) return true;
    }
    if (ts.isEnumMember(curr) || ts.isEnumDeclaration(curr)) {
      return true;
    }
    if (
      ts.isTypeAliasDeclaration(curr) ||
      ts.isTypeNode(curr) ||
      ts.isInterfaceDeclaration(curr) ||
      ts.isPropertySignature(curr)
    ) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function isRadixArg(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  if (p.arguments.length >= 2 && p.arguments[1] === node) {
    const callee = p.expression.getText();
    if (callee === 'parseInt' || callee === 'Number.parseInt') return true;
  }
  if (p.arguments.length === 1 && p.arguments[0] === node) {
    if (ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'toString')
      return true;
  }
  return false;
}

function isJsonIndentation(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  if (p.arguments.length >= 3 && p.arguments[2] === node) {
    const callee = p.expression.getText();
    if (callee === 'JSON.stringify') return true;
  }
  return false;
}

function isArrayIndex(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (p.parent && ts.isElementAccessExpression(p.parent) && p.parent.argumentExpression === p)
    return true;
  return false;
}

function isDefaultParameterValue(node: ts.Node): boolean {
  let curr: ts.Node | undefined = node;
  while (curr && curr.parent) {
    if (ts.isParameter(curr.parent) && curr.parent.initializer === curr) {
      return true;
    }
    if (
      ts.isFunctionDeclaration(curr) ||
      ts.isFunctionExpression(curr) ||
      ts.isArrowFunction(curr) ||
      ts.isMethodDeclaration(curr)
    ) {
      break;
    }
    curr = curr.parent;
  }
  return false;
}

function isPrecisionOrSliceArg(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  if (ts.isPropertyAccessExpression(p.expression)) {
    const methodName = p.expression.name.text;
    if (methodName === 'toFixed' || methodName === 'toPrecision' || methodName === 'slice') {
      return true;
    }
  }
  return false;
}

function isObjectPropertyKey(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  return false;
}

function isTimerDelayArg(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  let calleeText = '';
  if (ts.isIdentifier(p.expression)) {
    calleeText = p.expression.text;
  } else if (ts.isPropertyAccessExpression(p.expression)) {
    calleeText = p.expression.name.text;
  }
  if (calleeText === 'setTimeout' || calleeText === 'setInterval') {
    return p.arguments.length >= 2 && p.arguments[1] === node;
  }
  if (calleeText === 'delayedCall') {
    return p.arguments.length >= 1 && p.arguments[0] === node;
  }
  return false;
}

function isExplicitBaseLiteral(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  const rawText = node.getText(sourceFile);
  return (
    rawText.startsWith('0o') ||
    rawText.startsWith('0O') ||
    rawText.startsWith('0x') ||
    rawText.startsWith('0X') ||
    rawText.startsWith('0b') ||
    rawText.startsWith('0B')
  );
}

export function resolveSignedNumericLiteral(node: ts.NumericLiteral): { val: number; reportedNode: ts.Node } {
  let val = parseFloat(node.text);
  let reportedNode: ts.Node = node;

  if (
    node.parent &&
    ts.isPrefixUnaryExpression(node.parent) &&
    (node.parent.operator === ts.SyntaxKind.MinusToken ||
      node.parent.operator === ts.SyntaxKind.PlusToken)
  ) {
    if (node.parent.operator === ts.SyntaxKind.MinusToken) {
      val = -val;
    }
    reportedNode = node.parent;
  }

  return { val, reportedNode };
}

const ANIMATION_PROPERTIES = new Set([
  'duration',
  'delay',
  'opacity',
  'autoAlpha',
  'scale',
  'scaleX',
  'scaleY',
  'rotation',
  'rotate',
  'skewX',
  'skewY',
  'stagger',
  'repeat',
  'repeatDelay',
  'feetX',
  'feetY'
]);

function isAnimationPropertyArg(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isPropertyAssignment(p)) return false;
  if (p.initializer !== node) return false;
  if (ts.isIdentifier(p.name) && ANIMATION_PROPERTIES.has(p.name.text)) {
    return true;
  }
  return false;
}

export type ValidateMagicNumbersOptions = FileScanRootsOptions;

export class ValidateMagicNumbersAuditor extends FileScanAuditor<MagicNumbersRuleId> {
  constructor(options: ValidateMagicNumbersOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths.codeRoots ?? []
    );
    const config = getAuditConfig(effectiveRoot);
    const effectiveRoots = targetRoots.map((r) => toPosixRelative(effectiveRoot, r));

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(MAGIC_NUMBERS_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_magic_numbers',
      name: 'Magic Numbers Validator',
      description: 'Gobernanza de números mágicos desnudos en lógica',
      family: 'architecture',
      packageName: 'MagicNumbers',
      configKey: 'constants',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🔢',
      roots: effectiveRoots,
      extraIgnorePatterns: [...(config.constants?.ignoreGlobs ?? [])],
      exemptPaths: [
        ...(config.constants?.exemptPaths ?? []),
        ...(config.constants?.exemptFiles ?? [])
      ],
      allowedExtensions: new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']),
      requiresAst: true,
      ruleIds: MAGIC_NUMBERS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(MAGIC_NUMBERS_RULES, 'hygiene'),
      ruleDescriptions: {
        'magic-number-naked': 'Número mágico no en constante'
      },
      ruleRemediations: {
        'magic-number-naked':
          'Causa Raíz:\n' +
          'Se detectó un número literal desnudo ("naked magic number") embebido directamente en la lógica, ' +
          'cálculo o condición de control sin estar asignado a una constante descriptiva con nombre semántico. ' +
          'Los números mágicos oscurecen el significado del código, impiden la reutilización y generan riesgos ' +
          'de inconsistencia durante evoluciones del modelo.\n\n' +
          'Diagnóstico:\n' +
          '1. Ejecuta "npm run auditor:findings -- rule=magic-number-naked flat" para listar los archivos, líneas y valores infractores.\n' +
          '2. Ejecuta "npm run auditor:magic inspect <archivo>" para obtener la inspección Dirac compacta y el plan de refactorización sugerido.\n\n' +
          'Solución Canónica:\n' +
          '1. Declaración Local: Si el número es específico del módulo o script, declara una constante en el encabezado del archivo ' +
          '(ej. "const MAX_RETRY_COUNT = 3;" o "const HTTP_STATUS_OK = 200;").\n' +
          '2. Constantes de Dominio Compartidas: Si el valor representa un token de diseño o regla de negocio transversal ' +
          '(ej. multiplicadores de RPG, límites de rate-limit), decláralo en "src/constants/" o el módulo de dominio respectivo.\n' +
          '3. Sentinels Universales Exentos: Recuerda que los valores -1, 0, 0.5, 1, 2, 3, 4, 5, 10, 24, 60, 100, 360, 1000, 1024, ' +
          'así como índices de array ("arr[0]"), argumentos de precisión (".toFixed(2)"), límites de slice (".slice(2)") y radix ("parseInt(x, 10)") ' +
          'están exentos universalmente y no disparan alertas.\n' +
          '4. Escape Hatch Justificado: Si el número es inherente a un cálculo matemático puntual o un fixture de testing y no amerita constante, ' +
          'agrega el comentario "// const-ok: <justificación técnica>" en la misma línea o inmediatamente encima.\n' +
          '5. Configuración de Proyecto en .auditor/audit.config.ts: Si el repositorio utiliza códigos de estado, multiplicadores o constantes ' +
          'globales de dominio, se pueden registrar en "constants.exemptMagicNumbers" previa consulta con el programador.\n' +
          '6. Refactorización Determinista Automática: Ejecuta "npm run auditor:magic inspect <archivo>", guarda el plan JSON sugerido ' +
          'y aplícalo de forma segura con "npm run auditor:magic apply <plan.json> --worktree".\n\n' +
          'Ejemplo / Herramientas Oficiales:\n' +
          '  Descubrimiento global: npm run auditor:magic discover\n' +
          '  Inspección y plan: npm run auditor:magic inspect <archivo>\n' +
          '  Aplicación segura: npm run auditor:magic apply <plan.json> --worktree\n' +
          '  Ayuda interactiva: npm run auditor:magic help'
      },
      projectRoot: effectiveRoot
    });
  }

  public override isPathScannable(relPath: string): boolean {
    if (!super.isPathScannable(relPath)) return false;
    if (relPath.endsWith('.d.ts')) return false;
    const config = getAuditConfig(this.projectRoot);
    if (isDataPath(relPath, config)) return false;
    return true;
  }

  private inspectAst(
    sourceFile: ts.SourceFile,
    relPath: string,
    rawFileContent: string,
    customExempt: ReadonlySet<number>
  ): void {
    const lines = rawFileContent.split('\n');

    const visit = (node: ts.Node): void => {
      if (ts.isNumericLiteral(node)) {
        const { val, reportedNode } = resolveSignedNumericLiteral(node);

        const isTimerDelay = isTimerDelayArg(reportedNode);
        const isAllowedSentinel = UNIVERSAL_SENTINELS.has(val) && !(isTimerDelay && val !== 0);

        if (
          !isAllowedSentinel &&
          !customExempt.has(val) &&
          !isExplicitBaseLiteral(node, sourceFile) &&
          !(STANDARD_RADIX.has(val) && isRadixArg(reportedNode)) &&
          !((val === 2 || val === 4) && isJsonIndentation(reportedNode)) &&
          !isArrayIndex(reportedNode) &&
          !isDefaultParameterValue(reportedNode) &&
          !isPrecisionOrSliceArg(reportedNode) &&
          !isObjectPropertyKey(reportedNode) &&
          !isAnimationPropertyArg(reportedNode) &&
          !isDeclaredConstant(reportedNode)
        ) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            reportedNode.getStart(sourceFile)
          );
          const actualLine = line + 1;
          const actualCol = character + 1;

          const lineText = lines[actualLine - 1] ?? '';
          if (!lineText.includes('// const-ok:')) {
            const message = isTimerDelay
              ? `Retardo de temporizador numérico desnudo: ${val}. Declara una constante explícita para este tiempo ('const RETRY_DELAY_MS = ${val}').`
              : `Número mágico no declarado: ${val}. Declara una constante explícita para este valor ('const NOMBRE = ${val}').`;

            this.addViolation({
              ruleId: 'magic-number-naked',
              severity: 'error',
              filePath: relPath,
              line: actualLine,
              column: actualCol,
              message,
              context: lineText.trim() || String(val)
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  protected override scanFile(
    relPath: string,
    content: string,
    sourceFile?: ts.SourceFile,
    doc?: AuditedDocument
  ): void {
    if (relPath.endsWith('.d.ts')) {
      return;
    }

    const config = getAuditConfig(this.projectRoot);
    if (!isInCodeRoots(relPath, config) || isDataPath(relPath)) {
      return;
    }

    const sf = sourceFile ?? doc?.getAst();
    if (!sf) return;

    const customExempt = new Set(config.constants?.exemptMagicNumbers ?? []);

    this.inspectAst(sf, relPath, content, customExempt);
  }
}

export { ValidateMagicNumbersAuditor as MagicNumbersAuditor };

// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateMagicNumbersAuditor());
