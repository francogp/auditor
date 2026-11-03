/**
 * .agents/scripts/prevent_destructive_git.js
 *
 * HARD PRE-TOOL USE GIT & SATELLITE CONFIG SAFETY GATE FOR ANTIGRAVITY (@francogp/auditor)
 *
 * Intercepts 'run_command', 'write_file', and 'edit_file' invocations before execution:
 *   1. Blocks any destructive Git commands that discard uncommitted working tree
 *      modifications or rewrite commit history without explicit prior human approval.
 *   2. Blocks any direct write/edit to governed satellite configuration files (.fallowrc.json,
 *      vite.config.ts, .stylelintrc.json, tsconfig.json, .htmlvalidate.json, etc.).
 *
 * Instructs the AI agent to declare configuration changes in .auditor/audit.config.ts
 * and run 'npm run auditor:fix' for deterministic synchronization.
 */

import fs from 'node:fs';

const GOVERNED_SATELLITE_FILES = [
  ".fallowrc.json",
  ".fallowrc",
  ".fallowrc.js",
  ".fallowrc.cjs",
  "fallow.config.js",
  "fallow.config.ts",
  ".stylelintrc.json",
  ".stylelintrc",
  ".stylelintrc.js",
  ".stylelintrc.cjs",
  ".stylelintrc.mjs",
  "stylelint.config.js",
  "stylelint.config.cjs",
  "stylelint.config.mjs",
  ".htmlvalidate.json",
  ".htmlvalidate.js",
  ".htmlvalidate.cjs",
  ".markdownlint.json",
  ".markdownlint.yaml",
  ".markdownlint.yml",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tsconfig.vitest.json",
  "tsconfig.build.json",
  "tsconfig.ts7.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs"
];

function checkSatelliteRedirect(cmd) {
  if (!/>+|>>|\|\s*tee\b/i.test(cmd)) return false;
  for (const satFile of GOVERNED_SATELLITE_FILES) {
    if (cmd.includes(satFile)) {
      return satFile;
    }
  }
  return false;
}

function main() {
  try {
    const rawInput = fs.readFileSync(0, 'utf-8');
    if (!rawInput.trim()) {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      return;
    }

    const payload = JSON.parse(rawInput);
    const toolCall = payload.toolCall ?? {};
    const toolName = String(toolCall.name ?? '').trim();
    const args = toolCall.args ?? {};

    // 1. Guard against direct manual editing of satellite configuration files
    if (toolName === 'write_file' || toolName === 'edit_file') {
      const targetPath = String(args.Path ?? args.path ?? '').trim();
      const fileName = targetPath.split(/[\/\\]/).pop() || '';

      if (GOVERNED_SATELLITE_FILES.includes(fileName)) {
        let specificGuidance = '';
        if (fileName.startsWith('vite.config.')) {
          specificGuidance =
            '\n\nCANONICAL PATH FOR VITE PLUGINS & APPLICATION SETTINGS:\n' +
            '1. If you need to add, remove, or configure Vite plugins (e.g. vue(), vite-plugin-pwa, basicSsl(), custom plugins):\n' +
            '   Declare and configure them in "vite.plugins.ts". Editing "vite.plugins.ts" is 100% PERMITTED for both developers and AI agents.\n' +
            '2. If "vite.plugins.ts" does not exist yet and "vite.config.ts" has inline plugins:\n' +
            '   Run "npm run auditor:fix" to automatically migrate and extract plugins into "vite.plugins.ts".\n' +
            '3. If you encountered TypeScript error TS2321 (Excessive stack depth comparing types):\n' +
            '   Running "npm run auditor:fix" solves it automatically by isolating plugins to "vite.plugins.ts" as "PluginOption[]".\n' +
            '4. If you need linter/formatter/test rule or path adjustments:\n' +
            '   Declare them in ".auditor/audit.config.ts" and run "npm run auditor:fix".';
        }

        process.stdout.write(
          JSON.stringify({
            decision: 'deny',
            reason:
              '[SATELLITE CONFIG SOVEREIGNTY GATE] Direct manual editing of satellite configuration file "' +
              fileName +
              '" is STRICTLY PROHIBITED. All satellite configurations are derived artifacts owned exclusively by @francogp/auditor.\n\n' +
              'INSTRUCTION FOR AI AGENT:\n' +
              '1. Do NOT modify "' +
              fileName +
              '" directly with write_file or edit_file.\n' +
              '2. If an exemption, rule, threshold, or setting is required, declare it in ".auditor/audit.config.ts".\n' +
              '3. Run "npm run auditor:fix" so @francogp/auditor synchronizes and projects the configuration automatically.' +
              specificGuidance
          })
        );
        return;
      }
    }

    // 2. Guard against shell commands modifying satellite configurations or running destructive git
    if (toolName === 'run_command') {
      const cmd = String(args.CommandLine ?? '').trim();

      // Check for shell redirects into satellite configs
      const satFile = checkSatelliteRedirect(cmd);
      if (satFile) {
        process.stdout.write(
          JSON.stringify({
            decision: 'deny',
            reason: `[SATELLITE CONFIG SOVEREIGNTY GATE] Shell commands modifying satellite configuration file "${satFile}" are STRICTLY PROHIBITED. Declare changes in ".auditor/audit.config.ts" and run "npm run auditor:fix".`
          })
        );
        return;
      }

      // Regex matching destructive git actions
      const destructivePatterns = [
        // 1. git restore (discards uncommitted modifications or unstages files)
        /\bgit\b.*?\brestore\b/i,

        // 2. git checkout discarding working tree changes
        /\bgit\b.*?\bcheckout\s+(?:--\s+|-[a-zA-Z]*f[a-zA-Z]*\b|--force\b|\.\s*$|HEAD\s+--)/i,
        /\bgit\b.*?\bcheckout\s+(?!-b\b|-B\b|--orphan\b)[^\s]+\.(?:json|ts|js|mjs|cjs|vue|css|scss|md|html|ya?ml|lock|txt|sh|ps1)\b/i,

        // 3. git reset destructive (hard, merge, keep)
        /\bgit\b.*?\breset\s+--(?:hard|merge|keep)\b/i,

        // 4. git clean with force (-f, -fd, -df, -xdf, --force)
        /\bgit\b.*?\bclean\s+(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b/i,

        // 5. git push with force (--force, -f, --force-with-lease)
        /\bgit\b.*?\bpush\b.*?(?:--force\b|-f\b|--force-with-lease\b)/i,

        // 6. git branch destructive delete (-D, -d, --delete)
        /\bgit\b.*?\bbranch\s+(?:-[a-zA-Z]*[dD][a-zA-Z]*|--delete)\b/i
      ];

      const isDestructive = destructivePatterns.some((pattern) => pattern.test(cmd));

      if (isDestructive) {
        process.stdout.write(
          JSON.stringify({
            decision: 'deny',
            reason: `[GIT SAFETY GATE] Destructive command hard-blocked: "${cmd}". The repository governance strictly forbids AI agents from discarding working tree changes, reverting files with git checkout/restore, or forcing git operations. INSTRUCTION FOR AI AGENT: Do NOT attempt workarounds or alternative destructive commands. Explain to the human user that this destructive operation was blocked for safety, and provide them with the exact command so they can run it manually in their terminal if they choose:\n  ${cmd}`
          })
        );
        return;
      }
    }

    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  } catch {
    // If parsing fails, fail open or safely allow
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  }
}

main();
