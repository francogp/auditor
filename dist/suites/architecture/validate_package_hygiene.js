import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, getEffectiveScannableRoots } from "../../core/auditorBase.js";
import { getAuditConfig, AUDIT_CONFIG_FILE } from "../../core/auditConfig.js";
import { executeCliAndReadJson, resolvePackageBin } from "../../cli/cliUtils.js";
enableCompileCache();
export const PACKAGE_HYGIENE_RULES = [
    'package-unused-dependency',
    'package-unlisted-dependency',
    'package-unused-binary',
    'package-lockfile-integrity'
];
export function extractReferencedScriptDependencies(projectRoot) {
    const referenced = new Set();
    const pkgJsonPath = path.resolve(projectRoot, 'package.json');
    if (!fs.existsSync(pkgJsonPath))
        return referenced;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const scripts = pkg.scripts ? Object.values(pkg.scripts).join(' ') : '';
        const allDeps = [
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {})
        ];
        for (const dep of allDeps) {
            const cleanName = dep.startsWith('@') ? dep.split('/')[1] || dep : dep;
            const rootBin = cleanName.replace(/-cli$/, '');
            const escapedDep = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedRoot = rootBin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(?:^|[\\s"'\`;&|])(?:${escapedDep}|${escapedClean}|${escapedRoot})(?:[\\s"'\`;&|]|$)`, 'i');
            if (pattern.test(scripts)) {
                referenced.add(dep);
            }
        }
    }
    catch {
        // catch-ok: Ignore parse errors
    }
    return referenced;
}
function parseUnusedDeps(fileIssue, relFile, scriptReferencedDeps) {
    const allUnused = [
        ...(fileIssue.dependencies ?? []),
        ...(fileIssue.devDependencies ?? []),
        ...(fileIssue.optionalPeerDependencies ?? [])
    ];
    const findings = [];
    for (const dep of allUnused) {
        if (scriptReferencedDeps.has(dep.name))
            continue;
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-unused-dependency',
            ruleDescription: 'Dependencias: Dependencia no utilizada en package',
            severity: 'error',
            file: relFile,
            line: dep.line ?? 1,
            col: dep.col ?? 1,
            context: dep.name,
            message: `Dependencia no utilizada declarada en package.json: "${dep.name}"`
        });
    }
    return findings;
}
function parseUnlistedDeps(fileIssue, relFile) {
    return (fileIssue.unlisted ?? []).map(unlisted => ({
        suiteId: 'validate_package_hygiene',
        suiteName: 'Package & Dependency Hygiene Auditor',
        ruleId: 'package-unlisted-dependency',
        ruleDescription: 'Dependencias: Dependencia fantasma no declarada',
        severity: 'error',
        file: relFile,
        line: unlisted.line ?? 1,
        col: unlisted.col ?? 1,
        context: unlisted.name,
        message: `Dependencia fantasma no declarada en package.json importada en código: "${unlisted.name}"`
    }));
}
export function extractOwnPackageBinaries(projectRoot) {
    const binaries = new Set();
    const pkgJsonPath = path.resolve(projectRoot, 'package.json');
    if (!fs.existsSync(pkgJsonPath))
        return binaries;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (typeof pkg.bin === 'string') {
            if (pkg.name) {
                binaries.add(pkg.name.replace(/^@[^/]+\//, ''));
            }
        }
        else if (pkg.bin && typeof pkg.bin === 'object') {
            for (const binName of Object.keys(pkg.bin)) {
                binaries.add(binName);
            }
        }
    }
    catch {
        // catch-ok: Ignore parse errors
    }
    return binaries;
}
function parseUnusedBinaries(fileIssue, relFile, ownBinaries = new Set()) {
    return (fileIssue.binaries ?? [])
        .filter(bin => !ownBinaries.has(bin.name))
        .map(bin => ({
        suiteId: 'validate_package_hygiene',
        suiteName: 'Package & Dependency Hygiene Auditor',
        ruleId: 'package-unused-binary',
        ruleDescription: 'Dependencias: Binario o script no referenciado',
        severity: 'error',
        file: relFile,
        line: bin.line ?? 1,
        col: bin.col ?? 1,
        context: bin.name,
        message: `Binario o script ejecutable no referenciado en el proyecto: "${bin.name}"`
    }));
}
/**
 * Parses raw JSON output from Knip into canonical AuditFindings.
 */
export function parseKnipIssues(report, projectRoot = process.cwd(), isPathIgnored) {
    const issues = Array.isArray(report)
        ? report
        : (report && 'issues' in report && Array.isArray(report.issues) ? report.issues : []);
    const findings = [];
    const scriptReferencedDeps = extractReferencedScriptDependencies(projectRoot);
    const ownBinaries = extractOwnPackageBinaries(projectRoot);
    for (const fileIssue of issues) {
        const rawFile = fileIssue.file || 'package.json';
        const relFile = path.isAbsolute(rawFile)
            ? path.relative(projectRoot, rawFile).replace(/\\/g, '/')
            : rawFile.replace(/\\/g, '/');
        if (relFile !== 'package.json' && isPathIgnored?.(relFile)) {
            continue;
        }
        findings.push(...parseUnusedDeps(fileIssue, relFile, scriptReferencedDeps));
        findings.push(...parseUnlistedDeps(fileIssue, relFile));
        findings.push(...parseUnusedBinaries(fileIssue, relFile, ownBinaries));
    }
    return findings;
}
/**
 * Validates package-lock.json integrity, version standards, and absence of insecure HTTP registries.
 */
export function verifyLockfileIntegrity(projectRoot) {
    const findings = [];
    const lockfilePath = path.resolve(projectRoot, 'package-lock.json');
    const pkgJsonPath = path.resolve(projectRoot, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
        return findings;
    }
    if (!fs.existsSync(lockfilePath)) {
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-lockfile-integrity',
            ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
            severity: 'error',
            file: 'package-lock.json',
            line: 1,
            context: 'package-lock.json',
            message: 'No se encontró package-lock.json. El proyecto debe versionar el lockfile.'
        });
        return findings;
    }
    let rawContent;
    try {
        rawContent = fs.readFileSync(lockfilePath, 'utf-8');
    }
    catch (err) {
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-lockfile-integrity',
            ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
            severity: 'error',
            file: 'package-lock.json',
            line: 1,
            context: 'package-lock.json',
            message: `Error al leer package-lock.json: ${err instanceof Error ? err.message : String(err)}`
        });
        return findings;
    }
    // 1. Check for unresolved merge conflict markers
    const conflictMatch = /^(?:<<<<<<<|=======|>>>>>>>)/m.exec(rawContent);
    if (conflictMatch) {
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-lockfile-integrity',
            ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
            severity: 'error',
            file: 'package-lock.json',
            line: 1,
            context: 'merge-conflict',
            message: 'package-lock.json contiene marcadores de conflicto de merge sin resolver.'
        });
        return findings;
    }
    let lockfileJson;
    try {
        lockfileJson = JSON.parse(rawContent);
    }
    catch (err) {
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-lockfile-integrity',
            ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
            severity: 'error',
            file: 'package-lock.json',
            line: 1,
            context: 'json-syntax',
            message: `package-lock.json contiene JSON inválido: ${err instanceof Error ? err.message : String(err)}`
        });
        return findings;
    }
    // 2. Lockfile version check (must be lockfileVersion >= 3 for modern Node 18+)
    const lockfileVersion = lockfileJson.lockfileVersion;
    if (typeof lockfileVersion === 'number' && lockfileVersion < 3) {
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-lockfile-integrity',
            ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
            severity: 'error',
            file: 'package-lock.json',
            line: 1,
            context: `lockfileVersion: ${lockfileVersion}`,
            message: `lockfileVersion obsoleto (${lockfileVersion}). Se requiere lockfileVersion 3 (Node.js 18+ / npm v9+).`
        });
    }
    // 3. Insecure HTTP registry check (CWE-319 cleartext transmission / MitM hazard)
    if (/"resolved"\s*:\s*"http:\/\//.test(rawContent)) {
        findings.push({
            suiteId: 'validate_package_hygiene',
            suiteName: 'Package & Dependency Hygiene Auditor',
            ruleId: 'package-lockfile-integrity',
            ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
            severity: 'error',
            file: 'package-lock.json',
            line: 1,
            context: 'insecure-http-resolved',
            message: 'package-lock.json contiene resoluciones de paquetes insecure vía http:// no cifrado.'
        });
    }
    return findings;
}
export class ValidatePackageHygieneAuditor extends BaseAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            capabilities: { fix: true, heavy: true },
            fix: options.fix,
            id: 'validate_package_hygiene',
            name: 'Package & Dependency Hygiene Auditor',
            description: 'Higiene de dependencias huérfanas y fantasmas',
            family: 'architecture',
            packageName: 'Dependencias',
            configKey: 'packageHygiene.enabled',
            defaultConfig: { enabled: true },
            icon: '📦',
            ruleIds: PACKAGE_HYGIENE_RULES,
            ruleDescriptions: {
                'package-unused-dependency': 'Dependencia no utilizada en package',
                'package-unlisted-dependency': 'Dependencia fantasma no declarada',
                'package-unused-binary': 'Binario o script no referenciado',
                'package-lockfile-integrity': 'Lockfile corrupto o inseguro'
            },
            coverage: {
                include: ['package.json', 'package-lock.json']
            },
            projectRoot: effectiveRoot
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Package hygiene desactivado en config')) {
            return;
        }
        for (const r of PACKAGE_HYGIENE_RULES) {
            this.markRuleEvaluated(r);
        }
        this.recordScanned('package.json');
        if (fs.existsSync(path.resolve(this.projectRoot, 'package-lock.json'))) {
            this.recordScanned('package-lock.json');
        }
        const lockFindings = verifyLockfileIntegrity(this.projectRoot);
        for (const lf of lockFindings) {
            this.addViolation({
                ruleId: lf.ruleId,
                severity: lf.severity,
                file: lf.file,
                line: lf.line,
                col: lf.col,
                context: lf.context,
                message: lf.message
            });
        }
        const config = getAuditConfig(this.projectRoot);
        const scratchDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
        const cacheDir = path.resolve(this.projectRoot, 'scratch/cache');
        fs.mkdirSync(scratchDir, { recursive: true });
        fs.mkdirSync(cacheDir, { recursive: true });
        const rawOutPath = path.resolve(scratchDir, 'knip-raw.json');
        const cachePath = path.resolve(cacheDir, 'knip');
        if (fs.existsSync(rawOutPath)) {
            try {
                fs.unlinkSync(rawOutPath);
            }
            catch {
                // catch-ok: Best effort cleanup of stale raw report
            }
        }
        const ephemeralConfigPath = this.buildEphemeralKnipConfig(config, scratchDir);
        const report = this.executeKnip(ephemeralConfigPath, cachePath, rawOutPath);
        if (!report) {
            return;
        }
        this.processKnipFindings(report);
    }
    readFallowConfigData() {
        const fallowConfigPath = path.resolve(this.projectRoot, '.fallowrc.json');
        let fallowIgnoredDeps = []; // no-domain: Non-domain utility collection or data structure
        let fallowEntries = [];
        if (fs.existsSync(fallowConfigPath)) {
            try {
                const fallowJson = JSON.parse(fs.readFileSync(fallowConfigPath, 'utf-8'));
                if (Array.isArray(fallowJson.ignoreDependencies)) {
                    fallowIgnoredDeps = fallowJson.ignoreDependencies;
                }
                if (Array.isArray(fallowJson.entry)) {
                    fallowEntries = fallowJson.entry;
                }
            }
            catch {
                // catch-ok: Best effort read of fallow ignoreDependencies
            }
        }
        return { fallowEntries, fallowIgnoredDeps };
    }
    buildEphemeralKnipConfig(config, scratchDir) {
        const { fallowEntries, fallowIgnoredDeps } = this.readFallowConfigData();
        const customIgnoredDeps = config.packageHygiene?.ignoreDependencies ?? [];
        const scriptReferencedDeps = Array.from(extractReferencedScriptDependencies(this.projectRoot));
        const allIgnoredDeps = Array.from(new Set([...fallowIgnoredDeps, ...customIgnoredDeps, ...scriptReferencedDeps]));
        const customIgnoredBinaries = config.packageHygiene?.ignoreBinaries ?? [];
        const ownBinaries = Array.from(extractOwnPackageBinaries(this.projectRoot));
        const allIgnoredBinaries = Array.from(new Set([...customIgnoredBinaries, ...ownBinaries]));
        const customEntry = config.packageHygiene?.entry;
        const effectiveEntry = customEntry && customEntry.length > 0
            ? [...customEntry]
            : (fallowEntries.length > 0
                ? fallowEntries
                : [
                    'src/index.{ts,js}',
                    'src/main.{ts,js}',
                    'index.html',
                    AUDIT_CONFIG_FILE
                ]);
        const scannableRoots = getEffectiveScannableRoots(config);
        const customProject = config.packageHygiene?.project;
        const effectiveProject = customProject && customProject.length > 0
            ? [...customProject]
            : [
                ...scannableRoots.map(r => `${r}/**/*.{ts,vue,js,mjs,cjs,json}`),
                '*.{ts,js,mjs,cjs,json}'
            ];
        const ephemeralConfig = {
            $schema: 'https://unpkg.com/knip@5/overview/configuration-schema.json',
            entry: effectiveEntry,
            project: effectiveProject,
            ignore: [
                'dist/**',
                'scratch/**',
                'coverage/**',
                'skills/**',
                '.agents/**',
                '**/*.d.ts',
                ...(config.paths.ignoredDirs?.flatMap(d => [`${d}/**`, d]) ?? []),
                ...(config.paths.ignoredPatterns ?? []),
                ...(config.paths.ignoreGlobs ?? [])
            ],
            ignoreDependencies: allIgnoredDeps,
            ignoreBinaries: allIgnoredBinaries
        };
        const ephemeralConfigPath = path.resolve(scratchDir, 'knip-ephemeral.json');
        fs.writeFileSync(ephemeralConfigPath, JSON.stringify(ephemeralConfig, null, 2), 'utf-8');
        return ephemeralConfigPath;
    }
    executeKnip(ephemeralConfigPath, cachePath, rawOutPath) {
        const cliFlags = [
            '--config',
            ephemeralConfigPath,
            '--dependencies',
            '--reporter',
            'json',
            '--cache',
            '--cache-location',
            cachePath
        ];
        if (this.fixMode) {
            cliFlags.push('--fix', '--fix-type', 'dependencies');
        }
        const resolvedBin = resolvePackageBin('knip', {
            projectRoot: this.projectRoot,
            fallbackRelativeBin: 'bin/knip.js'
        });
        const command = resolvedBin ? process.execPath : 'npx';
        const finalArgs = resolvedBin
            ? [resolvedBin, ...cliFlags]
            : ['--yes', 'knip', ...cliFlags];
        return executeCliAndReadJson(command, finalArgs, rawOutPath, {
            cwd: this.projectRoot,
            shell: !resolvedBin
        });
    }
    processKnipFindings(report) {
        const findings = parseKnipIssues(report, this.projectRoot, (p) => this.isPathIgnored(p));
        for (const finding of findings) {
            if (finding.file && finding.file !== 'package.json' && this.isPathIgnored(finding.file)) {
                continue;
            }
            this.addViolation({
                ruleId: finding.ruleId ?? 'package-unused-dependency',
                severity: finding.severity,
                file: finding.file ?? 'package.json',
                line: finding.line ?? 1,
                context: finding.context ?? finding.message,
                message: finding.message
            });
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageHygieneAuditor());
//# sourceMappingURL=validate_package_hygiene.js.map