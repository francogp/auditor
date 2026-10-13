/**
 * src/core/auditorMinimums.ts
 *
 * SSoT for mandatory minimum library versions exposed to host projects.
 * The floor of every library is the range declared in the `peerDependencies`
 * of `@francogp/auditor/package.json`. Zero hardcoded versions in code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function getAuditorMinimumVersions() {
    const auditorPackageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    if (fs.existsSync(auditorPackageJsonPath)) {
        const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, 'utf8'));
        if (data.peerDependencies && Object.keys(data.peerDependencies).length > 0) {
            return data.peerDependencies;
        }
    }
    throw new Error(`[getAuditorMinimumVersions] Could not read peerDependencies from @francogp/auditor package.json (${auditorPackageJsonPath}). Hardcoded fallbacks are strictly prohibited.`);
}
//# sourceMappingURL=auditorMinimums.js.map