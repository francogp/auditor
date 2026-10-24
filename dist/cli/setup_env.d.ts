/**
 * src/cli/setup_env.ts
 *
 * Cross-platform Environment Setup Orchestrator (Node.js 26+ Native)
 * Automatically delegates to setup-linux.sh or setup-windows.ps1 based on platform.
 */
export declare function runSetup(rawInputArgs?: readonly string[], targetDir?: string): number;