/**
 * src/analyzers/homebrew/detectors/fileWalkerDetector.ts
 *
 * Detects custom recursive directory traversal functions (walkDir, getAllFiles)
 * instead of using BaseAuditor collectFiles() or collectRepositoryFiles().
 */
import type { HomebrewDetector } from '../homebrewTypes.ts';
export declare const fileWalkerDetector: HomebrewDetector;
//# sourceMappingURL=fileWalkerDetector.d.ts.map