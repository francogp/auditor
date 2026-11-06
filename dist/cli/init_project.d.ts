/**
 * src/cli/init_project.ts
 *
 * UNIFIED DAY-0 PROJECT INITIALIZATION ENGINE (Node.js 26+ Native)
 *
 * Sets up a 100% compliant, zero-defect repository from scratch:
 *   1. Initializes Git (`git init -b main`) if not already present.
 *   2. Guarantees `package.json` with `"type": "module"` and canonical scripts.
 *   3. Scaffolds initial `src/` and `tests/` directories with working baseline files.
 *   4. Generates canonical root `AGENTS.md` with all mandatory governance contracts.
 *   5. Bootstraps `.auditor/audit.config.ts` and synchronizes all satellite configs
 *      (`tsconfig.json`, `vite.config.ts`, `.fallowrc.json`, `.stylelintrc.json`).
 *   6. Registers AI agent skills in `.agents/plugins.json`.
 *   7. Automatically runs `npm install` to keep `package-lock.json` in sync.
 *
 * Usage:
 *   npx @francogp/auditor init
 *   npm run auditor:init
 *   auditor init
 */
export interface InitProjectOptions {
  readonly projectRoot?: string;
  readonly install?: boolean;
  readonly quiet?: boolean;
}
export interface InitProjectResult {
  readonly gitInitialized: boolean;
  readonly packageCreated: boolean;
  readonly agentsCreated: boolean;
  readonly configBootstrapped: boolean;
  readonly tsconfigCreated: boolean;
  readonly dependenciesInstalled: boolean;
}
export declare function initProject(options?: InitProjectOptions): Promise<InitProjectResult>;