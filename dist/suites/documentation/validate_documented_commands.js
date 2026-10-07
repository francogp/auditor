/**
 * src/suites/documentation/validate_documented_commands.ts
 *
 * DOCUMENTED COMMANDS AUDITOR (Node.js 26+)
 * Recursively audits ALL repository documentation (.md, AGENTS.md, docs/, .agents/skills/)
 * and guarantees that:
 * 1. Every documented `npm run <script>` strictly exists in `package.json.scripts`.
 * 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
 * 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
 */
import fsSync from 'node:fs';
import path from 'node:path';
import { BaseAuditor, ALWAYS_IGNORE_DIRS, matchesSinglePattern } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { isAuditableCodebaseFile } from "../../core/auditCoverage.js";
export const DOCUMENTED_COMMANDS_RULES = [
    'documented-cmd-unregistered-npm',
    'documented-cmd-invalid-npm-syntax',
    'documented-cmd-unregistered-npx'
];
export const VALID_NPM_BUILTINS = new Set([
    'access', 'adduser', 'audit', 'bugs', 'cache', 'ci', 'completion',
    'config', 'dedupe', 'deprecate', 'diff', 'dist-tag', 'docs', 'doctor',
    'edit', 'empty', 'exec', 'explain', 'explore', 'find-dupes', 'fund',
    'get', 'help', 'hook', 'init', 'install', 'install-ci-test', 'install-test',
    'link', 'll', 'login', 'logout', 'ls', 'org', 'outdated', 'owner',
    'pack', 'ping', 'pkg', 'prefix', 'profile', 'prune', 'publish', 'rebuild',
    'repo', 'restart', 'root', 'run', 'run-script', 'search', 'set', 'set-script',
    'shrinkwrap', 'star', 'stars', 'start', 'stop', 'team', 'test', 'token',
    'uninstall', 'unpublish', 'unstar', 'update', 'version', 'view', 'whoami',
    'info', 'show', 'why', 'query',
    // short aliases:
    'c', 'i', 'r', 'rb', 'rm', 's', 'se', 't', 'tst', 'up', 'v'
]);
function isPlaceholder(token) {
    if (!token)
        return true;
    const t = token.trim();
    return (t.startsWith('<') ||
        t.endsWith('>') ||
        t.startsWith('[') ||
        t.endsWith(']') ||
        t.startsWith('{') ||
        t.endsWith('}') ||
        t.includes('...') ||
        t.includes('${') ||
        t.includes('*') ||
        t === 'xxx' ||
        t === 'target' ||
        t === 'name' ||
        t === 'script' ||
        t === 'script-name' ||
        t === 'command' ||
        t === 'arg');
}
function addPackageDependenciesToBins(deps, declaredBins) {
    for (const dep of Object.keys(deps ?? {})) {
        declaredBins.add(dep);
        if (dep.startsWith('@')) {
            const sub = dep.split('/')[1];
            if (sub)
                declaredBins.add(sub);
        }
    }
}
function populateBinsFromPackageJson(pkgPath, scripts, declaredBins) {
    try {
        if (!fsSync.existsSync(pkgPath))
            return;
        const pkg = JSON.parse(fsSync.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts) {
            for (const k of Object.keys(pkg.scripts))
                scripts.add(k);
        }
        if (typeof pkg.bin === 'string' && pkg.name) {
            const binName = pkg.name.startsWith('@') ? pkg.name.split('/')[1] : pkg.name;
            if (binName)
                declaredBins.add(binName);
        }
        else if (pkg.bin && typeof pkg.bin === 'object') {
            for (const k of Object.keys(pkg.bin))
                declaredBins.add(k);
        }
        addPackageDependenciesToBins(pkg.dependencies, declaredBins);
        addPackageDependenciesToBins(pkg.devDependencies, declaredBins);
    }
    catch {
        // catch-ok: Unreadable package.json
    }
}
function populateInstalledBins(binDir, installedBins) {
    try {
        if (fsSync.existsSync(binDir)) {
            for (const entry of fsSync.readdirSync(binDir)) {
                const cleanName = entry.replace(/\.(cmd|ps1|exe)$/i, '');
                installedBins.add(cleanName);
            }
        }
    }
    catch {
        // catch-ok: Unreadable node_modules/.bin
    }
    installedBins.add('node');
    installedBins.add('npm');
    installedBins.add('npx');
    installedBins.add('git');
}
export function loadPackageScriptsAndBins(rootDir) {
    const scripts = new Set();
    const declaredBins = new Set();
    const installedBins = new Set();
    populateBinsFromPackageJson(path.resolve(rootDir, 'package.json'), scripts, declaredBins);
    populateInstalledBins(path.resolve(rootDir, 'node_modules/.bin'), installedBins);
    return { scripts, declaredBins, installedBins };
}
export const DOCUMENTED_COMMAND_TYPES = ['npm-run', 'npm-direct', 'npx'];
const SHELL_BLOCK_LANGS = new Set([
    'bash', 'sh', 'shell', 'zsh', 'cmd', 'powershell', 'ps1', 'terminal', 'console'
]);
function parseBlockCommandLine(trimmed, isShellBlock, lineNum, commands) {
    const hasShellPrompt = /^[$>#]\s+/.test(trimmed);
    if (!isShellBlock && !hasShellPrompt)
        return;
    const cleanLine = trimmed.replace(/^[$>#]\s+/, '');
    if (!cleanLine || cleanLine.startsWith('#'))
        return;
    const segments = cleanLine.split(/&&|\|\||;/);
    for (const seg of segments) {
        parseCommandLine(seg.trim(), lineNum, commands);
    }
}
function parseInlineCommands(rawLine, lineNum, commands) {
    const backtickRegex = /`([^`]+)`/g;
    let match;
    while ((match = backtickRegex.exec(rawLine)) !== null) {
        parseCommandLine(match[1].trim(), lineNum, commands);
    }
}
export function extractDocumentedCommands(content) {
    const commands = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let isShellBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            isShellBlock = inCodeBlock && SHELL_BLOCK_LANGS.has(trimmed.slice(3).trim().toLowerCase());
            continue;
        }
        if (inCodeBlock) {
            parseBlockCommandLine(trimmed, isShellBlock, lineNum, commands);
        }
        else {
            parseInlineCommands(rawLine, lineNum, commands);
        }
    }
    return commands;
}
function parseCommandLine(text, lineNum, out) {
    if (!text)
        return;
    // 1. npm run <script>
    const npmRunMatch = text.match(/\b(?:npm|pnpm|bun)\s+run\s+([^\s;&|]+)/);
    if (npmRunMatch && npmRunMatch[1]) {
        out.push({
            lineNum,
            rawText: text,
            type: 'npm-run',
            target: npmRunMatch[1]
        });
        return;
    }
    // 2. npm <cmd> (e.g. npm test, npm install, or invalid npm foo)
    const npmDirectMatch = text.match(/\bnpm\s+([^\s;&|]+)/);
    if (npmDirectMatch && npmDirectMatch[1]) {
        out.push({
            lineNum,
            rawText: text,
            type: 'npm-direct',
            target: npmDirectMatch[1]
        });
        return;
    }
    // 3. npx <bin> (stripping CLI flags like -y, --yes, --no-install)
    const npxMatch = text.match(/\b(?:npx|pnpm\s+dlx|yarn\s+dlx|bunx)\s+(?:-[\w-]+(?:=\S+)?\s+)*([^\s;&|]+)/);
    if (npxMatch && npxMatch[1] && !npxMatch[1].startsWith('-')) {
        out.push({
            lineNum,
            rawText: text,
            type: 'npx',
            target: npxMatch[1]
        });
    }
}
function evaluateNpmRunViolation(cmd, relPosix, scripts) {
    if (!scripts.has(cmd.target)) {
        return {
            ruleId: 'documented-cmd-unregistered-npm',
            severity: 'error',
            file: relPosix,
            line: cmd.lineNum,
            message: `El comando documentado 'npm run ${cmd.target}' no está registrado en package.json.scripts.`,
            context: cmd.rawText
        };
    }
    return null;
}
function evaluateNpmDirectViolation(cmd, relPosix, scripts) {
    if (VALID_NPM_BUILTINS.has(cmd.target)) {
        if (cmd.target === 'test' && !scripts.has('test')) {
            return {
                ruleId: 'documented-cmd-unregistered-npm',
                severity: 'error',
                file: relPosix,
                line: cmd.lineNum,
                message: `El comando documentado 'npm test' requiere un script 'test' en package.json.`,
                context: cmd.rawText
            };
        }
        return null;
    }
    if (scripts.has(cmd.target)) {
        return {
            ruleId: 'documented-cmd-invalid-npm-syntax',
            severity: 'error',
            file: relPosix,
            line: cmd.lineNum,
            message: `Sintaxis incorrecta: se documentó 'npm ${cmd.target}', pero debe ser 'npm run ${cmd.target}'.`,
            context: cmd.rawText
        };
    }
    return {
        ruleId: 'documented-cmd-invalid-npm-syntax',
        severity: 'error',
        file: relPosix,
        line: cmd.lineNum,
        message: `'npm ${cmd.target}' no es un comando nativo de npm ni un script registrado.`,
        context: cmd.rawText
    };
}
function evaluateNpxViolation(cmd, relPosix, env) {
    const binName = cmd.target.startsWith('@') ? (cmd.target.split('/')[1] || cmd.target) : cmd.target;
    const isKnownBin = env.installedBins.has(binName) ||
        env.declaredBins.has(cmd.target) ||
        env.declaredBins.has(binName) ||
        env.allowedNpx.has(cmd.target) ||
        env.allowedNpx.has(binName);
    if (!isKnownBin) {
        return {
            ruleId: 'documented-cmd-unregistered-npx',
            severity: 'error',
            file: relPosix,
            line: cmd.lineNum,
            message: `El binario documentado 'npx ${cmd.target}' no existe en node_modules/.bin ni está declarado en package.json ni en config.documentation.allowedNpxBinaries.`,
            context: cmd.rawText
        };
    }
    return null;
}
export function evaluateCommandViolation(cmd, relPosix, env) {
    if (isPlaceholder(cmd.target))
        return null;
    if (cmd.type === 'npm-run') {
        return evaluateNpmRunViolation(cmd, relPosix, env.scripts);
    }
    if (cmd.type === 'npm-direct') {
        return evaluateNpmDirectViolation(cmd, relPosix, env.scripts);
    }
    if (cmd.type === 'npx') {
        return evaluateNpxViolation(cmd, relPosix, env);
    }
    return null;
}
export class ValidateDocumentedCommandsAuditor extends BaseAuditor {
    rootDir;
    gitIgnoreMatcher;
    constructor(options = {}) {
        const root = options.projectRoot || process.cwd();
        super({
            capabilities: { md: true },
            id: 'validate_documented_commands',
            name: 'Documented Commands Validator',
            description: 'Valida comandos npm/npx documentados en markdown',
            family: 'documentation',
            packageName: 'Comandos',
            configKey: 'documentation.enabled',
            defaultConfig: { enabled: true },
            icon: '⌨️',
            ruleIds: DOCUMENTED_COMMANDS_RULES,
            ruleDescriptions: {
                'documented-cmd-unregistered-npm': 'Script npm run no registrado',
                'documented-cmd-invalid-npm-syntax': 'Comando npm directo no válido',
                'documented-cmd-unregistered-npx': 'Binario npx no registrado'
            },
            coverage: {
                include: ['**/*.md']
            },
            projectRoot: root
        });
        this.rootDir = root;
        this.gitIgnoreMatcher = new GitIgnoreMatcher(root);
    }
    auditSingleMarkdownFile(absFile, customExemptGlobs, env) {
        const relPosix = path.relative(this.rootDir, absFile).split(path.sep).join(path.posix.sep);
        if (!isAuditableCodebaseFile(relPosix, customExemptGlobs) || this.gitIgnoreMatcher.isIgnored(absFile)) {
            return;
        }
        this.recordScanned(relPosix);
        let content;
        try {
            content = fsSync.readFileSync(absFile, 'utf8');
        }
        catch {
            // catch-ok: Unreadable file
            return;
        }
        const commands = extractDocumentedCommands(content);
        for (const cmd of commands) {
            const violation = evaluateCommandViolation(cmd, relPosix, env);
            if (violation) {
                this.addViolation(violation);
            }
        }
    }
    async runAudit() {
        const { scripts, declaredBins, installedBins } = loadPackageScriptsAndBins(this.rootDir);
        const mdFiles = this.collectAllMarkdownFiles(this.rootDir);
        if (mdFiles.length === 0) {
            for (const rule of DOCUMENTED_COMMANDS_RULES) {
                this.markRuleNotApplicable(rule, 'No se encontraron archivos markdown para auditar');
            }
            return;
        }
        for (const rule of DOCUMENTED_COMMANDS_RULES) {
            this.markRuleEvaluated(rule);
        }
        const config = getAuditConfig(this.rootDir);
        const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map(e => e.glob);
        const allowedNpx = new Set(config.documentation?.allowedNpxBinaries ?? []);
        const env = { scripts, declaredBins, installedBins, allowedNpx };
        for (const absFile of mdFiles) {
            this.auditSingleMarkdownFile(absFile, customExemptGlobs, env);
        }
    }
    collectAllMarkdownFiles(dir) {
        const results = [];
        const config = getAuditConfig(this.rootDir);
        const configIgnoredDirs = (config.paths?.ignoredDirs ?? []).map(d => d.toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')); // no-domain: Non-domain utility collection or data structure
        const configGlobs = config.paths?.ignoreGlobs ?? [];
        try {
            const entries = fsSync.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                const nameLower = entry.name.toLowerCase();
                if (ALWAYS_IGNORE_DIRS.has(nameLower)) {
                    continue;
                }
                const relPosix = path.relative(this.projectRoot, full).replaceAll('\\', '/');
                const relLower = relPosix.toLowerCase(); // no-domain: Non-domain utility collection or data structure
                const segments = relLower.split('/');
                if (segments.some(seg => ALWAYS_IGNORE_DIRS.has(seg) || configIgnoredDirs.includes(seg))) {
                    continue;
                }
                if (configGlobs.some(pattern => matchesSinglePattern(relLower, pattern))) {
                    continue;
                }
                if (entry.isDirectory()) {
                    results.push(...this.collectAllMarkdownFiles(full));
                }
                else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
                    results.push(full);
                }
            }
        }
        catch {
            // catch-ok: Unreadable directory
        }
        return results;
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDocumentedCommandsAuditor());
//# sourceMappingURL=validate_documented_commands.js.map