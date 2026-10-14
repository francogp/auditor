/**
 * src/analyzers/homebrew/detectors/inefficientFileScanDetector.ts
 *
 * Detects legacy inefficient file iteration patterns in sub-auditors and extensions:
 * 1. Rule-then-file nesting: Outer loop over rules with an inner loop reading files from disk.
 * 2. Blind wildcards: Passing recursive wildcard globs directly to external linters instead of passing discovered target files.
 */
import { type HomebrewDetector } from '../homebrewTypes.ts';
export declare const inefficientFileScanDetector: HomebrewDetector;
//# sourceMappingURL=inefficientFileScanDetector.d.ts.map