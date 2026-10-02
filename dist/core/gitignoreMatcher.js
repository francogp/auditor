/**
 * scripts/lib/gitignoreMatcher.ts
 *
 * DYNAMIC GITIGNORE MATCHER (Node.js 26+ Native)
 * Reads and parses .gitignore rules dynamically to evaluate whether a file or directory
 * path is git-ignored, preventing auditors from enforcing the existence of transient,
 * scratch, or development artifacts in clean repositories or production.
 */
import fs from 'node:fs';
import path from 'node:path';
const REGEX_SPECIAL_CHARS = new Set(['.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\']);
function parseWildcardToken(pattern, index) {
    if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
            return { token: '(?:.*/)?', advance: 3 };
        }
        return { token: '.*', advance: 2 };
    }
    return { token: '[^/]*', advance: 1 };
}
function escapePatternChar(pattern, index) {
    const char = pattern[index];
    if (!char)
        return { token: '', advance: 1 };
    if (char === '*') {
        return parseWildcardToken(pattern, index);
    }
    if (char === '?') {
        return { token: '[^/]', advance: 1 };
    }
    if (REGEX_SPECIAL_CHARS.has(char)) {
        return { token: `\\${char}`, advance: 1 };
    }
    return { token: char, advance: 1 };
}
function convertGlobToRegexString(pattern) {
    let escaped = '';
    let i = 0;
    while (i < pattern.length) {
        const { token, advance } = escapePatternChar(pattern, i);
        escaped += token;
        i += advance;
    }
    return escaped;
}
export class GitIgnoreMatcher {
    rootDir;
    rules = [];
    ignoredDirPrefixes = [];
    constructor(rootDir = process.cwd(), customGitignorePath) {
        this.rootDir = path.resolve(rootDir);
        const gitignorePath = customGitignorePath ?? path.join(this.rootDir, '.gitignore');
        this.loadRules(gitignorePath);
    }
    loadRules(gitignorePath) {
        if (!fs.existsSync(gitignorePath)) {
            return;
        }
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            let pattern = trimmed;
            const isNegative = pattern.startsWith('!');
            if (isNegative) {
                pattern = pattern.slice(1).trim();
            }
            const isDirectoryOnly = pattern.endsWith('/');
            if (isDirectoryOnly) {
                pattern = pattern.slice(0, -1);
            }
            const isRootRelative = pattern.startsWith('/');
            if (isRootRelative) {
                pattern = pattern.slice(1);
            }
            // If simple directory prefix without glob wildcards, record fast lookup prefix
            if (!isNegative && !pattern.includes('*') && !pattern.includes('?') && !pattern.includes('[')) {
                this.ignoredDirPrefixes.push(pattern + '/');
                this.ignoredDirPrefixes.push(pattern);
            }
            const regex = this.patternToRegex(pattern, isDirectoryOnly, isRootRelative);
            this.rules.push({
                pattern,
                isNegative,
                isDirectoryOnly,
                isRootRelative,
                regex,
            });
        }
    }
    patternToRegex(pattern, _isDirectoryOnly, isRootRelative) {
        const escaped = convertGlobToRegexString(pattern);
        const prefix = isRootRelative ? '^' : '(?:^|/)';
        return new RegExp(`${prefix}${escaped}(?:/.*)?$`);
    }
    /**
     * Evaluates if a given path (relative to rootDir or absolute) matches .gitignore rules.
     */
    isIgnored(targetPath) {
        let normalized = targetPath.replace(/\\/g, '/');
        // If absolute path, make it relative to rootDir
        if (path.isAbsolute(targetPath)) {
            const rel = path.relative(this.rootDir, targetPath).replace(/\\/g, '/');
            if (rel.startsWith('..')) {
                return false; // Outside root
            }
            normalized = rel;
        }
        else {
            normalized = normalized.replace(/^\.\//, '');
        }
        // Fast-path for directory prefixes (e.g. scratch/, dist/, node_modules/)
        for (const prefix of this.ignoredDirPrefixes) {
            if (normalized === prefix || normalized.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')) {
                return true;
            }
        }
        let ignored = false;
        for (const rule of this.rules) {
            if (rule.regex.test(normalized)) {
                ignored = !rule.isNegative;
            }
        }
        return ignored;
    }
}
//# sourceMappingURL=gitignoreMatcher.js.map