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

* ❌ **FORBIDDEN**: Writing recursive functions (`walk(dir)`, `walkDir()`, `getAllFiles()`, `getFilesRecursively()`) or raw `fs.readdirSync(dir, { recursive: true })` without ignore governance.
* ❌ **FORBIDDEN**: Hardcoding directory ignore lists (`['node_modules', 'dist', 'coverage']`) across multiple files.
* ✅ **CANONICAL**: Use `collectRepositoryFiles()` from `@francogp/auditor` / `src/core/auditorBase.ts`.

  ```ts
  import { collectRepositoryFiles } from '../auditorBase.ts';

  const files = collectRepositoryFiles(targetDir, projectRoot, [], allowedExtensions);
  ```

### B. Path Resolution & Containment

* ❌ **FORBIDDEN**: String concatenation with slashes:

  ```ts
  const fullPath = dir + '/' + file;
  const target = `${baseDir}\\${subPath}`;
  ```

* ❌ **FORBIDDEN**: Homebrew slash replacement or splitting:

  ```ts
  const normalized = p.replace(/\\/g, '/');
  const segments = filePath.split('/');
  ```

* ✅ **CANONICAL**: Use native `node:path` methods:

  ```ts
  import path from 'node:path';

  const fullPath = path.resolve(baseDir, file);
  const relPath = path.relative(projectRoot, file);
  const normalized = path.normalize(p);
  ```

### C. Cross-Platform Path Comparison

* ❌ **FORBIDDEN**: Raw string equality on paths:

  ```ts
  if (pathA === pathB) // Fails when one uses \ and the other uses / or different casing on Windows
  ```

* ✅ **CANONICAL**: Normalize paths and evaluate relative distance:

  ```ts
  import path from 'node:path';

  export function isSameFilePath(fileA: string, fileB: string, baseDir: string = process.cwd()): boolean {
    const absA = path.isAbsolute(fileA) ? path.normalize(fileA) : path.resolve(baseDir, fileA);
    const absB = path.isAbsolute(fileB) ? path.normalize(fileB) : path.resolve(baseDir, fileB);
    return path.relative(absA, absB) === '' || absA.toLowerCase() === absB.toLowerCase();
  }
  ```

### D. Path Containment (CWE-22 Prevention)

* ❌ **FORBIDDEN**: Regex checking for `..` or homebrew substring checks:

  ```ts
  if (candidate.includes('..')) throw new Error();
  ```

* ✅ **CANONICAL**: Use `assertSafePathComponent` or `path.resolve` + `path.relative`:

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

Two core auditor suites actively govern this contract:

1. **`validate_native_paths`** (AST-based, 9 deterministic rules declared in `phase: 'setup'`):
   * `native-path-unsafe-concat`: Flags string concatenations or template literals with slashes/segments in filesystem sinks (e.g. `dir + '/' + f`, `${base}/${rel}`). Use `path.join()` or `path.resolve()`.
   * `native-path-homebrew-normalize`: Flags non-standard path sanitization, manual separator normalizations, and segment splitting/slicing algorithms. Use `path.normalize()`, `path.posix.normalize()`, `toPosixPath()`, or `p.replaceAll(path.win32.sep, path.posix.sep)`.
   * `native-path-separator-swap`: Flags hardcoded separator swapping (`replace(/\\/g, '/')`), Windows drive letters (`C:\\`), and slash-dependent index slicing. Use `path.win32.isAbsolute()`, `path.sep`, or `path.posix`.
   * `native-path-homebrew-containment`: Flags custom substring or regex-based directory traversal validations (e.g. `p.includes('..')`, `!p.startsWith(root)`). Use `path.resolve()` + `path.relative()` bounds checking (`isPathContained()`).
   * `native-path-homebrew-parsing`: Flags manual string splitting, regex parsing, or slicing to extract extensions, basenames, or parent directories. Use `path.extname()`, `path.basename()`, or `path.dirname()`.
   * `native-path-homebrew-file-url`: Flags manual `file://` protocol prefix concatenation or substring stripping. Use `pathToFileURL()` and `fileURLToPath()` from `node:url`.
   * `native-path-homebrew-url-parsing`: Flags manual URL string splitting, protocol matching regexes, or custom query/hostname parsing. Use the WHATWG standard `URL` constructor or `URLSearchParams`.
   * `native-path-unparsed-env-argv`: Flags unvalidated command-line (`process.argv`) or environment variable (`process.env`) paths fed directly into filesystem APIs without containment or normalization assertions.
   * `native-path-homebrew-fetch-url`: Flags passing local filesystem paths, path variables, or directory segments directly into `fetch()` or HTTP clients without an explicit URL scheme. Use `node:fs` or `pathToFileURL()`.

2. **`validate_auditor_hygiene`**:
   * `auditor-manual-file-walker`: Flags recursive directory walkers or custom `readdirSync` loops.
   * `auditor-homebrew-path-normalization`: Flags custom normalization functions.
