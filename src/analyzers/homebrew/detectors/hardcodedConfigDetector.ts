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
  ruleDescription: 'Rutas o configs hardcodeadas',
  checkLine(_line, trimmed) {
    if (trimmed.includes('hardcoded-config-ok') || trimmed.includes('homebrew-ok')) return null;

    // 1. Literal candidate directory arrays: e.g. ['migrations', 'supabase/migrations'] or ['src', 'app']
    const hasCandidateArray =
      /\[\s*['"`](?:migrations|supabase\/migrations|database\/migrations|src['"`]\s*,\s*['"`]app)['"`]/i.test(
        trimmed
      );
    if (hasCandidateArray) {
      return "Array de rutas candidatas hardcodeadas detectado. Resuelve las rutas dinámicamente desde 'config.paths' o 'audit.config.ts'.";
    }

    // 2. Hardcoded fallback directory arrays in nullish coalescing or unshift: e.g. unshift('supabase/migrations') or ?? ['migrations']
    const hasCandidatePush =
      /(?:\.push|\.unshift|\?\?)\s*(?:\(\s*)?['"`](?:supabase\/migrations|database\/migrations)['"`]/i.test(
        trimmed
      );
    if (hasCandidatePush) {
      return "Ruta de directorio fallback hardcodeada detectada. Usa únicamente la ruta configurada en 'config.paths.migrationsDir'.";
    }

    // 3. Candidate files array or magic file literals: e.g. ['visuals.ts', 'zLayers.ts'] or CANDIDATE_FILES = [...]
    const hasCandidateFiles =
      /(?:CANDIDATE_PATHS|FALLBACK_PATHS|CANDIDATE_FILES)\s*:\s*(?:readonly\s*)?string\[\]\s*=\s*\[/i.test(
        trimmed
      );
    if (hasCandidateFiles) {
      return 'Lista fija de archivos candidatos hardcodeada detectada. Resuelve las rutas desde la configuración.';
    }

    // 4. Hardcoded folder checking like file.includes('/types/') or relPath.includes('migrations') without consulting config
    const hasHardcodedPathExemption =
      /(?:file|relPath|filePath|path)\.(?:includes|startsWith)\s*\(\s*['"`](?:\/?(?:types|data|migrations|supabase|fixtures)\/|migrations|supabase\/migrations|database\/migrations)['"`]\s*\)/i.test(
        trimmed
      );
    if (hasHardcodedPathExemption && !trimmed.includes('// path-ok:')) {
      return "Comprobación de ruta o directorio hardcodeada detectada en el sub-auditor ('/types/', '/data/', '/migrations/'). Resuelve las rutas dinámicamente desde 'config.paths' o utilidades canónicas.";
    }

    // 5. Fallback path arrays on config.paths: e.g. config.paths.srcRoots ?? ['src']
    const hasFallbackRootsArray =
      /(?:config|cfg|paths)\.(?:paths\.)?\w+Roots\s*\?\?\s*\[\s*['"`]/i.test(trimmed);
    if (hasFallbackRootsArray) {
      return "Array de rutas fallback hardcodeadas detectado. Resuelve las rutas directamente desde 'config.paths' sin fallback hardcodeado.";
    }

    return null;
  }
});
