/**
 * src/core/auditorMinimums.ts
 *
 * SSoT for mandatory minimum library versions exposed to host projects.
 * The floor of every library is the range declared in the `peerDependencies`
 * of `@francogp/auditor/package.json`. Zero hardcoded versions in code.
 */
export type AuditorMinimumVersions = Readonly<Record<string, string>>;
export declare function getAuditorMinimumVersions(): AuditorMinimumVersions;
//# sourceMappingURL=auditorMinimums.d.ts.map