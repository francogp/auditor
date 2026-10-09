/**
 * @file migration-generator-sample.ts
 * @description Demonstrates the Dynamic Migration Generator pattern.
 * Compiles TypeScript constants (Single Source of Truth) into coordinated
 * PostgreSQL and SQLite migration pairs with synchronized system_config.db_version.
 */

import fsPromises from 'node:fs/promises';
import path from 'node:path';

// 1. Simulated domain Single Source of Truth maintained in application code
const SYSTEM_ROLES_WHITELIST = ['admin', 'operator', 'auditor', 'user'] as const;
type SystemRole = (typeof SYSTEM_ROLES_WHITELIST)[number];

export interface GeneratorOutput {
  pgSql: string;
  sqliteSql: string;
  timestamp: string;
  filename: string;
}

/**
 * Builds synchronized PostgreSQL and SQLite migration scripts from TypeScript constants.
 */
export function buildRoleSyncMigration(timestamp = '20261015140000'): GeneratorOutput {
  const filename = `${timestamp}_sync_system_roles_whitelist.sql`;
  const sqliteFilename = `${timestamp}_sync_system_roles_whitelist.sqlite.sql`;

  const pgRoleList = SYSTEM_ROLES_WHITELIST.map(r => `'${r}'`).join(', ');
  const sqliteRoleList = SYSTEM_ROLES_WHITELIST.map(r => `'${r}'`).join(', ');

  // PostgreSQL DDL with declarative check constraint & system_config update
  const pgSql = `-- ====================================================================
-- MIGRATION: Synchronize System Roles Whitelist (PostgreSQL)
-- Generated automatically from SYSTEM_ROLES_WHITELIST (TypeScript SSoT)
-- Timestamp: ${timestamp}
-- ====================================================================

-- 1. Ensure system_config tracking table exists
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Downgrade any obsolete role values to 'user'
UPDATE public.profiles
SET role = 'user'
WHERE role NOT IN (${pgRoleList});

-- 3. Replace constraint safely
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_role_whitelist;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_role_whitelist
CHECK (role IN (${pgRoleList}));

-- 4. Update system_config.db_version with filename timestamp
INSERT INTO public.system_config (key, value)
VALUES ('db_version', '${timestamp}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
`;

  // SQLite DDL (omits PL/pgSQL, uses SQLite-compatible syntax)
  const sqliteSql = `-- ====================================================================
-- MIGRATION: Synchronize System Roles Whitelist (SQLite Companion)
-- Generated automatically from SYSTEM_ROLES_WHITELIST (TypeScript SSoT)
-- Timestamp: ${timestamp}
-- ====================================================================

-- 1. Ensure system_config tracking table exists
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- 2. Downgrade obsolete roles
UPDATE profiles
SET role = 'user'
WHERE role NOT IN (${sqliteRoleList});

-- 3. Update system_config.db_version with filename timestamp
INSERT INTO system_config (key, value)
VALUES ('db_version', '"${timestamp}"')
ON CONFLICT (key) DO UPDATE SET value = '"${timestamp}"';
`;

  return {
    pgSql,
    sqliteSql,
    timestamp,
    filename
  };
}

// Example usage demonstration
if (import.meta.filename === process.argv[1]) {
  const result = buildRoleSyncMigration();
  console.log(`Generated migration: ${result.filename}`);
  console.log('--- PostgreSQL Output Snippet ---');
  console.log(result.pgSql.slice(0, 300) + '...\n');
  console.log('--- SQLite Companion Output Snippet ---');
  console.log(result.sqliteSql.slice(0, 300) + '...');
}
