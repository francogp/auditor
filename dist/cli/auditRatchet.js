/**
 * src/cli/auditRatchet.ts
 *
 * Warning ratchet for full `audit` runs. Every warning is fingerprinted by content
 * (suite, rule, file, normalized source line, occurrence index) and compared against the
 * baseline committed at the configured production ref. Any fingerprint missing from the
 * production baseline is a NEW warning and fails the run. The local baseline can only shrink.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const BASELINE_SCHEMA_VERSION = 1;
const FINGERPRINT_HEX_LENGTH = 16;
const FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/u;
export const RATCHET_SOURCES = ['production', 'local-bootstrap'];
function runGit(projectRoot, args) {
    const proc = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: proc.status === 0, stdout: proc.stdout ?? '' };
}
/** True when `ref` resolves to a commit in the repository at `projectRoot`. */
export function resolveGitCommit(projectRoot, ref) {
    return runGit(projectRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok;
}
function toPosixRelative(projectRoot, file) {
    return path.relative(projectRoot, path.resolve(projectRoot, file)).split(path.sep).join('/');
}
function createLineReader(projectRoot) {
    const cache = new Map();
    return (file, line) => {
        const lines = cache.getOrInsertComputed(file, () => {
            const absolute = path.resolve(projectRoot, file);
            return fs.existsSync(absolute) && fs.statSync(absolute).isFile()
                ? fs.readFileSync(absolute, 'utf-8').split(/\r?\n/u)
                : null;
        });
        const text = lines?.[line - 1];
        return text === undefined ? null : text.trim().replaceAll(/\s+/gu, ' ');
    };
}
function hashKey(key) {
    return createHash('sha256').update(key).digest('hex').slice(0, FINGERPRINT_HEX_LENGTH);
}
/** Fingerprints every warning of the run. Stable across line shifts, sensitive to content edits. */
function fingerprintWarnings(results, projectRoot) {
    const readLine = createLineReader(projectRoot);
    const keyed = results.flatMap(result => (result.findings ?? [])
        .filter(f => f.severity === 'warning')
        .map(finding => {
        const ruleId = finding.ruleId ?? 'unknown-rule';
        const file = finding.file ? toPosixRelative(projectRoot, finding.file) : null;
        const lineText = file && finding.line ? readLine(file, finding.line) : null;
        const anchor = lineText ?? finding.context ?? finding.message;
        return { suiteId: result.id, ruleId, file, finding, key: [result.id, ruleId, file ?? '', anchor].join('|') };
    }));
    keyed.sort((a, b) => a.key.localeCompare(b.key) || (a.finding.line ?? 0) - (b.finding.line ?? 0));
    const occurrences = new Map();
    return keyed.map(({ key, ...entry }) => {
        const index = occurrences.get(key) ?? 0;
        occurrences.set(key, index + 1);
        return { ...entry, fingerprint: hashKey(`${key}|${index}`) };
    });
}
function isBaselineEntry(value) {
    const v = value;
    return typeof v.fingerprint === 'string' && FINGERPRINT_PATTERN.test(v.fingerprint) &&
        typeof v.suiteId === 'string' && typeof v.ruleId === 'string' &&
        (v.file === null || typeof v.file === 'string');
}
function parseBaseline(raw, origin) {
    const data = JSON.parse(raw);
    const candidate = data;
    if (candidate === null || candidate.schemaVersion !== BASELINE_SCHEMA_VERSION || !Array.isArray(candidate.warnings) ||
        !candidate.warnings.every(e => typeof e === 'object' && e !== null && isBaselineEntry(e))) {
        throw new Error(`[Ratchet] Invalid warning baseline at ${origin}: expected { schemaVersion: ${BASELINE_SCHEMA_VERSION}, warnings: [{ fingerprint, suiteId, ruleId, file }] }.`);
    }
    return candidate;
}
/** Returns a human-readable defect for a malformed local baseline, or null when it is valid. */
export function describeBaselineDefect(projectRoot, baselineFile) {
    const raw = fs.readFileSync(path.resolve(projectRoot, baselineFile), 'utf-8');
    try {
        parseBaseline(raw, baselineFile);
        return null;
    }
    catch (err) {
        // catch-ok: the defect is returned to the caller, which reports it as a blocking audit error.
        return err instanceof Error ? err.message : String(err);
    }
}
function readProductionBaseline(projectRoot, ratchet) {
    if (!resolveGitCommit(projectRoot, ratchet.productionRef)) {
        throw new Error(`[Ratchet] Production ref '${ratchet.productionRef}' does not resolve to a commit. Run 'git fetch' or fix 'ratchet.productionRef' in audit.config.ts.`);
    }
    const listed = runGit(projectRoot, ['ls-tree', '--name-only', ratchet.productionRef, '--', ratchet.baselineFile]);
    if (!listed.ok || listed.stdout.trim() === '')
        return null;
    const shown = runGit(projectRoot, ['show', `${ratchet.productionRef}:${ratchet.baselineFile}`]);
    if (!shown.ok) {
        throw new Error(`[Ratchet] Failed to read '${ratchet.baselineFile}' from '${ratchet.productionRef}'.`);
    }
    return parseBaseline(shown.stdout, `${ratchet.productionRef}:${ratchet.baselineFile}`);
}
function readLocalBaseline(projectRoot, ratchet) {
    const absolute = path.resolve(projectRoot, ratchet.baselineFile);
    return fs.existsSync(absolute) ? parseBaseline(fs.readFileSync(absolute, 'utf-8'), ratchet.baselineFile) : null;
}
function loadAuthoritativeBaseline(projectRoot, ratchet) {
    const production = readProductionBaseline(projectRoot, ratchet);
    const local = readLocalBaseline(projectRoot, ratchet);
    if (production === null) {
        if (local === null) {
            throw new Error(`[Ratchet] No warning baseline found locally nor at '${ratchet.productionRef}'. Bootstrap it with 'npm run audit -- --init-baseline' and commit '${ratchet.baselineFile}'.`);
        }
        return { baseline: local, source: 'local-bootstrap' };
    }
    if (local === null) {
        throw new Error(`[Ratchet] '${ratchet.baselineFile}' exists at '${ratchet.productionRef}' but is missing locally. Restore it with 'git checkout ${ratchet.productionRef} -- ${ratchet.baselineFile}'.`);
    }
    const productionSet = new Set(production.warnings.map(w => w.fingerprint));
    const injected = local.warnings.filter(w => !productionSet.has(w.fingerprint));
    if (injected.length > 0) {
        throw new Error(`[Ratchet] Local '${ratchet.baselineFile}' contains ${injected.length} fingerprint(s) absent from '${ratchet.productionRef}'. The baseline can only shrink; new warnings must be fixed, never baselined.`);
    }
    return { baseline: production, source: 'production' };
}
function serializeBaseline(warnings) {
    const entries = warnings
        .map(({ fingerprint, suiteId, ruleId, file }) => ({ fingerprint, suiteId, ruleId, file }))
        .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
    const baseline = { schemaVersion: BASELINE_SCHEMA_VERSION, warnings: entries };
    return `${JSON.stringify(baseline, null, 2)}\n`;
}
/**
 * Compares the run's warnings with the production baseline.
 * When `allowShrink` is set and no new warning exists, rewrites the local baseline to the current (smaller) set,
 * carrying over entries of suites skipped in this run.
 */
export function runWarningRatchet(projectRoot, ratchet, results, allowShrink) {
    const { baseline, source } = loadAuthoritativeBaseline(projectRoot, ratchet);
    const current = fingerprintWarnings(results, projectRoot);
    const known = new Set(baseline.warnings.map(w => w.fingerprint));
    // Skipped suites produced no findings this run: their baseline entries are carried over, never counted as resolved.
    const skippedSuites = new Set(results.filter(r => r.status === 'skipped').map(r => r.id));
    const carried = baseline.warnings.filter(w => skippedSuites.has(w.suiteId));
    const currentSet = new Set(current.map(w => w.fingerprint));
    const newWarnings = current.filter(w => !known.has(w.fingerprint)).map(w => w.finding);
    const resolvedCount = baseline.warnings.filter(w => !skippedSuites.has(w.suiteId) && !currentSet.has(w.fingerprint)).length;
    const absolute = path.resolve(projectRoot, ratchet.baselineFile);
    const serialized = serializeBaseline([...current, ...carried]);
    const baselineUpdated = allowShrink && newWarnings.length === 0 && fs.readFileSync(absolute, 'utf-8') !== serialized;
    if (baselineUpdated)
        fs.writeFileSync(absolute, serialized, 'utf-8');
    return { source, newWarnings, resolvedCount, baselineUpdated };
}
/** Writes the first baseline. Refused when the production ref already carries one. */
export function initWarningBaseline(projectRoot, ratchet, results) {
    if (readProductionBaseline(projectRoot, ratchet) !== null) {
        throw new Error(`[Ratchet] '${ratchet.baselineFile}' already exists at '${ratchet.productionRef}'. The baseline can only shrink; fix new warnings instead of re-initializing.`);
    }
    const current = fingerprintWarnings(results, projectRoot);
    const absolute = path.resolve(projectRoot, ratchet.baselineFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, serializeBaseline(current), 'utf-8');
    return current.length;
}
//# sourceMappingURL=auditRatchet.js.map