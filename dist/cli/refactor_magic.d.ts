import { MagicNumberExtractor } from "../core/refactor/magicNumberExtractor.js";
export declare const REFACTOR_MAGIC_CLI_COMMAND = "auditor:magic";
export declare function handleMagicDiscover(projectRoot: string, extractor: MagicNumberExtractor): void;
export declare function handleMagicInspect(projectRoot: string, extractor: MagicNumberExtractor, targetFile: string | undefined): void;
export declare function handleMagicApply(projectRoot: string, rawPlanPath: string | undefined, useWorktree: boolean): Promise<void>;
export declare function executeMagicCli(parsed: Record<string, unknown>, createExtractor: (projectRoot: string) => MagicNumberExtractor): Promise<void>;
export declare function runRefactorMagicCli(rawInputArgs?: readonly string[]): Promise<void>;