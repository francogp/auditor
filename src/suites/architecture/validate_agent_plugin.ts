/**
 * src/suites/architecture/validate_agent_plugin.ts
 *
 * AGENT PLUGIN & SKILL INTEGRATION AUDITOR (Node.js 26+ Native)
 *
 * Verifies that the host project has properly integrated the official @francogp/auditor
 * AI agent plugin in `.agents/plugins.json` (via `auditor-init-agent` / `npm run init-agent`).
 * In --fix mode, automatically registers the plugin into `.agents/plugins.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import yaml from 'yaml';
import ts from 'typescript';
import { safeReadFileSync, safeJsonParse } from '../../core/safeUtils.ts';
import { SharedAstContext } from '../../core/astContext.ts';
import { isPathContained } from '../../core/safePath.ts';
import {
  BaseAuditor,
  type AuditorOptions,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { toPosixRelative } from '../../core/auditCoverage.ts';
import { getAuditConfig, loadAuditConfig, isSelfProviderProject } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import { initAgentSkill } from '../../cli/init_agent.ts';

enableCompileCache();

export type AgentPluginRuleId =
  | 'missing-agent-plugin-registration'
  | 'skill-invalid-yaml-frontmatter'
  | 'skill-invalid-asset-syntax';

export const AGENT_PLUGIN_RULES: readonly AgentPluginRuleId[] = [
  'missing-agent-plugin-registration',
  'skill-invalid-yaml-frontmatter',
  'skill-invalid-asset-syntax'
] as const;

/** Empty Set allows collecting all file types within skill directories. */
const ALL_SKILL_EXTENSIONS: ReadonlySet<string> = new Set();

interface ParsedSourceFile extends ts.SourceFile {
  parseDiagnostics?: readonly ts.Diagnostic[];
}

function extractSkillName(absFile: string, projectRoot: string, skillsRoots: readonly string[]): string {
  for (const root of skillsRoots) {
    const absRoot = path.resolve(projectRoot, root);
    if (isPathContained(absRoot, absFile)) {
      let current = absFile;
      while (current !== absRoot && path.dirname(current) !== absRoot) {
        current = path.dirname(current);
      }
      return path.basename(current);
    }
  }
  return path.basename(path.dirname(absFile));
}

function isPluginRegisteredInAgents(projectRoot: string, primaryAgentDir = '.agents'): boolean {
  const pluginsJsonPath = path.join(projectRoot, primaryAgentDir, 'plugins.json');
  const skillsJsonPath = path.join(projectRoot, primaryAgentDir, 'skills.json');

  const checkFile = (filePath: string): boolean => {
    if (!fs.existsSync(filePath)) return false;
    const raw = safeReadFileSync(filePath);
    if (!raw) return false;
    const data = safeJsonParse<{ entries?: Array<{ path: string }> }>(raw);
    if (!data || !Array.isArray(data.entries)) return false;
    return data.entries.some(
      (e: { path: string }) => e.path.includes('@francogp/auditor') || e.path.includes('packages/auditor')
    );
  };

  return checkFile(pluginsJsonPath) && checkFile(skillsJsonPath);
}

export class AgentPluginAuditor extends BaseAuditor<AgentPluginRuleId> {
  private readonly skillsRoots: readonly string[];
  private readonly primaryAgentDir: string;

  constructor(options: Partial<AuditorOptions<AgentPluginRuleId>> = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveRoot);
    const defaultRoots = DEFAULT_AUDIT_CONFIG.documentation?.skillsRoots ?? [];
    const skillsRoots = config.documentation?.skillsRoots?.length
      ? config.documentation.skillsRoots
      : defaultRoots;
    const skillsCoverageGlobs = skillsRoots.map((r) => `${r}/**`);
    const primaryAgentDir = path.posix.dirname(skillsRoots[0] || '.agents/skills');
    const pluginsJsonRel = path.posix.join(primaryAgentDir, 'plugins.json');
    const skillsJsonRel = path.posix.join(primaryAgentDir, 'skills.json');

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(
        AGENT_PLUGIN_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['missing-agent-plugin-registration']
      ),
      fixableRuleIds: ['missing-agent-plugin-registration'],
      id: 'validate_agent_plugin',
      name: 'Agent Plugin & Skill Integration Validator',
      description: 'Verifies agent audit plugin registration',
      family: 'architecture',
      ruleIds: AGENT_PLUGIN_RULES,
      ruleRemediationPhases: {
        'missing-agent-plugin-registration': 'setup',
        'skill-invalid-yaml-frontmatter': 'hygiene',
        'skill-invalid-asset-syntax': 'hygiene'
      },
      packageName: 'Agent',
      configKey: 'agentPlugin.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🤖',
      ruleDescriptions: {
        'missing-agent-plugin-registration': 'Plugin/skills unregistered in .agents',
        'skill-invalid-yaml-frontmatter': 'Invalid YAML frontmatter in SKILL.md',
        'skill-invalid-asset-syntax': 'Syntax error in skill asset file (JSON/TS)'
      },
      ruleRemediations: {
        'missing-agent-plugin-registration':
          '📖 REMEDIATION GUIDE: missing-agent-plugin-registration\n' +
          '1. Root Cause: The host project does not have the `@francogp/auditor` plugin registered in `.agents/plugins.json` or lacks the corresponding skills catalog in `.agents/skills/`.\n' +
          '2. Diagnosis: Check if `.agents/plugins.json` exists and references the auditor plugin.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run canonical auto-fix: `npm run auditor:fix` or `auditor fix` to automatically register the plugin and sync skills.\n' +
          '   b) Or run `auditor-init` in the host project.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'skill-invalid-yaml-frontmatter':
          '📖 REMEDIATION GUIDE: skill-invalid-yaml-frontmatter\n' +
          '1. Root Cause: A `SKILL.md` file contains syntax errors in its YAML frontmatter (commonly unquoted colons `: ` or missing folded scalar `>-`), or lacks required `name` and `description` fields.\n' +
          '2. Diagnosis: Run `npm run auditor:agent-plugin` to identify the specific skill and YAML parser error message.\n' +
          '3. Canonical Solution: Use the folded scalar block `description: >-` for multi-line or special-character descriptions. Ensure `name: <name>` matches the skill folder name.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Before (Invalid): description: Rule: description\n' +
          '   - After (Canonical): description: >-\n' +
          '       Rule: description',
        'skill-invalid-asset-syntax':
          '📖 REMEDIATION GUIDE: skill-invalid-asset-syntax\n' +
          '1. Root Cause: A secondary asset file within an agent skill (such as an evaluation schema in evals/*.json, blueprint *.json, or code template/example *.ts) contains malformed JSON or TypeScript syntax errors.\n' +
          '2. Diagnosis: Run `npm run auditor:findings -- rule=skill-invalid-asset-syntax` to inspect the reported file and parser error message.\n' +
          '3. Canonical Solution: Repair the JSON syntax (ensure double quotes on keys, remove trailing commas) or fix TypeScript syntax errors in the reported template/example file.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Inspect and repair syntax in the target file, then verify with `npm run auditor:agent-plugin`.'
      },
      coverage: {
        include: [pluginsJsonRel, skillsJsonRel, ...skillsCoverageGlobs]
      },
      unignoreDirs: [primaryAgentDir],
      ...options
    });
    this.skillsRoots = skillsRoots;
    this.primaryAgentDir = primaryAgentDir;
  }

  private async checkGating(): Promise<boolean> {
    const config =
      this.projectRoot !== process.cwd()
        ? await loadAuditConfig(this.projectRoot)
        : getAuditConfig();
    if (config.agentPlugin?.enabled === false) {
      this.context.setMetric('Agent Plugin Status', 'Disabled');
      this.markRuleNotApplicable(
        'missing-agent-plugin-registration',
        'config.agentPlugin.enabled = false'
      );
      this.markRuleNotApplicable(
        'skill-invalid-yaml-frontmatter',
        'config.agentPlugin.enabled = false'
      );
      this.markRuleNotApplicable(
        'skill-invalid-asset-syntax',
        'config.agentPlugin.enabled = false'
      );
      return true;
    }
    return false;
  }

  private tryAutoFixPlugin(): boolean {
    if (!this.isFixActive()) return false;
    this.context.logProgress('Auto-fixing missing agent plugin registration...');
    const result = initAgentSkill({ targetDir: this.projectRoot });
    if (result.success) {
      this.context.logProgress(`✅ ${result.message}`);
      this.context.setMetric('Agent Plugin Status', 'Auto-Fixed');
      return true;
    }
    return false;
  }

  private reportMissingPluginViolation(): void {
    const pluginsJsonRel = path.posix.join(this.primaryAgentDir, 'plugins.json');
    const skillsJsonRel = path.posix.join(this.primaryAgentDir, 'skills.json');
    const pluginsJsonPath = path.join(this.projectRoot, pluginsJsonRel);
    const skillsJsonPath = path.join(this.projectRoot, skillsJsonRel);
    const missingFiles: string[] = [];
    if (!fs.existsSync(pluginsJsonPath)) missingFiles.push(pluginsJsonRel);
    if (!fs.existsSync(skillsJsonPath)) missingFiles.push(skillsJsonRel);
    const targetFile = missingFiles[0] || pluginsJsonRel;

    this.addViolation({
      ruleId: 'missing-agent-plugin-registration',
      severity: 'error',
      file: targetFile,
      line: 1,
      message:
        `Agent audit plugin and/or skills are not registered in ${pluginsJsonRel} and ${skillsJsonRel}. Run: npm run auditor:init-agent`,
      context: 'auditor:init-agent',
      fixable: true
    });
    this.context.setMetric('Agent Plugin Status', 'Missing');
  }

  private validateSkillFrontmatter(skillMdPath: string, skillName: string): void {
    const relMdPath = toPosixRelative(this.projectRoot, skillMdPath);
    this.recordScanned(relMdPath);
    const content = fs.readFileSync(skillMdPath, 'utf8');

    if (!content.startsWith('---')) {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `File ${skillName}/SKILL.md does not contain frontmatter delimited by '---'`,
        context: skillName
      });
      return;
    }

    const parts = content.split('---');
    if (parts.length < 3) {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `Frontmatter of ${skillName}/SKILL.md is not closed with '---'`,
        context: skillName
      });
      return;
    }

    const frontmatterRaw = parts[1]!;
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = yaml.parse(frontmatterRaw);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `YAML syntax error in frontmatter of ${skillName}/SKILL.md: ${errMsg.split('\n')[0]}`,
        context: skillName
      });
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `Frontmatter of ${skillName}/SKILL.md is not a valid YAML object`,
        context: skillName
      });
      return;
    }

    this.validateSkillName(parsed, relMdPath, skillName);
    this.validateSkillDescription(parsed, frontmatterRaw, relMdPath, skillName);
  }

  private validateSkillName(
    parsed: Record<string, unknown>,
    relMdPath: string,
    skillName: string
  ): void {
    if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `Missing 'name' field in frontmatter of ${skillName}/SKILL.md`,
        context: skillName
      });
    } else if (parsed.name.trim() !== skillName) {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `Skill name '${parsed.name}' does not match directory name '${skillName}' in ${skillName}/SKILL.md`,
        context: skillName
      });
    }
  }

  private validateSkillDescription(
    parsed: Record<string, unknown>,
    frontmatterRaw: string,
    relMdPath: string,
    skillName: string
  ): void {
    if (!parsed.description || typeof parsed.description !== 'string' || !parsed.description.trim()) {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `Missing 'description' field in frontmatter of ${skillName}/SKILL.md`,
        context: skillName
      });
      return;
    }

    if (parsed.description.trim().length < 10) {
      this.addViolation({
        ruleId: 'skill-invalid-yaml-frontmatter',
        severity: 'error',
        file: relMdPath,
        line: 1,
        message: `Skill description in ${skillName}/SKILL.md is too short (must be at least 10 characters)`,
        context: skillName
      });
      return;
    }

    const descMatch = frontmatterRaw.match(/^description:\s*([^\r\n]*)/m);
    if (!descMatch) return;

    const lineAfterDesc = descMatch[1]?.trim() ?? '';
    const isFoldedOrBlock = lineAfterDesc.startsWith('>') || lineAfterDesc.startsWith('|');
    const isQuoted =
      (lineAfterDesc.startsWith('"') && lineAfterDesc.endsWith('"')) ||
      (lineAfterDesc.startsWith("'") && lineAfterDesc.endsWith("'"));

    if (!isFoldedOrBlock && !isQuoted && lineAfterDesc.length > 0) {
      if (lineAfterDesc.includes(': ') || lineAfterDesc.includes('!')) {
        this.addViolation({
          ruleId: 'skill-invalid-yaml-frontmatter',
          severity: 'error',
          file: relMdPath,
          line: 1,
          message: `Unquoted single-line 'description' in ${skillName}/SKILL.md contains ': ' or '!'. Use folded block scalar ('description: >-') or quote the string for Go YAML / Antigravity compatibility.`,
          context: skillName
        });
      }
    }
  }

  private validateSkillAsset(
    relPath: string,
    absPath: string,
    skillName: string,
    astEngine: SharedAstContext
  ): void {
    const ext = path.extname(relPath).toLowerCase();
    if (ext === '.json') {
      const raw = safeReadFileSync(absPath);
      if (raw) {
        try {
          JSON.parse(raw);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.addViolation({
            ruleId: 'skill-invalid-asset-syntax',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `JSON syntax error in skill asset '${relPath}': ${errMsg}`,
            context: skillName
          });
        }
      }
    } else if (ext === '.ts' || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      const raw = safeReadFileSync(absPath);
      if (raw) {
        const sourceFile = astEngine.getSourceFile(absPath, raw) as ParsedSourceFile;
        const diagnostics = sourceFile.parseDiagnostics;
        if (diagnostics && diagnostics.length > 0) {
          const first = diagnostics[0]!;
          const message =
            typeof first.messageText === 'string'
              ? first.messageText
              : first.messageText.messageText;
          const { line } = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0);
          this.addViolation({
            ruleId: 'skill-invalid-asset-syntax',
            severity: 'error',
            file: relPath,
            line: line + 1,
            message: `TypeScript syntax error in skill asset '${relPath}': ${message}`,
            context: skillName
          });
        }
      }
    }
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    if (await this.checkGating()) return;

    const pluginsJsonRel = path.posix.join(this.primaryAgentDir, 'plugins.json');
    const skillsJsonRel = path.posix.join(this.primaryAgentDir, 'skills.json');
    for (const registryFile of [pluginsJsonRel, skillsJsonRel]) {
      if (fs.existsSync(path.join(this.projectRoot, registryFile))) {
        this.recordScanned(registryFile);
      }
    }

    if (isSelfProviderProject(this.projectRoot)) {
      this.context.setMetric('Agent Plugin Status', 'Provider Validated');
      this.markRuleNotApplicable(
        'missing-agent-plugin-registration',
        'Provider project for @francogp/auditor (self-registered)'
      );
    } else {
      this.runSubAuditorSync('missing-agent-plugin-registration', () => {
        if (isPluginRegisteredInAgents(this.projectRoot, this.primaryAgentDir)) {
          this.context.setMetric('Agent Plugin Status', 'Registered');
          return;
        }

        if (this.tryAutoFixPlugin()) return;

        this.reportMissingPluginViolation();
      });
    }

    const astEngine = astContext ?? new SharedAstContext();
    const collectedFiles = this.context.collectFiles(this.skillsRoots, ALL_SKILL_EXTENSIONS);

    const skillMdFiles: Array<{ absFile: string; skillName: string }> = [];
    const skillAssetFiles: Array<{ absFile: string; relFile: string; skillName: string }> = [];

    for (const absFile of collectedFiles) {
      const relFile = toPosixRelative(this.projectRoot, absFile);
      this.recordScanned(relFile);
      const skillName = extractSkillName(absFile, this.projectRoot, this.skillsRoots);
      if (path.basename(absFile) === 'SKILL.md') {
        skillMdFiles.push({ absFile, skillName });
      } else {
        skillAssetFiles.push({ absFile, relFile, skillName });
      }
    }

    this.runSubAuditorSync('skill-invalid-yaml-frontmatter', () => {
      for (const { absFile, skillName } of skillMdFiles) {
        this.validateSkillFrontmatter(absFile, skillName);
      }
    });

    this.runSubAuditorSync('skill-invalid-asset-syntax', () => {
      for (const { absFile, relFile, skillName } of skillAssetFiles) {
        this.validateSkillAsset(relFile, absFile, skillName, astEngine);
      }
    });
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AgentPluginAuditor());
