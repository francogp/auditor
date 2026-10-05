/**
 * src/cli/migrateAuditConfig.ts
 *
 * One-shot relocation of a root-level `audit.config.ts` / `audit.config.json` into `.auditor/`,
 * invoked by `auditor fix`. Relative module specifiers of the TypeScript config are rewritten through
 * the TypeScript AST so they keep resolving from the new directory.
 */
/** Moves legacy root configuration files into `.auditor/`. Returns the moved file names. */
export declare function migrateLegacyAuditConfig(projectRoot: string): string[];
//# sourceMappingURL=migrateAuditConfig.d.ts.map