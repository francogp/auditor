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

export interface GitIgnoreRule {
  readonly pattern: string;
  readonly isNegative: boolean;
  readonly isDirectoryOnly: boolean;
  readonly isRootRelative: boolean;
  readonly regex: RegExp;
}

export class GitIgnoreMatcher {
  private readonly rootDir: string;
  private readonly rules: GitIgnoreRule[] = [];
  private readonly ignoredDirPrefixes: string[] = [];

  constructor(rootDir: string = process.cwd(), customGitignorePath?: string) {
    this.rootDir = path.resolve(rootDir);
    const gitignorePath = customGitignorePath ?? path.join(this.rootDir, '.gitignore');
    this.loadRules(gitignorePath);
  }

  private loadRules(gitignorePath: string): void {
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

  private patternToRegex(pattern: string, isDirectoryOnly: boolean, isRootRelative: boolean): RegExp {
    let escaped = '';
    let i = 0;
    while (i < pattern.length) {
      const char = pattern[i];
      if (!char) {
        break;
      }
      if (char === '*') {
        if (pattern[i + 1] === '*') {
          // Double wildcard **
          if (pattern[i + 2] === '/') {
            escaped += '(?:.*/)?';
            i += 3;
            continue;
          } else {
            escaped += '.*';
            i += 2;
            continue;
          }
        } else {
          // Single wildcard * (matches any character except /)
          escaped += '[^/]*';
          i += 1;
          continue;
        }
      } else if (char === '?') {
        escaped += '[^/]';
        i += 1;
        continue;
      } else if (['.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'].includes(char)) {
        escaped += '\\' + char;
        i += 1;
        continue;
      } else {
        escaped += char;
        i += 1;
      }
    }

    let regexStr = isRootRelative ? `^${escaped}` : `(?:^|/)${escaped}`;
    if (isDirectoryOnly) {
      regexStr += `(?:/.*)?$`;
    } else {
      regexStr += `(?:/.*)?$`;
    }

    return new RegExp(regexStr);
  }

  /**
   * Evaluates if a given path (relative to rootDir or absolute) matches .gitignore rules.
   */
  public isIgnored(targetPath: string): boolean {
    let normalized = targetPath.replace(/\\/g, '/');

    // If absolute path, make it relative to rootDir
    if (path.isAbsolute(targetPath)) {
      const rel = path.relative(this.rootDir, targetPath).replace(/\\/g, '/');
      if (rel.startsWith('..')) {
        return false; // Outside root
      }
      normalized = rel;
    } else {
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
