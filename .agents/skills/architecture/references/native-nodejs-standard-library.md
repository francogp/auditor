# Strict Node.js 26+ Native Standard Library & File Management Mandate

This reference defines the mandatory architectural standard for filesystem operations, path resolution, directory traversal, and runtime utilities across all sub-auditors, CLI tools, core modules, and host extensions.

---

## 1. Architectural Philosophy

Homebrew path manipulation, custom directory walkers, and ad-hoc string splitting on slashes are primary sources of cross-platform bugs (Windows backslashes vs. POSIX forward slashes, case-insensitivity on Windows/macOS vs. Linux, symlinks, directory traversal vulnerabilities like CWE-22, and permission boundary violations).

**Core Rule**:

> Always use Node.js 26+ native standard library modules (`node:path`, `node:fs`, `node:url`, `node:util`, `node:crypto`) directly or through canonical framework wrappers (`collectRepositoryFiles`, `safePath`). Never implement homebrew filesystem or path manipulation logic.

---

## 2. Forbidden Patterns vs. Canonical Standards

### A. Directory Traversal & File Collection

- ❌ **FORBIDDEN**: Writing recursive functions (`walk(dir)`, `walkDir()`, `getAllFiles()`, `getFilesRecursively()`) or raw `fs.readdirSync(dir, { recursive: true })` without ignore governance.
- ❌ **FORBIDDEN**: Hardcoding directory ignore lists (`['node_modules', 'dist', 'coverage']`) across multiple files.
- ✅ **CANONICAL**: Use `collectRepositoryFiles()` from `@francogp/auditor` / `src/core/auditorBase.ts`.

  ```ts
  import { collectRepositoryFiles } from '../auditorBase.ts';

  const files = collectRepositoryFiles(targetDir, projectRoot, [], allowedExtensions);
  ```

### B. Path Resolution & Containment

- ❌ **FORBIDDEN**: String concatenation with slashes:

  ```ts
  const fullPath = dir + '/' + file;
  const target = `${baseDir}\\${subPath}`;
  ```

- ❌ **FORBIDDEN**: Homebrew slash replacement or splitting:

  ```ts
  const normalized = p.replace(/\\/g, '/');
  const segments = filePath.split('/');
  ```

- ✅ **CANONICAL**: Use native `node:path` methods:

  ```ts
  import path from 'node:path';

  const fullPath = path.resolve(baseDir, file);
  const relPath = path.relative(projectRoot, file);
  const normalized = path.normalize(p);
  ```

### C. Cross-Platform Path Comparison

- ❌ **FORBIDDEN**: Raw string equality on paths:

  ```ts
  if (pathA === pathB) // Fails when one uses \ and the other uses / or different casing on Windows
  ```

- ✅ **CANONICAL**: Normalize paths and evaluate relative distance:

  ```ts
  import path from 'node:path';

  export function isSameFilePath(
    fileA: string,
    fileB: string,
    baseDir: string = process.cwd()
  ): boolean {
    const absA = path.isAbsolute(fileA) ? path.normalize(fileA) : path.resolve(baseDir, fileA);
    const absB = path.isAbsolute(fileB) ? path.normalize(fileB) : path.resolve(baseDir, fileB);
    return path.relative(absA, absB) === '' || absA.toLowerCase() === absB.toLowerCase();
  }
  ```

### D. Path Containment (CWE-22 Prevention)

- ❌ **FORBIDDEN**: Regex checking for `..` or homebrew substring checks:

  ```ts
  if (candidate.includes('..')) throw new Error();
  ```

- ✅ **CANONICAL**: Use `assertSafePathComponent` or `path.resolve` + `path.relative`:

  ```ts
  import path from 'node:path';

  export function isPathContained(parentDir: string, candidateChild: string): boolean {
    const resolvedParent = path.resolve(parentDir);
    const resolvedChild = path.resolve(resolvedParent, candidateChild);
    const rel = path.relative(resolvedParent, resolvedChild);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  }
  ```

---

## 3. Auditing & Enforcement

All native path and homebrew hygiene rules execute natively inside **`validate_oxlint`** via the `@francogp/domain-type` Oxlint AST plugin (`src/core/domainTypeOxlintPlugin.ts`, runnable via `npm run auditor:oxlint`, `npm run auditor:native-paths`, or `npm run auditor:auditor-hygiene`):

1. **Native Path Safety Rules (`@francogp/domain-type/*`)**:
   - `unsafe-path-concat`: Flags string concatenations or template literals with slashes/segments in filesystem sinks (e.g. `dir + '/' + f`, `${base}/${rel}`). Use `path.join()` or `path.resolve()`.
   - `hardcoded-slash-path`: Flags hardcoded separator swapping (`replace(/\\/g, '/')`), Windows drive letters (`C:\\`), manual normalization, and slash-dependent slicing. Use `path.normalize()`, `path.posix.normalize()`, `toPosixPath()`, or `path.win32.isAbsolute()`.
   - `homebrew-path-containment`: Flags custom substring or regex-based directory traversal validations (e.g. `p.includes('..')`, `!p.startsWith(root)`). Use `path.resolve()` + `path.relative()` bounds checking (`isPathContained()`).
   - `homebrew-path-parsing`: Flags manual string splitting, regex parsing, or slicing to extract extensions, basenames, or parent directories. Use `path.extname()`, `path.basename()`, or `path.dirname()`.
   - `homebrew-file-url` & `homebrew-url-parsing`: Flags manual `file://` prefix manipulation or regex URL parsing. Use `pathToFileURL()`, `fileURLToPath()`, `URL`, or `URLSearchParams`.
   - `unsanitized-env-argv-path` & `untrusted-url-fetch`: Flags unvalidated CLI/env paths in filesystem sinks or local filesystem paths passed directly to `fetch()`.

2. **Auditor Homebrew Hygiene Detectors (`src/analyzers/homebrew/detectors/`)**:
   - `auditor-manual-dir-walk`: Flags recursive directory walkers or custom `readdirSync` loops (`fileWalkerDetector.ts`).
   - `auditor-manual-path-normalization`: Flags custom path normalization helpers.
