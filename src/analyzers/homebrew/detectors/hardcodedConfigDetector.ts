/**
 * src/analyzers/homebrew/detectors/hardcodedConfigDetector.ts
 *
 * Detects hardcoded candidate paths, candidate arrays, and inline ignore bypasses
 * in auditor suites and extensions instead of dynamic configuration-driven resolution.
 */

import { createLineDetector } from '../homebrewTypes.ts';

export const hardcodedConfigDetector = createLineDetector({
  id: 'hardcoded-config',
  ruleId: 'auditor-hardcoded-config',
  ruleDescription: 'Hardcoded paths or configs',
  checkLine(_line, trimmed) {
    // 1. Literal candidate directory arrays: e.g. ['migrations', 'supabase/migrations'] or ['src', 'app']
    const hasCandidateArray =
      /\[\s*['"`](?:migrations|supabase\/migrations|database\/migrations|src['"`]\s*,\s*['"`]app)['"`]/i.test(
        trimmed
      );
    if (hasCandidateArray) {
      return "Hardcoded candidate directory array detected. Resolve paths dynamically from 'config.paths' or 'audit.config.ts'.";
    }

    // 2. Hardcoded fallback directory arrays in nullish coalescing or unshift: e.g. unshift('supabase/migrations') or ?? ['migrations']
    const hasCandidatePush =
      /(?:\.push|\.unshift|\?\?)\s*(?:\(\s*)?['"`](?:supabase\/migrations|database\/migrations)['"`]/i.test(
        trimmed
      );
    if (hasCandidatePush) {
      return "Hardcoded fallback directory path detected. Exclusively use the configured path from 'config.paths.migrationsDir'.";
    }

    // 3. Candidate files array or magic file literals: e.g. ['visuals.ts', 'zLayers.ts'] or CANDIDATE_FILES = [...]
    const hasCandidateFiles =
      /(?:CANDIDATE_PATHS|FALLBACK_PATHS|CANDIDATE_FILES)\s*:\s*(?:readonly\s*)?string\[\]\s*=\s*\[/i.test(
        trimmed
      );
    if (hasCandidateFiles) {
      return 'Hardcoded candidate files list detected. Resolve paths dynamically from configuration.';
    }

    // 4. Hardcoded folder checking like file.includes('/types/') or relPath.includes('migrations') without consulting config
    const hasHardcodedPathExemption =
      /(?:file|relPath|filePath|path)\.(?:includes|startsWith)\s*\(\s*['"`](?:\/?(?:types|data|migrations|supabase|fixtures)\/|migrations|supabase\/migrations|database\/migrations)['"`]\s*\)/i.test(
        trimmed
      );
    if (hasHardcodedPathExemption) {
      return "Hardcoded path or directory check detected in sub-auditor ('/types/', '/data/', '/migrations/'). Resolve paths dynamically from 'config.paths' or canonical utilities.";
    }

    // 5. Fallback path arrays on config.paths: e.g. config.paths.srcRoots ?? ['src']
    const hasFallbackRootsArray =
      /(?:config|cfg|paths)\.(?:paths\.)?\w+Roots\s*\?\?\s*\[\s*['"`]/i.test(trimmed);
    if (hasFallbackRootsArray) {
      return "Hardcoded fallback roots array detected. Resolve paths directly from 'config.paths' without hardcoded fallbacks.";
    }

    return null;
  }
});
