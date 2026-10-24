import { ExtractedCommand } from "./npmCommandUtils.js";
export declare function inspectCommandTokens(bin: string, words: readonly string[], lineNum: number, rawText: string, out: ExtractedCommand[]): void;
/**
 * Extracts npm and npx commands from shell scripts (.sh, .bash, .zsh) using unbash AST.
 */
export declare function extractCommandsFromShell(content: string): ExtractedCommand[];
/**
 * Extracts npm and npx commands from GitHub Actions and YAML workflows using yaml parser + unbash.
 */
export declare function extractCommandsFromYaml(content: string): ExtractedCommand[];
/**
 * Extracts npm and npx commands from Dockerfiles (RUN instructions) using unbash.
 */
export declare function extractCommandsFromDockerfile(content: string): ExtractedCommand[];
/**
 * Extracts npm and npx commands from PowerShell (.ps1) and Windows Batch (.bat, .cmd) scripts
 * using a sentence-level lexical parser with string masking and comment filtering.
 */
export declare function extractCommandsFromPowerShell(content: string, ext?: string): ExtractedCommand[];
/**
 * Extracts npm and npx commands from TypeScript and JavaScript maintenance scripts
 * using TypeScript Compiler AST (inspecting process runner calls and CLI help/diagnostic logs).
 */
export declare function extractCommandsFromTypeScript(content: string, filePath: string): ExtractedCommand[];
/**
 * Extracts commands from an executable script or CI/CD configuration,
 * dispatching to the appropriate AST or structured parser based on file type.
 */
export declare function extractScriptCommands(content: string, filePath: string): ExtractedCommand[];