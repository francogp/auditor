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
* ✅ **CANONICAL**: Use `collectRepositoryFiles()` from `@francogp/auditor` / `src/core/safePath.ts`.

  ```ts
  import { collectRepositoryFiles } from '../safePath.ts';

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

1. **`validate_native_paths`**:
   * `unsafe-path-concat`: Flags string concatenations with slashes in filesystem sinks.
   * `unsanitized-env-argv-path`: Flags unvalidated command-line or environment paths.
   * `hardcoded-slash-path`: Flags `.replace(/\\/g, '/')`, hardcoded `C:\\`, and slash-dependent slicing.
   * `homebrew-path-manipulation`: Flags non-standard path sanitization algorithms.

2. **`validate_auditor_hygiene`**:
   * `auditor-manual-file-walker`: Flags recursive directory walkers or custom `readdirSync` loops.
   * `auditor-homebrew-path-normalization`: Flags custom normalization functions.
