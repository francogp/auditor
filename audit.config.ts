import { defineAuditConfig } from './src/core/auditConfig.ts';

export default defineAuditConfig({
  name: '@francogp/auditor',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['src/cli'],
    codeRoots: ['src'],
    cliRoots: ['src/cli', 'src/core', 'src/suites', 'src/analyzers'],
    ignoreGlobs: ['node_modules/**', 'dist/**', 'scratch/**', '.agents/**'],
    ignoredDirs: ['skills', '.agents']
  },
  persistence: {
    engine: 'none',
    schemaQualified: false
  },
  domain: {
    enabled: false,
    finiteDomainTypes: [],
    infraIdWhitelist: []
  },
  bundle: {
    enabled: false
  },
  styles: {
    zLayersEnabled: false
  },
  templates: {
    requireInputIds: false
  },
  agentPlugin: {
    enabled: true
  },
  fallow: {
    enabled: true,
    security: {
      enabled: false // Herramienta CLI sin servidores ni endpoints de red
    },
    enforceTargets: false,
    maxTargetPriority: 'critical',
    similarCode: {
      enabled: true,
      threshold: 0.95,
      ignoreSameFile: true
    }
  },
  constants: {
    allowedNumericPrefixes: ['BASE_']
  },
  presets: {
    commit: [
      'validate_dox_integrity',
      'validate_markdown_syntax',
      'validate_markdown_code_references',
      'validate_markdown_links',
      'validate_markdown_lint',
      'validate_type_check',
      'validate_eslint',
      'validate_console_cleanliness',
      'validate_audit_headers',
      'validate_auditor_tests',
      'validate_test_fragmentation',
      'validate_build_tools',
      'validate_agent_plugin',
      'validate_bundle_budget',
      'validate_duplicate_constants',
      'validate_ephemeral_storage_isolation'
    ]
  }
});
