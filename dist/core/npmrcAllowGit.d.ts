/**
 * npm 12+ blocks git dependencies by default (`allow-git=none`). Persists `allow-git=all` in the
 * host `.npmrc` so plain `npm install` / `npm update` resolve `github:francogp/auditor#semver:*`.
 */
export declare function ensureNpmrcAllowGit(projectRoot: string): boolean;
//# sourceMappingURL=npmrcAllowGit.d.ts.map