/**
 * src/cli/make_executable.ts
 *
 * Cross-platform CLI utility to ensure compiled binaries in dist/cli/ have executable permissions (0o755)
 * and purge orphaned distribution files in dist/ whose corresponding source files in src/ were deleted.
 * Native Node.js 26+ execution: works cross-platform on Windows, Linux, and macOS without relying on POSIX chmod.
 */
export declare function purgeOrphanedDistFiles(distDir?: string, srcDir?: string): void;
export declare function makeCliBinariesExecutable(distDir?: string): void;
//# sourceMappingURL=make_executable.d.ts.map