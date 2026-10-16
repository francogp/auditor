/**
 * src/analyzers/homebrew/detectors/thirdPartyToolContractDetector.ts
 *
 * Detects discrepancies between third-party tool execution and the constructor contract:
 * 1. If an auditor invokes external tool runners or binaries (executeNodeCli, resolvePackageBin,
 *    executeCliAndReadJson, executeFallowJsonCommand, resolveFallowBinary, stylelint.lint,
 *    spawnSync, execSync, execFileSync) but fails to declare `usesThirdPartyTool: true` with a valid
 *    `thirdPartyToolPolicy`.
 * 2. If an auditor declares `usesThirdPartyTool: true` but contains zero external tool invocations.
 */

import type {
  HomebrewDetector,
  HomebrewFinding,
  HomebrewInspectionContext
} from '../homebrewTypes.ts';

const THIRD_PARTY_TOOL_TRIGGER_PATTERNS: readonly RegExp[] = [
  /\bexecuteNodeCli\s*\(/,
  /\bresolvePackageBin\s*\(/,
  /\bexecuteCliAndReadJson\s*\(/,
  /\bexecuteCliToFile\s*\(/,
  /\bexecuteFallowJsonCommand\s*\(/,
  /\bresolveFallowBinary\s*\(/,
  /\bstylelint\.lint\s*\(/,
  /(?<!\.)\bhtmlvalidate\b(?!\.(?:json|js|cjs))\s*\(/,
  /\b(?:spawnSync|execSync|execFileSync)\s*\(\s*cmd\b/,
  /\b(?:spawnSync|execSync|execFileSync)\s*\(\s*['"`]?(?:fallow|eslint|stylelint|markdownlint|vue-tsc|type-coverage|knip|secretlint)\b/,
  /\b(?:spawnSync|execSync|execFileSync)\s*\([^)]*fallowBin\b/,
  /\b(?:childProcess\.)?(?:spawnSync|execSync|execFileSync)\s*\(\s*['"`]?npm['"`]?\s*,\s*(?:args|\[[^\]]*\baudit\b)/,
  /\brunNpmAudit\s*\(/
];

function fileInvokesThirdPartyTools(content: string): boolean {
  for (const pat of THIRD_PARTY_TOOL_TRIGGER_PATTERNS) {
    if (pat.test(content)) return true;
  }
  return false;
}

function createContractFinding(
  context: HomebrewInspectionContext,
  matcher: (line: string) => boolean,
  message: string,
  contextTag: string
): HomebrewFinding {
  const lineIdx = context.lines.findIndex(matcher);
  return {
    ruleId: 'auditor-third-party-tool-contract',
    line: lineIdx >= 0 ? lineIdx + 1 : 1,
    message,
    context: contextTag,
    severity: 'error'
  };
}

export const thirdPartyToolContractDetector: HomebrewDetector = {
  id: 'third-party-tool-contract',
  ruleId: 'auditor-third-party-tool-contract',
  ruleDescription: 'Contrato de herramienta externa faltante',
  detect(context: HomebrewInspectionContext): HomebrewFinding[] {
    // Only inspect auditor suites and extensions (ignore analyzers and utility helpers)
    if (!context.isBuiltinSuite && !context.isExtension) return [];
    if (
      context.filePath.includes('/analyzers/') ||
      context.filePath.includes('/cli/') ||
      context.filePath.includes('/core/')
    )
      return [];
    if (
      !context.content.includes('class ') ||
      (!context.content.includes('extends BaseAuditor') &&
        !context.content.includes('extends FileScanAuditor'))
    ) {
      return [];
    }
    // Only inspect classes that declare a constructor with super({
    if (!context.content.includes('super(') && !context.content.includes('super ({')) {
      return [];
    }

    const invokesExternal = fileInvokesThirdPartyTools(context.content);
    const declaresTrue = /\busesThirdPartyTool\s*:\s*true\b/.test(context.content);
    const declaresFalse = /\busesThirdPartyTool\s*:\s*false\b/.test(context.content);
    const declaresPolicy = /\bthirdPartyToolPolicy\s*:\s*\{/.test(context.content);

    const isClassHeader = (l: string) =>
      l.includes('class ') &&
      (l.includes('extends BaseAuditor') || l.includes('extends FileScanAuditor'));

    // Case 1: Invokes third-party tools but didn't declare usesThirdPartyTool: true or omitted policy
    if (invokesExternal && (!declaresTrue || !declaresPolicy)) {
      return [
        createContractFinding(
          context,
          isClassHeader,
          'El auditor ejecuta herramientas o binarios externos pero no declara usesThirdPartyTool: true con thirdPartyToolPolicy ({ toolName, fallbackBehavior, fallbackRuleId }) en su constructor.',
          'missing-third-party-tool-policy'
        )
      ];
    }

    // Case 2: Declares usesThirdPartyTool: true but has zero external invocations
    if (!invokesExternal && declaresTrue) {
      return [
        createContractFinding(
          context,
          (l: string) =>
            l.includes('usesThirdPartyTool: true') || l.includes('usesThirdPartyTool:true'),
          'El auditor declara usesThirdPartyTool: true pero no invoca herramientas de terceros en su código. Cambia a usesThirdPartyTool: false.',
          'redundant-third-party-tool-policy'
        )
      ];
    }

    // Case 3: Neither true nor false declared (completely missing usesThirdPartyTool)
    if (!declaresTrue && !declaresFalse) {
      return [
        createContractFinding(
          context,
          isClassHeader,
          'El auditor no declara la propiedad obligatoria usesThirdPartyTool (true o false) en su constructor.',
          'missing-usesThirdPartyTool'
        )
      ];
    }

    return [];
  }
};
