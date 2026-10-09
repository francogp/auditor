/**
 * src/analyzers/homebrew/detectors/fileWalkerDetector.ts
 *
 * Detects custom recursive directory traversal functions (walkDir, getAllFiles)
 * instead of using BaseAuditor collectFiles() or collectRepositoryFiles().
 */
import { createLineDetector } from "../homebrewTypes.js";
export const fileWalkerDetector = createLineDetector({
    id: 'file-walker',
    ruleId: 'auditor-manual-file-walker',
    ruleDescription: 'Recorrido recursivo manual de dirs',
    checkLine(line) {
        // Skip AST node walkers
        if (/\b(?:node|child)\s*:\s*(?:ts\.)?Node\b/.test(line) || /\bts\.forEachChild\b/.test(line)) {
            return null;
        }
        const isDirectoryWalkerName = /\bfunction\s+(?:walkDir|walkFiles|getAllFiles|getFilesRecursively|collectAllFiles)\s*\(/.test(line) ||
            /\bconst\s+(?:walkDir|walkFiles|getAllFiles|getFilesRecursively|collectAllFiles)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/.test(line);
        const isGenericWalkWithDir = /\b(?:function\s+walk\s*\(|const\s+walk\s*=\s*(?:async\s*)?\(\s*)(?:dir|directory|folder|dirPath|currentDir)\b/.test(line);
        if (isDirectoryWalkerName || isGenericWalkWithDir) {
            return "Función de recorrido recursivo manual de directorios detectada. Usa 'this.context.collectFiles()', 'collectRepositoryFiles()' o extiende 'FileScanAuditor'.";
        }
        return null;
    }
});
//# sourceMappingURL=fileWalkerDetector.js.map