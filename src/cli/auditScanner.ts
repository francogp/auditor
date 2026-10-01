/**
 * packages/auditor/src/cli/auditScanner.ts
 * 
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  type AuditFamily,
  type AuditTaskDefinition,
  resolveFamilyMetadata,
  getActiveFamilies
} from '../core/auditContract.ts';
import { loadAuditConfig } from '../core/auditConfig.ts';

const BUILTIN_SUITES_DIR = path.resolve(import.meta.dirname, '../suites');
const DEFAULT_TIMEOUT_MS = 60000;
const HEAVY_TIMEOUT_MS = 180000; // 3 minutes for full repo AST / DB migration validation

function getTimeoutForTask(filename: string): number {
  if (filename.includes('audit_project') || filename.includes('validate_type_check') || filename.includes('validate_eslint')) {
    return HEAVY_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

export const AUDIT_PRESETS = {
  lint: [
    'validate_domain_types',
    'validate_o1_data_structures',
    'validate_component_styles',
    'audit_project',
    'validate_vue_sfc_hygiene',
    'validate_console_cleanliness',
    'validate_audit_headers',
    'validate_type_check',
    'validate_markdown_lint',
    'validate_eslint',
    'validate_html_validate'
  ],
  md: [
    'validate_markdown_links',
    'validate_markdown_code_references',
    'validate_markdown_lint',
    'validate_markdown_syntax',
    'validate_dox_integrity'
  ]
} as const;

export const AST_DEPENDENT_SUITE_IDS = [
  'validate_pinia_reactivity',
  'validate_reactive_leaks',
  'validate_bundle_budget',
  'validate_duplicate_constants'
] as const;

export type AstDependentSuiteId = (typeof AST_DEPENDENT_SUITE_IDS)[number];

export const AST_DEPENDENT_SUITES: ReadonlySet<string> = new Set(AST_DEPENDENT_SUITE_IDS);

export type AuditPresetName = keyof typeof AUDIT_PRESETS;

export interface DiscoveryOptions {
  baseDir?: string;
  family?: string;
  task?: string;
  suites?: string[];
  preset?: string;
  fastOnly?: boolean;
}

const DEFAULT_PERMISSIONS = [
  '--permission',
  '--experimental-strip-types',
  '--allow-fs-read=*',
  '--allow-fs-write=*',
  '--allow-child-process',
  '--allow-addons'
] as const;

function getPermissionsForTask(filename: string): string[] {
  const perms: string[] = [...DEFAULT_PERMISSIONS]; // no-domain: Non-domain utility collection or data structure
  if (filename.includes('audit_project') || filename.includes('convert_assets')) {
    perms.push('--allow-worker');
  }
  return perms;
}

/** Convert snake_case or kebab-case filename to Title Case */
function formatTaskTitle(filename: string): string {
  if (filename === 'audit_project' || filename === 'audit_project.ts') {
    return 'Project Architecture & Style Rules';
  }
  const base = filename.replace(/\.ts$/, '').replace(/^(validate_|audit_)/, '');
  return base
    .split(/[_-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function discoverAuditors(options: DiscoveryOptions = {}): Promise<AuditTaskDefinition[]> {
  const config = await loadAuditConfig();
  const activeFamilies = getActiveFamilies(config.customFamilies);
  const builtInDir = BUILTIN_SUITES_DIR;
  const discovered: AuditTaskDefinition[] = [];

  const combinedPresets = {
    ...AUDIT_PRESETS,
    ...(config.presets ?? {})
  };

  // Resolve target suites from options.suites, options.task (comma-separated), or options.preset
  let targetSuiteIds: Set<string> | null = null;
  if (options.preset && options.preset in combinedPresets) {
    targetSuiteIds = new Set(combinedPresets[options.preset as keyof typeof combinedPresets]);
  }
  if (options.suites && options.suites.length > 0) {
    targetSuiteIds = new Set([...(targetSuiteIds ?? []), ...options.suites]);
  } else if (options.task && options.task.includes(',')) {
    const list = options.task.split(',').map(s => s.trim()).filter(Boolean);
    targetSuiteIds = new Set([...(targetSuiteIds ?? []), ...list]);
  }

  async function scanDirectory(currentDir: string, rootDir: string) {
    let entries: string[]; // no-domain: Non-domain utility collection or data structure
    try {
      entries = await fs.readdir(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        if (!entry.startsWith('_') && entry !== 'node_modules' && entry !== 'lib') {
          await scanDirectory(fullPath, rootDir);
        }
      } else if (stat.isFile() && entry.endsWith('.ts') && !entry.startsWith('_')) {
        // Skip unit tests, spec files, developer reporting tools, or rule definition modules
        if (entry.includes('.spec.') || entry.includes('.test.') || entry.startsWith('report_') || entry === 'audit_rules.ts') continue;

        // Relative path from rootDir to infer family
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        const segments = relPath.split('/');
        
        let family: AuditFamily = 'architecture';
        const firstSegment = segments[0];
        if (segments.length > 1 && firstSegment && (activeFamilies as readonly string[]).includes(firstSegment)) {
          family = firstSegment as AuditFamily;
        }

        const filename = path.basename(entry, '.ts');
        const id = filename;
        const name = formatTaskTitle(filename);
        const isFast = family === 'architecture' || filename.includes('domain_types');

        // Check if filter matches
        if (targetSuiteIds && !targetSuiteIds.has(id)) continue;
        if (options.family && options.family !== family) continue;
        if (options.task && !options.task.includes(',') && options.task !== id && !filename.includes(options.task)) continue;
        if (options.fastOnly && !isFast) continue;

        const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        const taskPermissions = getPermissionsForTask(filename);
        const taskArgs = [...taskPermissions, relScriptPath, '--json'];

        if (options.preset === 'lint' && id === 'audit_project') {
          taskArgs.push('--rule', 'fallow');
        } else if (options.preset === 'md' && id === 'audit_project') {
          taskArgs.push('--rule', 'dox');
        }

        const familyMeta = resolveFamilyMetadata(family, config.customFamilies);

        discovered.push({
          id,
          name,
          family,
          scriptPath: relScriptPath,
          command: 'node',
          args: taskArgs,
          fast: isFast,
          timeoutMs: getTimeoutForTask(filename),
          order: familyMeta.order,
          requiresAst: AST_DEPENDENT_SUITES.has(id),
          isBuiltin: true
        });
      }
    }
  }

  // 1. Scan directory: either explicit baseDir or built-in suites
  if (options.baseDir) {
    await scanDirectory(options.baseDir, options.baseDir);
  } else {
    await scanDirectory(builtInDir, builtInDir);
  }

  // 2. Discover and register external extensions from audit.config.ts
  if (!options.baseDir && config.extensions && config.extensions.length > 0) {
    for (const extPath of config.extensions) {
      const fullPath = path.resolve(process.cwd(), extPath);
      if (!fsSync.existsSync(fullPath)) continue;
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await scanDirectory(fullPath, fullPath);
      } else if (stat.isFile() && extPath.endsWith('.ts')) {
        const filename = path.basename(extPath, '.ts');
        const id = filename;
        const name = formatTaskTitle(filename);

        const normalized = extPath.replace(/\\/g, '/');
        let family: AuditFamily = 'domain_data';
        for (const fam of activeFamilies) {
          if (normalized.includes(`/${fam}/`)) {
            family = fam;
            break;
          }
        }

        const isFast = family === 'architecture' || filename.includes('domain_types');

        if (targetSuiteIds && !targetSuiteIds.has(id)) continue;
        if (options.family && options.family !== family) continue;
        if (options.task && !options.task.includes(',') && options.task !== id && !filename.includes(options.task)) continue;
        if (options.fastOnly && !isFast) continue;

        const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        const taskPermissions = getPermissionsForTask(filename);
        const taskArgs = [...taskPermissions, relScriptPath, '--json'];

        const familyMeta = resolveFamilyMetadata(family, config.customFamilies);

        discovered.push({
          id,
          name,
          family,
          scriptPath: relScriptPath,
          command: 'node',
          args: taskArgs,
          fast: isFast,
          timeoutMs: getTimeoutForTask(filename),
          order: familyMeta.order,
          requiresAst: AST_DEPENDENT_SUITES.has(id),
          isBuiltin: false
        });
      }
    }
  }

  // Sort discovered tasks deterministically by family order, then by filename
  discovered.sort((a, b) => {
    const familyDiff = (a.order ?? 99) - (b.order ?? 99);
    if (familyDiff !== 0) return familyDiff;
    return a.id.localeCompare(b.id);
  });

  return discovered;
}
