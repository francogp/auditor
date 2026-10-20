/**
 * src/analyzers/nativePaths/pathHeuristics.ts
 *
 * Pure TypeScript AST predicates used by native path detectors.
 * Code structure is resolved exclusively through the TypeScript Compiler API;
 * only the textual payload of literal nodes (string values, regex sources,
 * identifier names) is inspected with plain string operations.
 */

import ts from 'typescript';

import { unwrapExpression } from './pathLiteralHeuristics.ts';

export const PARENT_SEGMENT = '..';
export const FILE_SCHEME = 'file://';
export const REGEX_CONSUMER_METHODS: ReadonlySet<string> = new Set([
  'test',
  'exec',
  'match',
  'matchAll',
  'search'
]); // runtime-set: O(1) lookup

const PATH_WORDS: ReadonlySet<string> = new Set([
  'path',
  'dir',
  'directory',
  'file',
  'filename',
  'filepath',
  'folder',
  'root',
  'base',
  'segment',
  'subdir',
  'sub',
  'dirname',
  'basename',
  'rel',
  'relative',
  'cwd'
]); // runtime-set: O(1) identifier word lookup (singular: one path value)

const PATH_COLLECTION_WORDS: ReadonlySet<string> = new Set([
  'paths',
  'dirs',
  'directories',
  'files',
  'folders',
  'roots',
  'segments',
  'parts'
]); // runtime-set: O(1) identifier word lookup (plural: path segment collections)

const FILENAME_WORDS: ReadonlySet<string> = new Set([
  ...PATH_WORDS,
  'name',
  'attachment',
  'upload',
  'asset',
  'image',
  'document'
]); // runtime-set: O(1) identifier word lookup

const URL_WORDS: ReadonlySet<string> = new Set([
  'url',
  'urls',
  'uri',
  'href',
  'origin',
  'host',
  'hostname',
  'endpoint',
  'endpoints',
  'route',
  'routes',
  'api',
  'link',
  'links',
  'query',
  'search',
  'location',
  'http',
  'https',
  'domain'
]); // runtime-set: O(1) identifier word lookup

const PATH_ORIGIN_GLOBALS: ReadonlySet<string> = new Set(['__dirname', '__filename']); // runtime-set: O(1) lookup
const OS_PATH_FUNCTIONS: ReadonlySet<string> = new Set(['tmpdir', 'homedir']); // runtime-set: O(1) lookup
const STRING_PASSTHROUGH_METHODS: ReadonlySet<string> = new Set([
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'normalize',
  'replace',
  'replaceAll',
  'slice',
  'substring'
]); // runtime-set: O(1) lookup

const FS_SINK_METHODS: ReadonlySet<string> = new Set([
  'readFileSync',
  'readFile',
  'writeFileSync',
  'writeFile',
  'appendFileSync',
  'appendFile',
  'existsSync',
  'mkdirSync',
  'mkdir',
  'readdirSync',
  'readdir',
  'statSync',
  'stat',
  'lstatSync',
  'lstat',
  'unlinkSync',
  'unlink',
  'rmSync',
  'rm',
  'rmdirSync',
  'rmdir',
  'copyFileSync',
  'copyFile',
  'openSync',
  'open',
  'createReadStream',
  'createWriteStream'
]); // runtime-set: O(1) lookup

const FS_OBJECTS: ReadonlySet<string> = new Set(['fs', 'fsSync', 'fsp', 'fsPromises', 'promises']); // runtime-set: O(1) lookup
const PATH_BUILDER_FUNCTIONS: ReadonlySet<string> = new Set(['join', 'resolve', 'normalize']); // runtime-set: O(1) lookup
const NODE_PATH_API: ReadonlySet<string> = new Set([
  'join',
  'resolve',
  'normalize',
  'relative',
  'dirname',
  'basename',
  'extname',
  'parse',
  'format',
  'isAbsolute',
  'toNamespacedPath',
  'matchesGlob'
]); // runtime-set: O(1) lookup of real node:path functions (a local `path` string has none of these)

// ─── Identifier words ───────────────────────────────────────────────────────

function isUpperChar(ch: string | undefined): boolean {
  return ch !== undefined && ch >= 'A' && ch <= 'Z';
}

function isLowerOrDigitChar(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'));
}

/**
 * Splits camelCase, PascalCase, snake_case and SCREAMING_CASE identifiers into lowercase words.
 */
function splitIdentifierWords(name: string): string[] {
  const words: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current) words.push(current.toLowerCase());
    current = '';
  };
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]!;
    if (ch === '_' || ch === '$' || ch === '-') {
      flush();
      continue;
    }
    const startsWord =
      isUpperChar(ch) &&
      current.length > 0 &&
      (isLowerOrDigitChar(name[i - 1]) ||
        (isUpperChar(name[i - 1]) && isLowerOrDigitChar(name[i + 1])));
    if (startsWord) flush();
    current += ch;
  }
  flush();
  return words;
}

function hasWordIn(name: string, words: ReadonlySet<string>): boolean {
  return splitIdentifierWords(name).some((w) => words.has(w));
}

export function isUrlLikeName(name: string): boolean {
  return name.toLowerCase().endsWith('pathname') || hasWordIn(name, URL_WORDS);
}

export function isPathLikeName(name: string): boolean {
  if (isUrlLikeName(name)) return false;
  return name === 'ROOT' || hasWordIn(name, PATH_WORDS);
}

function isFilenameLikeName(name: string): boolean {
  if (isUrlLikeName(name)) return false;
  return hasWordIn(name, FILENAME_WORDS);
}

/** Plural identifiers holding path segments (`segments`, `pathParts`, `dirs`). */
export function isPathCollectionName(name: string): boolean {
  if (isUrlLikeName(name)) return false;
  return hasWordIn(name, PATH_COLLECTION_WORDS);
}

// ─── Node naming ─────────────────────────────────────────────────────────────

/**
 * Returns the identifier or trailing property name that labels an expression (`a.b.filePath` → `filePath`).
 */
export function getExpressionName(expr: ts.Expression): string | undefined {
  const node = unwrapExpression(expr);
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

/**
 * Collects every identifier and property name along a receiver chain
 * (`location.search.slice(1)` → `slice`, `search`, `location`).
 */
function collectChainNames(expr: ts.Expression): string[] {
  const names: string[] = [];
  let node: ts.Expression = unwrapExpression(expr);
  for (;;) {
    if (ts.isIdentifier(node)) {
      names.push(node.text);
      return names;
    }
    if (ts.isPropertyAccessExpression(node)) {
      names.push(node.name.text);
      node = unwrapExpression(node.expression);
    } else if (ts.isCallExpression(node) || ts.isElementAccessExpression(node)) {
      node = unwrapExpression(node.expression);
    } else {
      return names;
    }
  }
}

export interface MethodCall {
  readonly call: ts.CallExpression;
  readonly method: string;
  readonly receiver: ts.Expression;
}

export function asMethodCall(node: ts.Node): MethodCall | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  return { call: node, method: callee.name.text, receiver: callee.expression };
}

function isIdentifierNamed(expr: ts.Expression, name: string): boolean {
  const node = unwrapExpression(expr);
  return ts.isIdentifier(node) && node.text === name;
}

/**
 * True for `path.<fn>`, `path.posix.<fn>` and `path.win32.<fn>` callee expressions
 * where `<fn>` is a real `node:path` function.
 */
export function getNodePathFunction(
  callee: ts.Expression
): { readonly fn: string; readonly flavor: 'native' | 'posix' | 'win32' } | undefined {
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const fn = callee.name.text;
  if (!NODE_PATH_API.has(fn)) return undefined;
  const owner = unwrapExpression(callee.expression);
  if (isIdentifierNamed(owner, 'path')) return { fn, flavor: 'native' };
  if (ts.isPropertyAccessExpression(owner) && isIdentifierNamed(owner.expression, 'path')) {
    const flavor = owner.name.text;
    if (flavor === 'posix' || flavor === 'win32') return { fn, flavor };
  }
  return undefined;
}

/** `path.sep`, `path.posix.sep`, `path.win32.sep`. */
export function isSepConstant(expr: ts.Expression): boolean {
  const node = unwrapExpression(expr);
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'sep') return false;
  const owner = unwrapExpression(node.expression);
  if (isIdentifierNamed(owner, 'path')) return true;
  return ts.isPropertyAccessExpression(owner) && isIdentifierNamed(owner.expression, 'path');
}

function isImportMetaProperty(node: ts.Expression, prop: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === prop &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

export function isImportMetaUrl(expr: ts.Expression): boolean {
  return isImportMetaProperty(unwrapExpression(expr), 'url');
}

function isCallToFileURLToPath(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'fileURLToPath';
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === 'fileURLToPath';
  return false;
}

/**
 * Expressions that always produce a filesystem path: `__dirname`, `import.meta.dirname`,
 * `process.cwd()`, `os.tmpdir()`, any `path.*()` call, `fileURLToPath()` and `path.sep`.
 */
function isPathOrigin(expr: ts.Expression): boolean {
  const node = unwrapExpression(expr);
  if (ts.isIdentifier(node)) return PATH_ORIGIN_GLOBALS.has(node.text);
  if (isImportMetaProperty(node, 'dirname') || isImportMetaProperty(node, 'filename')) return true;
  if (isSepConstant(node)) return true;
  if (!ts.isCallExpression(node)) return false;
  if (isCallToFileURLToPath(node)) return true;
  const callee = node.expression;
  if (getNodePathFunction(callee)) return true;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const owner = unwrapExpression(callee.expression);
  if (callee.name.text === 'cwd' && isIdentifierNamed(owner, 'process')) return true;
  return OS_PATH_FUNCTIONS.has(callee.name.text) && isIdentifierNamed(owner, 'os');
}

/**
 * Like isPathOrigin but also follows string pass-through chains (`path.relative(a, b).replace(...)`).
 */
export function isPathOriginChain(expr: ts.Expression): boolean {
  let node = unwrapExpression(expr);
  for (;;) {
    if (isPathOrigin(node)) return true;
    const mc = asMethodCall(node);
    if (!mc || !STRING_PASSTHROUGH_METHODS.has(mc.method)) return false;
    node = unwrapExpression(mc.receiver);
  }
}

export function isPathish(expr: ts.Expression, pathOriginNames: ReadonlySet<string>): boolean {
  const node = unwrapExpression(expr);
  if (isPathOriginChain(node)) return true;
  if (ts.isIdentifier(node)) return pathOriginNames.has(node.text) || isPathLikeName(node.text);
  if (ts.isPropertyAccessExpression(node)) return isPathLikeName(node.name.text);
  const mc = asMethodCall(node);
  if (mc && STRING_PASSTHROUGH_METHODS.has(mc.method)) return isPathish(mc.receiver, pathOriginNames);
  return false;
}

export function isFilenameish(expr: ts.Expression, pathOriginNames: ReadonlySet<string>): boolean {
  if (isPathish(expr, pathOriginNames)) return true;
  const name = getExpressionName(expr);
  return name !== undefined && isFilenameLikeName(name);
}

export function isUrlish(expr: ts.Expression): boolean {
  if (isPathOriginChain(expr)) return false;
  return collectChainNames(expr).some((n) => n === 'url' || isUrlLikeName(n));
}

// ─── Sinks ──────────────────────────────────────────────────────────────────

export function isFsSinkCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return FS_SINK_METHODS.has(callee.text);
  if (!ts.isPropertyAccessExpression(callee) || !FS_SINK_METHODS.has(callee.name.text)) return false;
  const owner = unwrapExpression(callee.expression);
  if (ts.isIdentifier(owner)) return FS_OBJECTS.has(owner.text);
  return ts.isPropertyAccessExpression(owner) && owner.name.text === 'promises';
}

/** `path.join/resolve/normalize` (native or posix flavor, never win32). */
export function isPathBuilderCall(call: ts.CallExpression): boolean {
  const fn = getNodePathFunction(call.expression);
  return fn !== undefined && fn.flavor !== 'win32' && PATH_BUILDER_FUNCTIONS.has(fn.fn);
}

export function isInsideWin32Call(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (ts.isCallExpression(cur) && getNodePathFunction(cur.expression)?.flavor === 'win32') {
      return true;
    }
    if (ts.isStatement(cur)) return false;
  }
  return false;
}

export {
  POSIX_SEP,
  WIN_SEP,
  unwrapExpression,
  getStringValue,
  isSeparatorOnly,
  startsWithUrlScheme,
  isPathFragment,
  isDriveOrUncLiteral,
  hasFileExtensionTail,
  getTemplateTexts,
  flattenPlusChain,
  isOutermostPlus,
  type RegexLiteralInfo,
  getRegexInfo,
  hasTraversalToken,
  isDriveLetterRegex,
  collectStringFragments,
  isRegExpConstruction,
  isInsideRegExpConstruction,
  isUrlConstruction
} from './pathLiteralHeuristics.ts';
