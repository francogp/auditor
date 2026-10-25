/**
 * scripts/auditors/architecture/validate_native_paths.ts
 *
 * SECURITY & PATH INTEGRITY AUDITOR (Node.js 26+ Native, TypeScript AST)
 *
 * Detects homebrew filesystem path, file-URL and URL handling that must use
 * `node:path` / `node:url` / `URL` natives. Analysis runs as a single TypeScript AST pass
 * (src/analyzers/nativePaths) over `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` and Vue `<script>` blocks:
 *   1. `unsafe-path-concat`: paths assembled with `+`, `+=`, template literals or `[...].join(sep)`.
 *   2. `unsanitized-env-argv-path`: raw `process.env` / `process.argv` passed to fs/path sinks.
 *   3. `untrusted-url-fetch`: dynamic `fetch()` without `new URL()` origin validation.
 *   4. `hardcoded-slash-path`: Windows drive/UNC literals and backslash splitting/searching.
 *   5. `homebrew-path-manipulation`: manual separator swapping, de-duplication and trimming.
 *   6. `homebrew-path-parsing`: basename/dirname/extension via split/lastIndexOf/regex.
 *   7. `homebrew-path-containment`: hand-rolled CWE-22 guards (`includes('..')`, prefix checks).
 *   8. `homebrew-file-url`: `file://` conversions by hand instead of `fileURLToPath`/`pathToFileURL`.
 *   9. `homebrew-url-parsing`: URL/query parsing by hand instead of `URL`/`URLSearchParams`.
 *
 * Usage:
 *   npm run auditor -- task=validate_native_paths
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { safeReadFileSync } from '../../core/safeUtils.ts';
import {
  CANONICAL_IGNORE_DIRS,
  SCANNABLE_EXTENSIONS,
  isPathIgnored,
  collectRepositoryFiles,
  getEffectiveScannableRoots,
  FileScanAuditor,
  BaseAuditor,
  createUniformRemediationPhases,
  AuditedDocument,
  assertSafePathComponent,
  createRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { toPosixRelative } from '../../core/auditCoverage.ts';
import {
  NATIVE_PATH_RULES,
  type NativePathRuleId,
  type NativePathViolation
} from '../../analyzers/nativePaths/nativePathTypes.ts';
import { scanNativePathAst } from '../../analyzers/nativePaths/nativePathScanner.ts';

enableCompileCache();

export { CANONICAL_IGNORE_DIRS, isPathIgnored, getEffectiveScannableRoots };
export { NATIVE_PATH_RULES, type NativePathRuleId, type NativePathViolation };

export interface NativePathAuditResult {
  readonly filesScanned: number;
  readonly violations: readonly NativePathViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<NativePathRuleId, number>;
}

/** Script extensions scanned by this suite (JSX flavors included on top of the canonical set). */
export const NATIVE_PATH_EXTENSIONS: ReadonlySet<string> = new Set([
  ...SCANNABLE_EXTENSIONS,
  '.tsx',
  '.jsx'
]); // runtime-set: O(1) extension membership

/**
 * Scans in-memory source code for native path violations using the TypeScript AST.
 */
export function scanFileForNativePathViolations(
  filePath: string,
  content: string
): NativePathViolation[] {
  return scanNativePathAst(new AuditedDocument(filePath, content, filePath));
}

function createEmptyCounts(): Record<NativePathRuleId, number> {
  return Object.fromEntries(NATIVE_PATH_RULES.map((r) => [r, 0])) as Record<NativePathRuleId, number>; // keys enumerated from NATIVE_PATH_RULES
}

/**
 * Full repository audit runner for native paths and security integrity.
 */
export function auditNativePaths(targetDir = process.cwd()): NativePathAuditResult {
  if (!path.isAbsolute(targetDir)) {
    assertSafePathComponent(targetDir);
  }
  const config = getAuditConfig(targetDir);
  const extraIgnorePatterns = [
    ...(config.paths?.ignoreGlobs ?? []),
    ...(config.paths?.ignoredPatterns ?? [])
  ];
  const rootsToScan = getEffectiveScannableRoots(config)
    .map((r) => path.resolve(targetDir, r))
    .filter((p) => fs.existsSync(p));

  const allFiles = rootsToScan.flatMap((root) =>
    collectRepositoryFiles(root, targetDir, extraIgnorePatterns, NATIVE_PATH_EXTENSIONS)
  );

  const violations: NativePathViolation[] = [];
  const countsByRule = createEmptyCounts();

  for (const file of allFiles) {
    const relPath = toPosixRelative(targetDir, file);
    const content = safeReadFileSync(file);
    if (content !== null) {
      for (const v of scanFileForNativePathViolations(relPath, content)) {
        violations.push(v);
        countsByRule[v.ruleId] += 1;
      }
    }
  }

  return {
    filesScanned: allFiles.length,
    violations,
    passed: violations.length === 0,
    countsByRule
  };
}

const RULE_DESCRIPTIONS: Record<NativePathRuleId, string> = {
  'unsafe-path-concat': 'Unsafe path concatenation',
  'unsanitized-env-argv-path': 'Unsanitized argv/env path',
  'untrusted-url-fetch': 'Unsanitized HTTP fetch call',
  'hardcoded-slash-path': 'Hardcoded path separator',
  'homebrew-path-manipulation': 'Homebrew path normalization',
  'homebrew-path-parsing': 'Homebrew path parsing',
  'homebrew-path-containment': 'Homebrew path containment',
  'homebrew-file-url': 'Homebrew file:// conversion',
  'homebrew-url-parsing': 'Homebrew URL parsing'
};

const RULE_REMEDIATIONS: Record<NativePathRuleId, string> = {
  'unsafe-path-concat':
    '📖 REMEDIATION GUIDE: unsafe-path-concat\n' +
    '1. Root Cause: A filesystem path was assembled by string concatenation (`+`, `+=`, template literal, or `[...].join(separator)`). The separator is hardcoded, breaking between Windows and POSIX, and `..` segments are not normalized (CWE-22).\n' +
    '2. Diagnosis: Locate the reported expression: a path source (`__dirname`, `import.meta.dirname`, `process.cwd()`, or `*Dir`/`*Path`/`*File` variables) combined with a literal separator or `path.sep`.\n' +
    '3. Canonical Solution: Pass each segment as a separate argument to `path.join()` or `path.resolve()` from `node:path`.\n' +
    '4. Example:\n' +
    '   ❌ Fragile:   Joining directory, slash, and file name as raw text\n' +
    '   ✅ Canonical: `const fullPath = path.join(baseDir, fileName);`',
  'unsanitized-env-argv-path':
    '📖 REMEDIATION GUIDE: unsanitized-env-argv-path\n' +
    '1. Root Cause: A value from `process.argv` or `process.env` is passed directly to `fs.*` or `path.join/resolve` without verifying that it remains within the authorized directory boundary (CWE-22).\n' +
    '2. Diagnosis: Locate the filesystem or path sink call receiving the raw process argument.\n' +
    '3. Canonical Solution:\n' +
    '   a) Assign the value to a variable, resolve it with `path.resolve(base, value)`, and validate containment with `path.relative()` + `path.isAbsolute()` (or `assertSafePathComponent()`).\n' +
    '   b) In CLI scripts, validate input arguments using path normalization helpers (e.g. `normalizePosixPath`, `isPathContained`).\n' +
    '4. Example:\n' +
    '   ❌ Insecure: Passing process arguments directly to file read calls\n' +
    '   ✅ Secure:   `const target = path.resolve(root, input); assertSafePathComponent(target);`',
  'untrusted-url-fetch':
    '📖 REMEDIATION GUIDE: untrusted-url-fetch\n' +
    '1. Root Cause: `fetch()` is invoked with a dynamic value without parsing via `new URL()` or validating protocol and origin (CWE-918 SSRF).\n' +
    '2. Diagnosis: Inspect the reported `fetch()` call and the origin of its argument.\n' +
    '3. Canonical Solution:\n' +
    '   a) Construct the URL using `new URL(endpoint, baseUrl)`.\n' +
    '   b) Validate `protocol` and `hostname`/`origin` against an allowlist, or use `safeFetch()`.\n' +
    '   c) For internal endpoints, define constant URLs with `new URL(path, base)`.\n' +
    '4. Example:\n' +
    '   ❌ Insecure: Invoking fetch with an unvalidated incoming string\n' +
    '   ✅ Secure:   `fetch(new URL(userPath, baseUrl));`',
  'hardcoded-slash-path':
    '📖 REMEDIATION GUIDE: hardcoded-slash-path\n' +
    '1. Root Cause: A Windows drive letter or UNC path was hardcoded, or a path was split/searched by backslash. This breaks execution across Linux/macOS and CI.\n' +
    '2. Diagnosis: Locate the hardcoded drive/UNC literal or the `split`/`lastIndexOf`/`indexOf` backslash call.\n' +
    '3. Canonical Solution:\n' +
    '   a) Resolve paths relative to project root with `path.resolve()`.\n' +
    '   b) For segments use `path.parse()`, `path.basename()`, or `split(path.sep)`.\n' +
    '   c) If explicitly Windows code, use `path.win32.*`.\n' +
    '4. Example:\n' +
    '   ❌ Incorrect: Rigid drive-letter prefix or backslash split\n' +
    '   ✅ Correct:   `const p = path.resolve(process.cwd(), "data");`',
  'homebrew-path-manipulation':
    '📖 REMEDIATION GUIDE: homebrew-path-manipulation\n' +
    '1. Root Cause: A path was manipulated manually (swapping separators via regex or literal `split/join`, deduplicating slashes, trimming trailing slashes). On POSIX backslash is a valid filename character, so replacing it corrupts valid filenames.\n' +
    '2. Diagnosis: Locate the reported `replace`/`replaceAll` call or `split(...).join(...)` chain.\n' +
    '3. Canonical Solution:\n' +
    '   a) For current OS paths: `p.split(path.sep).join(path.posix.sep)`.\n' +
    '   b) For Windows-style input from any source: `p.replaceAll(path.win32.sep, path.posix.sep)`.\n' +
    '   c) For redundant segments: `path.normalize()` / `path.posix.normalize()`.\n' +
    '4. Example:\n' +
    '   ❌ Fragile:   Replacing backslashes with slashes using regex\n' +
    '   ✅ Canonical: `const posixRel = path.relative(root, file).split(path.sep).join(path.posix.sep);`',
  'homebrew-path-parsing':
    '📖 REMEDIATION GUIDE: homebrew-path-parsing\n' +
    '1. Root Cause: Name, directory, or extension was extracted from a path using `split`, `lastIndexOf`, `pop()`, or regex. Fails with mixed separators, hidden files (`.env`), and multi-dot names.\n' +
    '2. Diagnosis: Locate the string operation performed on a path or filename variable.\n' +
    '3. Canonical Solution: Use `path.basename()`, `path.dirname()`, `path.extname()`, or `path.parse()` from `node:path`.\n' +
    '4. Example:\n' +
    '   ❌ Fragile:   Extracting the last segment by splitting on slash\n' +
    '   ✅ Canonical: `const { name, ext, dir } = path.parse(filePath);`',
  'homebrew-path-containment':
    '📖 REMEDIATION GUIDE: homebrew-path-containment\n' +
    '1. Root Cause: Directory traversal protection (CWE-22) was homebrewed: checking `..` in string, prefix comparison with `startsWith(base)` (confuses `/base` with `/base2`), or regex stripping `../`.\n' +
    '2. Diagnosis: Locate the check and the target path being protected.\n' +
    '3. Canonical Solution: Resolve with `path.resolve(base, input)` and validate with `const rel = path.relative(base, target); const inside = !rel.startsWith("..") && !path.isAbsolute(rel);` or use `isPathContained()`.\n' +
    '4. Example:\n' +
    '   ❌ Fragile:   Rejecting inputs containing two dots or comparing raw string prefixes\n' +
    '   ✅ Canonical: `if (!isPathContained(rootDir, target)) throw new Error("Access denied");`',
  'homebrew-file-url':
    '📖 REMEDIATION GUIDE: homebrew-file-url\n' +
    '1. Root Cause: Converted between paths and `file://` URLs by hand (stripping or prepending scheme, or reading `.pathname` from `new URL(..., import.meta.url)`). `.pathname` remains percent-encoded and produces `/C:/...` on Windows.\n' +
    '2. Diagnosis: Locate the `file://` literal or `.pathname` access.\n' +
    '3. Canonical Solution: Use `fileURLToPath()` and `pathToFileURL()` from `node:url`, or `import.meta.dirname` / `import.meta.filename`.\n' +
    '4. Example:\n' +
    '   ❌ Fragile:   Stripping scheme from module URL string\n' +
    '   ✅ Canonical: `const local = fileURLToPath(new URL("./data.json", import.meta.url));`',
  'homebrew-url-parsing':
    '📖 REMEDIATION GUIDE: homebrew-url-parsing\n' +
    '1. Root Cause: Manually parsed or constructed a URL: splitting by `?`, `#`, `&` or `=`, query/scheme regexes, `path.join()` on URLs, or deprecated `url.parse()`.\n' +
    '2. Diagnosis: Locate the string operation or regex performed on the URL.\n' +
    '3. Canonical Solution: Use `new URL(relative, base)`, `url.searchParams`, `URLSearchParams`, `url.pathname`, and `url.hash`.\n' +
    '4. Example:\n' +
    '   ❌ Fragile:   Splitting URL by question mark to read parameters\n' +
    '   ✅ Canonical: `const id = new URL(requestUrl).searchParams.get("id");`'
};

export class NativePathsAuditor extends FileScanAuditor<NativePathRuleId> {
  private readonly documentCache = new WeakMap<AuditedDocument, readonly NativePathViolation[]>();

  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (cfg) => getEffectiveScannableRoots(cfg)
    );
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(NATIVE_PATH_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_native_paths',
      name: 'Security & Native Path Integrity Validator',
      description: 'Requires node:path, node:url, and native URL (CWE-22)',
      family: 'architecture',
      ruleIds: NATIVE_PATH_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(NATIVE_PATH_RULES, 'setup'),
      packageName: 'Path',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🛤️',
      ruleDescriptions: RULE_DESCRIPTIONS,
      ruleRemediations: RULE_REMEDIATIONS,
      roots: targetRoots,
      allowedExtensions: NATIVE_PATH_EXTENSIONS,
      projectRoot: effectiveRoot
    });

    for (const ruleId of NATIVE_PATH_RULES) {
      this.declareFileSubAuditor(ruleId, (doc) => {
        for (const v of this.scanDocumentOnce(doc)) {
          if (v.ruleId === ruleId) this.addViolation(v);
        }
      });
    }
  }

  /** Runs the single AST pass once per document and shares the result across rule sub-auditors. */
  private scanDocumentOnce(doc: AuditedDocument): readonly NativePathViolation[] {
    const cached = this.documentCache.get(doc);
    if (cached) return cached;
    const violations = scanNativePathAst(doc);
    this.documentCache.set(doc, violations);
    return violations;
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new NativePathsAuditor());
