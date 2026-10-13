import fs from 'node:fs';
import path from 'node:path';
const NPMRC_ALLOW_GIT_LINE = 'allow-git=all';
/**
 * npm 12+ blocks git dependencies by default (`allow-git=none`). Persists `allow-git=all` in the
 * host `.npmrc` so plain `npm install` / `npm update` resolve `github:francogp/auditor#semver:*`.
 */
export function ensureNpmrcAllowGit(projectRoot) {
    const npmrcPath = path.join(projectRoot, '.npmrc');
    const current = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf-8') : '';
    const lines = current.split(/\r?\n/);
    if (lines.some((line) => line.trim() === NPMRC_ALLOW_GIT_LINE))
        return false;
    const kept = lines.filter((line) => !/^\s*allow-git\s*=/.test(line) && line.trim() !== '');
    fs.writeFileSync(npmrcPath, [...kept, NPMRC_ALLOW_GIT_LINE, ''].join('\n'), 'utf-8');
    return true;
}
//# sourceMappingURL=npmrcAllowGit.js.map