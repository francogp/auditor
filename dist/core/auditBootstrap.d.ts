/**
 * src/core/auditBootstrap.ts
 *
 * ZERO-SETUP PRE-FLIGHT AUTO-BOOTSTRAP ENGINE (Node.js 26+ Native)
 *
 * Ensures that any host repository executing @francogp/auditor:
 *   1. Has a valid .auditor/audit.config.ts initialized with 100% of discovered
 *      sub-auditors and extension sections populated with their canonical defaults.
 *   2. Automatically detects missing configuration sections when @francogp/auditor
 *      is updated or new suites/extensions are added, injecting them via TypeScript AST.
 *   3. Automatically registers the auditor plugin and skills in .agents/plugins.json
 *      and .agents/skills.json so Antigravity AI agents immediately discover capabilities.
 *   4. Ensures required .gitignore entries exist (scratch/, .auditor/audit-baseline.json).
 *   5. Ensures .npmrc contains allow-git=all so plain `npm install` and `npm update` resolve Git-hosted dependencies on npm 12+.
 *
 * Runs transparently during pre-flight in local environments while strictly
 * respecting CI environments (never mutating files unexpectedly during CI runs).
 */
export interface BootstrapResult {
  readonly configCreated: boolean;
  readonly configUpdated: boolean;
  readonly versionUpdated: boolean;
  readonly previousVersion?: string;
  readonly currentVersion: string;
  readonly agentsRegistered: boolean;
  readonly gitIgnoreUpdated: boolean;
  readonly sectionsInjected: readonly string[];
}
export interface BootstrapOptions {
  readonly projectRoot?: string;
  readonly force?: boolean;
}
export declare function ensureProjectBootstrapped(options?: BootstrapOptions): Promise<BootstrapResult>;