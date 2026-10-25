/**
 * scripts/maintenance/audit_rules.ts
 *
 * Centralized audit rules and checkers for the unified audit engine.
 */

import {
  getAuditConfig,
  isDataPath,
  isInCodeRoots,
  isExemptFile,
  isScriptPath,
  isTestPath
} from '../../core/auditConfig.ts';
import { normalizePosixPath } from '../../core/safePath.ts';
import { parseVueSfc } from '../../core/vueSfcParser.ts';
import { CANONICAL_INFRA_ID_WHITELIST } from '../domain_data/validate_domain_types.ts';

export {
  AUDIT_SEVERITIES,
  type AuditSeverity,
  type RuleDescriptor,
  type AuditRule,
  type Violation,
  matchesRule
} from '../../analyzers/auditRuleTypes.ts';
import { type RuleDescriptor, type AuditRule } from '../../analyzers/auditRuleTypes.ts';

export {
  Z_INDEX_CONSISTENCY_DESCRIPTOR,
  CANONICAL_DEFAULT_Z_LAYERS,
  Z_LAYERS,
  Z_VALUE_MAP,
  Z_SORTED_ENTRIES,
  type ZLayerResolution,
  resolveZLayer,
  zIndexAudit,
  zIndexConstantDeclaration
} from '../../analyzers/zIndexRules.ts';

export const FALLOW_SUITE_DESCRIPTORS: Record<
  'dupes' | 'triplets' | 'security' | 'dead-code' | 'health',
  RuleDescriptor
> = {
  dupes: {
    id: 'fallow:dupes',
    name: 'Fallow Code Duplication',
    category: 'Fallow: Duplicate code',
    aliases: ['dupes', 'duplicados', 'clones', 'fallow:dupes', 'fallow-dupes', 'fallow']
  },
  triplets: {
    id: 'fallow:triplets',
    name: 'Fallow Code Triplication',
    category: 'Fallow: Triplicate code',
    aliases: ['triplets', 'triplicados', 'fallow:triplets', 'fallow-triplets', 'fallow']
  },
  security: {
    id: 'fallow:security',
    name: 'Fallow Security CWE Vulnerabilities',
    category: 'Fallow: Security vulnerability',
    aliases: [
      'security',
      'seguridad',
      'cwe',
      'vulnerabilidad',
      'vulnerabilidades',
      'fallow:security',
      'fallow-security',
      'fallow'
    ]
  },
  'dead-code': {
    id: 'fallow:dead-code',
    name: 'Fallow Dead Code, Circular Dependencies & Unused',
    category: 'Fallow: Orphaned files',
    aliases: [
      'dead-code',
      'deadcode',
      'codigo-muerto',
      'circular',
      'huérfano',
      'unused',
      'fallow:dead-code',
      'fallow-dead-code',
      'fallow',
      'store-members',
      'class-members',
      'types',
      'emits',
      'unlisted',
      'workspace',
      'diagnostics',
      'targets',
      'refactoring'
    ]
  },
  health: {
    id: 'fallow:health',
    name: 'Fallow Code Health & Complexity',
    category: 'Fallow: Complexity',
    aliases: [
      'health',
      'salud',
      'complexity',
      'complejidad',
      'fallow:health',
      'fallow-health',
      'fallow'
    ]
  }
};

export const SASS_MIGRATOR_DESCRIPTOR: RuleDescriptor = {
  id: 'sass-migrator',
  name: 'SASS Module Migrator',
  category: 'SASS Migrator',
  aliases: ['sass', 'sass-migrator', 'import', '@import', 'scss']
};

export {
  normalizeFilePath,
  getLineAtMatch,
  isCommentLine,
  isTestOrNodeModules
} from '../../analyzers/auditRuleTypes.ts';
import {
  normalizeFilePath,
  getLineAtMatch,
  isCommentLine
} from '../../analyzers/auditRuleTypes.ts';

export const viewport: AuditRule = {
  // Internal string formatting or DOM token identifier
  id: 'viewport',
  name: 'Viewport Units',
  category: 'Viewport (dvh/dvw)',
  aliases: ['viewport', 'dvh', 'dvw', 'vh', 'vw'],
  regex: /\b\d+(?:\.\d+)?(vw|vh)\b/gi,
  message: (match: string) =>
    `Legacy viewport unit detected: '${match}'. Use '${match.slice(0, -2)}d${match.slice(-2).toLowerCase()}' for dynamic mobile viewport support.`,
  fix: (match: string) => `${match.slice(0, -2)}d${match.slice(-2).toLowerCase()}` // Internal string formatting or DOM token identifier
};

export const legacyDates: AuditRule = {
  id: 'legacyDates',
  name: 'Temporal Migration',
  category: 'Date Usage (Temporal)',
  aliases: ['temporal', 'date', 'dates', 'legacy-dates'],
  regex: /new Date\(|Date\.now\(\)/g,
  message: "Usage of 'Date' detected. Use 'Temporal'.",
  severity: 'error', // Internal string formatting or DOM token identifier
  appliesTo: (filePath: string) => {
    return !isExemptFile(filePath) && isInCodeRoots(filePath);
  },
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    if (isExemptFile(filePath)) {
      return false;
    }
    return isInCodeRoots(filePath);
  },
  fixable: false
};

export const hardcodedTimezone: AuditRule = {
  regex:
    /toZonedDateTimeISO\(\s*['"]([^'"]+)['"]\s*\)|toPlainDateTime\(\s*['"]([^'"]+)['"]\s*\)|Temporal\.TimeZone\.from\(\s*['"]([^'"]+)['"]\s*\)/g,
  message: (match: string) => {
    const tzVar = getAuditConfig().domain?.timezoneVariable ?? 'APP_TIMEZONE';
    const helperMod = getAuditConfig().domain?.timezoneHelperModule;
    const modMsg = helperMod ? ` imported from '${helperMod}'` : '';
    return `Hardcoded timezone detected: '${match}'. Use global variable '${tzVar}'${modMsg} to respect server configuration.`;
  },
  severity: 'error',
  appliesTo: (filePath: string) => {
    const config = getAuditConfig();
    if (config?.domain?.enabled === false) return false;
    const helperMod = config.domain?.timezoneHelperModule;
    if (helperMod && filePath.includes(helperMod.replace(/^@\//, ''))) return false;
    if (isExemptFile(filePath)) return false;
    return isInCodeRoots(filePath);
  },
  check: () => true,
  fixable: false
};

export function getDomainIdFallbackRegex(): RegExp {
  const config = getAuditConfig();
  const patterns =
    config?.domain?.fallbackIdPatterns && config.domain.fallbackIdPatterns.length > 0
      ? config.domain.fallbackIdPatterns
      : ['[a-zA-Z0-9_]*[iI]d', 'type', 'status', 'category', 'mode', 'kind'];
  const joined = patterns.join('|');
  return new RegExp(
    `(?:${joined})\\s*(?:=|:)\\s*[^,;\\n]*?(?:\\?|\\|\\||\\?\\?)\\s*['"]['"]|` +
      `\\b(?:${joined})\\s*(?:\\|\\||\\?\\?)\\s*[^,\\n;)]*\\b(?:name|description|title)\\b|` +
      `\\b(?:name|description|title)\\s*(?:\\|\\||\\?\\?)\\s*[^,\\n;)]*\\b(?:${joined})\\b`,
    'g'
  );
}

export function isDomainAuditTarget(
  filePath?: string,
  config = getAuditConfig()
): filePath is string {
  if (!filePath) return false;
  if (config.domain?.enabled === false) return false;
  if (!isInCodeRoots(filePath, config)) return false;
  if (isExemptFile(filePath, config)) return false;
  return true;
}

export function isAllowedDatabaseFile(filePath: string, config = getAuditConfig()): boolean {
  const norm = normalizeFilePath(filePath);
  const allowedFiles = [
    'database.ts',
    'database.types.ts',
    'supabase.types.ts',
    'schema.types.ts',
    'db.types.ts',
    ...(config.persistence?.allowedDatabaseFiles ?? [])
  ];
  return allowedFiles.some((f) => norm.endsWith(normalizePosixPath(f)));
}

export const noDomainIdFallbacks: AuditRule = {
  get regex() {
    return getDomainIdFallbackRegex();
  },
  message:
    "SILENT FALLBACK ON DOMAIN ID / NAME DETECTED. Using silent fallbacks (such as || '', ?? '', or swapping id with name) is strictly prohibited for domain identifiers. A strict validation function throwing an explicit error (Fail Loud) must be used if the ID is missing or invalid.",
  severity: 'error', // Internal string formatting or DOM token identifier
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    const config = getAuditConfig();
    if (!isDomainAuditTarget(filePath, config)) return false;

    const matchText = match[0] || '';
    // Exclude boolean conditions like !name || !condition, or comparisons like name === x || id === y
    if (/(?:===|!==|==|!=)/.test(matchText) || /!\s*(?:name|description|title)\b/.test(matchText)) return false;

    const infraWhitelist = [
      ...CANONICAL_INFRA_ID_WHITELIST,
      ...(config.domain?.infraIdWhitelist ?? [])
    ];
    if (infraWhitelist.length > 0) {
      if (infraWhitelist.some((id) => new RegExp(`\\b${id}\\b`).test(matchText))) {
        return false;
      }
    }

    const configPatterns = getAuditConfig()?.domain?.fallbackIdPatterns;
    if (configPatterns && configPatterns.length > 0) {
      const matchText = match[0] || '';
      const matchesConfig = configPatterns.some((p) => matchText.includes(p));
      if (!matchesConfig) return false;
    }

    return true;
  },
  fixable: false
};

export const nodePrefix: AuditRule = {
  regex: /import .* from ['"](fs|path|os|crypto|util|url|events|stream|child_process)['"]/g,
  message: "Node import without 'node:' prefix.",
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath || filePath.includes('audit_rules.ts')) return false;
    return true;
  },
  fix: (match: string) =>
    match.replace(
      /['"](fs|path|os|crypto|util|url|events|stream|child_process)['"]/,
      (m) => m.slice(0, 1) + 'node:' + m.slice(1)
    )
};

const RULES_TARGET_NODE_VERSION_LABEL = '26';

import fs from 'node:fs';
import path from 'node:path';

function resolveRelativeTargetExtension(importSpec: string, importerFile?: string): string | null {
  if (/\.jsx$/i.test(importSpec)) return importSpec.replace(/\.jsx$/i, '.tsx');
  if (/\.(?:js|mjs|cjs)$/i.test(importSpec)) return importSpec.replace(/\.(?:js|mjs|cjs)$/i, '.ts');
  if (/\.css$/i.test(importSpec)) {
    if (importerFile && fs.existsSync(importerFile)) {
      const scssTarget = path.resolve(path.dirname(importerFile), importSpec.replace(/\.css$/i, '.scss'));
      if (!fs.existsSync(scssTarget)) return null;
    }
    return importSpec.replace(/\.css$/i, '.scss');
  }
  if (importerFile && fs.existsSync(importerFile)) {
    const baseDir = path.dirname(importerFile);
    for (const ext of ['.ts', '.tsx', '.vue', '.json']) {
      if (fs.existsSync(path.resolve(baseDir, `${importSpec}${ext}`))) {
        return `${importSpec}${ext}`;
      }
    }
    for (const idx of ['/index.ts', '/index.tsx']) {
      if (fs.existsSync(path.resolve(baseDir, `${importSpec}${idx}`))) {
        return `${importSpec}${idx}`;
      }
    }
    return null;
  }
  return `${importSpec}.ts`;
}

export const esmExtensions: AuditRule = {
  regex: /(?:import|export)\s+(?:type\s+)?(?:[^;'"]+?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g,
  message: (match: string) => {
    if (/\.(?:js|jsx|mjs|cjs)['"]/.test(match)) {
      return `Relative import with legacy JS extension: '${match}'. Migrate to explicit TypeScript extension (.ts / .tsx).`;
    }
    if (/\.css['"]/.test(match)) {
      return `Relative import to plain CSS file: '${match}'. Migrate to SCSS (.scss).`;
    }
    return `Relative import without extension: '${match}'. In native Node.js ${RULES_TARGET_NODE_VERSION_LABEL}+ file extensions are mandatory.`;
  },
  severity: 'error',
  fix: (match: string, _p1?: string, filePath?: string) =>
    match.replace(/(['"])(\.\.?\/[^'"]+)(['"])/, (fullQuote, q1: string, p: string, q2: string) => {
      const resolved = resolveRelativeTargetExtension(p, filePath);
      if (!resolved) return fullQuote;
      return `${q1}${resolved}${q2}`;
    }),
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath || filePath.includes('audit_rules.ts') || filePath.endsWith('.vue')) return false;
    const importPath = match[1] || '';
    if (/\.(?:js|jsx|mjs|cjs)$/i.test(importPath)) return true;
    if (/\.css$/i.test(importPath)) {
      return getAuditConfig().styles?.enforceScss !== false;
    }
    if (
      /\.(?:ts|tsx|vue|json|scss|sass|less|svg|png|jpg|jpeg|gif|webp|avif|ico|ogg|mp3|wav|mp4|webm|woff|woff2|ttf|otf|eot|wasm|sql|glsl|vert|frag|txt|md|ya?ml)$/i.test(
        importPath
      )
    )
      return false;
    return true;
  }
};

export const tsIgnore: AuditRule = {
  regex: /\/\/\s*@ts-(ignore|nocheck|expect-error)/g,
  message: "TypeScript suppression detected. Prohibited under the 'Zero-Ignore' policy.",
  severity: 'error',
  fix: () => '',
  fixable: true
};

export {
  isAuditableCodeFile,
  DEFAULT_ALLOWED_NUMERIC_CONSTANT_PREFIXES,
  isConstantNameExemptFromNumericSuffixCheck,
  noAliasConstants,
  noLiteralSuffixInConstantName,
  badConstantNames
} from '../../analyzers/constantRules.ts';
import { isAuditableCodeFile } from '../../analyzers/constantRules.ts';

export const timersPromises: AuditRule = {
  regex: /new Promise\(r => setTimeout\(r, (\d+)\)\)/g,
  message:
    'Manual setTimeout detected in Node script. Use \'import { setTimeout } from "node:timers/promises"\' instead.',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) =>
    !!filePath && isScriptPath(filePath) && !normalizeFilePath(filePath).includes('node_modules'),
  fixable: false
};

export const explicitResource: AuditRule = {
  regex: /const (\w+) = (new DatabaseSync)/g,
  message: `Resource detected without 'using'. Use Explicit Resource Management (Node ${RULES_TARGET_NODE_VERSION_LABEL}+).`,
  fix: (match: string) => match.replace('const', 'using'),
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath || !isScriptPath(filePath)) return false;
    const { trimmed } = getLineAtMatch(content, match.index ?? 0);
    if (isCommentLine(trimmed)) return false;
    return true;
  }
};

export const zeroTimerLogic: AuditRule = {
  id: 'zeroTimerLogic',
  name: 'Zero Timer Logic',
  aliases: ['zerotimerlogic'],
  regex: /(?<!\.)\b(sleep)\s*\(/g,
  message:
    "Native 'sleep()' detected in core logic. Business logic functions must be 100% deterministic and event-driven.",
  severity: 'error',
  check: (content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    if (filePath.endsWith('audit_rules.ts')) return false;
    if (/audit-disable\s+timers/i.test(content)) return false;
    if (!isInCodeRoots(filePath)) return false;
    if (isExemptFile(filePath)) return false;
    return true;
  },
  fixable: false
};

export const jsonStringifyInWatch: AuditRule = {
  regex: /\bwatch\s*\(\s*(?:\(\)\s*=>\s*)?JSON\.stringify/g,
  message:
    "Usage of 'JSON.stringify' inside a watcher detected. Serializing objects/arrays in high-frequency watchers saturates CPU. Perform direct element comparisons or use deep watchers ({ deep: true }) with care.",
  severity: 'error',
  fixable: false
};

export const intersectionObserverRoot: AuditRule = {
  regex: /new\s+IntersectionObserver\s*\([^,]+,\s*\{[^}]*root\s*:\s*(?!null\b)[\w$]/g,
  message:
    "Dynamic or DOM 'root' in IntersectionObserver detected. In scaled or zoomed containers, using a root other than null causes visibility calculation bugs that disable animations. Leave 'root' as 'null' (viewport) or omit it.",
  severity: 'warning',
  fixable: false
};

export const functionCallsInTemplates: AuditRule = {
  regex: /(?::[a-z0-9-]+|v-bind:[a-z0-9-]+)="([\w$]+)\([^"]*\)"|\{\{\s*([\w$]+)\([^}]*\)\}/gi,
  message: (match: string) =>
    `Function or method call '${match}' detected in Vue template. Calling functions that perform database queries, array transformations (.map/.filter), or heavy logic in the render loop is PROHIBITED. Cache data via 'computed'.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const funcName = match[1] || match[2];
    if (!funcName) return false;

    const config = getAuditConfig();
    const userSafe = config.templates?.safeTemplateFunctions ?? [];
    const defaultSafe = [
      't',
      'i18n',
      'translate',
      'formatNumber',
      'class',
      'style',
      'typeof'
    ] as const;
    const allSafe = new Set([...defaultSafe, ...userSafe].map((f) => f.toLowerCase())); // runtime-set: Fast O(1) membership lookup set
    if (allSafe.has(funcName.toLowerCase())) return false;

    try {
      const scriptStart = content.indexOf('<script');
      const scriptEnd = content.indexOf('</script>');
      if (scriptStart === -1 || scriptEnd === -1) return false;
      const scriptContent = content.substring(scriptStart, scriptEnd);

      const funcDefRegex = new RegExp(`(?:const|let|var|function)\\s+${funcName}\\b[^;]*`, 'g');
      const defMatch = funcDefRegex.exec(scriptContent);
      if (!defMatch) return false;

      const defStart = defMatch.index;
      const FUNCTION_DEF_LOOKAHEAD_CHARS = 1000;
      const defContext = scriptContent.substring(
        defStart,
        Math.min(scriptContent.length, defStart + FUNCTION_DEF_LOOKAHEAD_CHARS)
      );

      const prohibitedDb =
        getAuditConfig().persistence?.prohibitedTemplateIdentifiers &&
        getAuditConfig().persistence!.prohibitedTemplateIdentifiers!.length > 0
          ? getAuditConfig().persistence!.prohibitedTemplateIdentifiers!
          : getAuditConfig().persistence?.engine === 'none'
            ? []
            : ['supabase', 'db'];
      const dbPattern = prohibitedDb.length > 0 ? prohibitedDb.join('|') + '|' : '';
      const isHeavy = new RegExp(`\\b(${dbPattern}\\.map\\(|\\.filter\\(|\\.reduce\\()`, 'i').test(
        defContext
      );
      return isHeavy;
    } catch {
      return false;
    }
  },
  fixable: false
};

export const forbiddenFallbacks: AuditRule = {
  regex:
    /\b\w*Provider\.\w+\([^)]*\)\s*(?:\|\||\?\?)|\b([\w$]+)\.(?:\w*[iI]d|name)\s*(?:\|\||\?\?)\s*\1\.(?:name|description|title|id)\b|\b(?:\w+\??\.)*\w*[uU]id\s*(?:\|\||\?\?)\s*(?:\w+\??\.)*\w*[uU]id\b/g,
  message: (match: string) =>
    `Silent fallback or forbidden lookup pattern detected: '${match}'. Under (/domain-type-first Zero-Fallback Mandate), chaining fallbacks on domain IDs or using descriptions as ID fallback is STRICTLY PROHIBITED. Fail loud with throw new Error().`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    const config = getAuditConfig();
    if (config.domain?.enabled === false) return false;
    if (isExemptFile(filePath)) return false;
    return isInCodeRoots(filePath);
  },
  fixable: false
};

export const forbiddenTypeCasts: AuditRule = {
  regex: new RegExp(
    [
      '\\bas\\s+unknown\\s+as\\b',
      '\\bas\\s+any\\s+as\\b',
      '\\bas\\s+any\\b',
      ':\\s*' + 'any\\b',
      '<' + 'any>'
    ].join('|'),
    'g'
  ),
  message: (match: string) =>
    `Arbitrary cast or prohibited 'any' type detected: '${match}'. Violates type integrity directives (/domain-type-first and AGENTS.md Rule 7). Define and import an explicit interface or union type.`,
  severity: 'error',
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return false;
    if (isExemptFile(filePath)) return false;
    if (!isInCodeRoots(filePath)) return false;

    const { trimmed } = getLineAtMatch(content, match.index ?? 0);
    if (isCommentLine(trimmed)) return false;

    return true;
  },
  fixable: false
};

function checkTypeScriptRuleMatch(
  content: string,
  match: RegExpExecArray,
  filePath?: string
): boolean {
  if (!filePath) return false;
  const norm = normalizeFilePath(filePath);
  const codeRoots = getAuditConfig()?.paths?.codeRoots ?? [];
  const isInCodeRoots = codeRoots.some((root) =>
    norm.includes(path.posix.relative('/', path.posix.resolve('/', root)))
  );
  if (!isInCodeRoots) return false;

  const { trimmed } = getLineAtMatch(content, match.index);
  if (isCommentLine(trimmed)) return false;

  return true;
}

function createTypeScriptRule(config: {
  regex: RegExp;
  message: string | ((match: string) => string);
  fixable?: boolean;
  fix?: (content: string) => string;
}): AuditRule {
  return {
    regex: config.regex,
    message: config.message,
    severity: 'error',
    check: (content: string, match: RegExpExecArray, filePath?: string) =>
      checkTypeScriptRuleMatch(content, match, filePath),
    fixable: config.fixable ?? false,
    ...(config.fix ? { fix: config.fix } : {})
  };
}

export const noLiteralBooleanType: AuditRule = createTypeScriptRule({
  regex:
    /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm,
  message: (match: string) =>
    `Literal boolean type detected: '${match.trim()}'. Declaring types with boolean literals (: true / : false) instead of canonical 'boolean' is prohibited. Use ': boolean'.`,
  fixable: true,
  fix: (content: string) => content.replace(/:\s*(?:true|false)\b/g, ': boolean')
});

export const noInlineAnonymousObjectType: AuditRule = createTypeScriptRule({
  regex:
    /\(\s*[A-Za-z0-9_$,\s]*\b[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*[,;]\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g,
  message: (match: string) =>
    `Inline anonymous object type detected in parameter: '${match.trim()}'. Using inline anonymous object shapes in function signatures is PROHIBITED. Define and import a named interface or type (e.g. UserPayload).`
});

export const noFloatingPromises: AuditRule = createTypeScriptRule({
  regex:
    /^\s*(?!(?:await|void|return|const|let|var)\s)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm,
  message: (match: string) =>
    `Floating promise detected: '${match.trim()}'. Every async function call must be explicitly handled with await, void, or .catch().`,
  fixable: true,
  fix: (content: string) => content.replace(/^\s*([a-z]\w*Async\s*\([^)]*\)\s*;)/gm, 'void $1')
});

export const noLeakedGlobalState: AuditRule = createTypeScriptRule({
  regex: /^(?:export\s+)?let\s+[a-z]\w*\s*=/gm,
  message: (match: string) =>
    `Global mutable variable detected at module scope: '${match.trim()}'. Encapsulate state within a Pinia store or class.`
});

const BASE_INFRA_AND_UUID_IDENTIFIERS: ReadonlySet<string> = new Set<string>([
  // runtime-set: Fast O(1) membership lookup set
  'userId',
  'user_id',
  'clientId',
  'client_id',
  'profileId',
  'profile_id',
  'accountId',
  'account_id',
  'sessionId',
  'session_id',
  'socketId',
  'socket_id',
  'notificationId',
  'notification_id',
  'taskId',
  'task_id',
  'jobId',
  'job_id',
  'conversationId',
  'conversation_id',
  'terminalId',
  'terminal_id',
  'messageId',
  'message_id',
  'authId',
  'auth_id',
  'elementId',
  'modalId',
  'tabId',
  'domId',
  'htmlId',
  'uid',
  'toastId',
  'targetUid',
  'sourceId',
  'source_id',
  'targetId',
  'rawId',
  'expectedId',
  'expected_id',
  'eventId',
  'event_id',
  'categoryId',
  'category_id',
  'categoryIdOrUid',
  'maybeUid'
]);

function getEffectiveInfraIdentifiers(): ReadonlySet<string> {
  const config = getAuditConfig();
  const configured = config.domain.infraIdWhitelist ?? [];
  return new Set([...BASE_INFRA_AND_UUID_IDENTIFIERS, ...configured]);
}

export const strictDomainParamTypes: AuditRule = {
  id: 'strictDomainParamTypes',
  name: 'Strict Domain Param Types',
  regex: /\b(\w{2,}[iI]d)\s*\??:\s*(?:string\b(?!\s*\[\])|[A-Z]\w*\s*\|\s*string\b)/g,
  message: (match: string) =>
    match.includes('|')
      ? `[DOMAIN-TYPE-FIRST MANDATE] Parameter or property '${match}' combines a domain type with '| string'.
   RULE: Under (/domain-type-first) combining finite domain unions with '| string' is STRICTLY PROHIBITED.
   SOLUTION: Use the pure canonical union exclusively.`
      : `[DOMAIN-TYPE-FIRST MANDATE] Parameter or property '${match}' typed with naked 'string'.
   RULE: Catalog domain IDs MUST be typed with their canonical domain union.
   INSTANCES vs CATALOG:
      - If it represents a dynamic instance / UUID (e.g. generated ID), name it '*Uid' (e.g. 'targetUid', 'instanceUid') to be automatically recognized.
      - If it is an external infrastructure UUID (DOM, WebSocket), type it with DomElementId or UserUuid from @francogp/auditor.`,
  severity: 'error',
  check: (_content: string, match: RegExpExecArray, filePath?: string) => {
    const config = getAuditConfig();
    if (!isDomainAuditTarget(filePath, config)) return false;
    if (isAllowedDatabaseFile(filePath!, config)) return false;

    const idParamName = match[1];
    if (!idParamName) return false;

    // Wildcard unions with | string are NEVER allowed to be bypassed
    if (match[0].includes('|')) {
      return true;
    }

    // Check for genuine instance UIDs (e.g. invoiceUid, readingUid, calculationUid, targetUid, uid)
    // Distinguishes genuine UIDs from domain IDs ending in 'u' + 'Id' (like 'australopithecuId')
    const GENUINE_UID_PATTERN = /^_{0,2}(?:uid|UID|\w+(?:Uid|UID|_uid|_UID)|\w+[uU]idOr\w+)$/;
    if (GENUINE_UID_PATTERN.test(idParamName)) {
      return false;
    }

    const infraIds = getEffectiveInfraIdentifiers();
    // Check if it is in the standard infrastructure whitelist
    if (infraIds.has(idParamName)) {
      return false;
    }

    // Check if it is a SQL RPC parameter prefixed with p_ matching standard infra whitelist
    if (idParamName.startsWith('p_') && infraIds.has(idParamName.slice(2))) {
      return false;
    }

    return true;
  },
  fixable: false
};

export const noInlineTypeImports: AuditRule = {
  id: 'noInlineTypeImports',
  name: 'No Inline Type Imports',
  regex: /:\s*import\(['"][^'"]+['"]\)\.\w+/g,
  message: (match: string) => `[CLEAN IMPORTS MANDATE] Usage of inline type import '${match}' detected.
   RULE: Importing types inline in parameters or properties inside source code (.ts/.vue) is prohibited.
   SOLUTION: Add explicit 'import type { ... } from "..."' in the file header and use the named type directly in the signature to keep code readable and dependency trees clear. (Only ambient .d.ts files are exempt).`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!isAuditableCodeFile(filePath)) return false;
    const norm = normalizeFilePath(filePath!);
    if (norm.endsWith('.d.ts')) return false; // Allowed in ambient .d.ts declaration files
    return true;
  },
  fixable: false
};

export const noInlineLiteralUnions: AuditRule = {
  id: 'noInlineLiteralUnions',
  name: 'No Inline Literal Unions',
  regex: /:\s*(?:'[^']+'|"[^"]+")(?:\s*\|\s*(?:'[^']+'|"[^"]+"))+/g,
  message: (
    match: string
  ) => `[DOMAIN-TYPE-FIRST MANDATE] Inline string literal union detected: '${match.slice(1).trim()}'.
   RULE: Under (/domain-type-first) declaring ad-hoc inline literal unions scattered across contracts, components, or functions is PROHIBITED.
   SOLUTION: Centralize catalog constants via an 'as const' array and derive the canonical type with '(typeof ARRAY)[number]' (e.g. 'export const FOOS = [...] as const; export type Foo = (typeof FOOS)[number];').`,
  severity: 'error',
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath || isTestPath(filePath)) return false;
    const config = getAuditConfig();
    if (!isInCodeRoots(filePath, config) || isExemptFile(filePath, config)) return false;

    return true;
  },
  fixable: false
};

export const noRawJsonImportsOutsideData: AuditRule = {
  id: 'noRawJsonImportsOutsideData',
  name: 'No Raw JSON Import Outside Data Layer',
  category: 'Bundle Optimization',
  regex: /\bimport\s[^;]+\sfrom\s+['"][^'"]+\.json['"]/g,
  message: (match: string) =>
    `Static JSON import outside src/data/ or scripts/: '${match}'. Centralize catalogs in src/data/ or use dynamic import to prevent redundant bundling.`,
  severity: 'error',
  fixable: false,
  check: (_content: string, _match: RegExpExecArray, filePath?: string) => {
    if (!filePath) return true;
    if (isDataPath(filePath) || isScriptPath(filePath) || isExemptFile(filePath)) return false;
    return isInCodeRoots(filePath);
  }
};

export const noSassAtImport: AuditRule = {
  id: 'noSassAtImport',
  name: 'No SASS @import Deprecated Directive',
  category: 'SASS Migrator',
  regex: /@import\s+(?:url\(\s*['"]?([^'")\s]+)['"]?\s*\)|['"]([^'"]+)['"])\s*;?/g,
  message: (match: string) =>
    `Deprecated '@import' directive detected in Sass: '${match}'. Dart Sass requires migrating to '@use' or '@forward'.`,
  severity: 'error',
  fixable: true,
  fix: (match: string) => {
    const urlMatch = /@import\s+(?:url\(\s*['"]?([^'")\s]+)['"]?\s*\)|['"]([^'"]+)['"])\s*;?/.exec(
      match
    );
    const rawTarget = (urlMatch?.[1] ?? urlMatch?.[2] ?? '').trim();
    if (!rawTarget) return match;
    const normalizedTarget = rawTarget.replace(/\.css$/i, '.scss');
    return `@use '${normalizedTarget}' as *;`;
  },
  check: (content: string, match: RegExpExecArray, filePath?: string) => {
    const target = (match[1] ?? match[2] ?? '').trim();
    if (/^(?:https?:|\/\/|data:)/i.test(target)) return false;
    if (!filePath) return true;
    const norm = normalizeFilePath(filePath);
    if (norm.endsWith('.scss') || norm.endsWith('.css')) return true;
    if (norm.endsWith('.vue')) {
      const sfc = parseVueSfc(content);
      return sfc.styles.some((st) => st.lang === 'scss' || st.lang === 'sass');
    }
    return false;
  }
};

export const auditRulesConfig = {
  viewport,
  hardcodedTimezone,
  nodePrefix,
  esmExtensions,
  timersPromises,
  explicitResource,
  zeroTimerLogic,
  jsonStringifyInWatch,
  intersectionObserverRoot,
  functionCallsInTemplates,
  forbiddenFallbacks,
  noDomainIdFallbacks,
  noInlineTypeImports,
  noRawJsonImportsOutsideData,
  noSassAtImport
};

// Ensure every rule in auditRulesConfig has its descriptor fields populated dynamically
for (const [key, rule] of Object.entries(auditRulesConfig)) {
  const r = rule as AuditRule;
  if (!r.id) {
    (r as { id: string }).id = key;
  }
  if (!r.name) {
    (r as { name: string }).name = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase()); // Internal string formatting or DOM token identifier
  }
  if (!r.aliases) {
    const keyParts = key.split(/(?=[A-Z])/).map((s) => s.toLowerCase()); // Internal string formatting or DOM token identifier
    (r as { aliases: readonly string[] }).aliases = [key.toLowerCase(), ...keyParts]; // Internal string formatting or DOM token identifier
  }
}
