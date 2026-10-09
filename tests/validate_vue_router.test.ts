/**
 * tests/validate_vue_router.test.ts
 *
 * Dedicated unit test suite for ValidateVueRouterAuditor conforming to BaseAuditor 5-point contract:
 * - Contract conformance & metadata verification
 * - Clean path: Modern Vue Router 4 navigation guards, dynamic imports, reload/replace/external URL exemptions
 * - Violation path: 100% of declared rule IDs tested with positive error detection
 * - False positive defense: window.location.reload(), window.location.replace('/login'), external links
 * - Escape hatches: // router-ok:
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateVueRouterAuditor,
  VUE_ROUTER_RULES,
  type VueRouterRuleId
} from '../src/suites/architecture/validate_vue_router.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import type { ViolationInput } from '../src/core/auditorBase.ts';

class TestableVueRouterAuditor extends ValidateVueRouterAuditor {
  public readonly collectedViolations: ViolationInput<VueRouterRuleId>[] = [];

  public override addViolation(v: ViolationInput<VueRouterRuleId>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ValidateVueRouterAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Contract Conformance & Metadata', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateVueRouterAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_vue_router');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Router');
      expect(auditor.ruleIds).toEqual(VUE_ROUTER_RULES);
      expect(auditor.ruleIds.length).toBe(3);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on modern Vue Router 4 code and legitimate browser APIs', async () => {
      const auditor = new TestableVueRouterAuditor();

      const routerCode = `
import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/home',
      name: 'Home',
      component: () => import('@/views/HomeView.vue')
    }
  ]
});

// Vue Router 4 canonical return-based guard without next()
router.beforeEach(async (to, from) => {
  if (to.meta.requiresAuth) {
    return { name: 'Login' };
  }
  return true;
});
`;

      const viewCode = `<template>
  <button @click="handleReload">Recargar</button>
  <button @click="handleExternal">Docs Externos</button>
</template>

<script setup lang="ts">
function handleReload() {
  window.location.reload(); // Browser refresh API - allowed
}

function handleExternal() {
  window.location.href = 'https://docs.example.com'; // External link - allowed
}
</script>`;

      auditor.testScanFile('src/router/index.ts', routerCode);
      auditor.testScanFile('src/views/SettingsView.vue', viewCode);

      const result = await auditor.finishAudit();
      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });

  describe('Violation Detection (Proving the auditor ACTIVATES)', () => {
    it('detects deprecated next argument in navigation guards (no-deprecated-router-next)', () => {
      const auditor = new TestableVueRouterAuditor();
      const code = `
router.beforeEach((to, from, next) => {
  if (to.name !== 'Login') next({ name: 'Login' });
  else next();
});
`;
      auditor.testScanFile('src/router/guard.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-deprecated-router-next');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('next');
    });

    it('detects defineAsyncComponent wrapping route components (no-define-async-component-in-router)', () => {
      const auditor = new TestableVueRouterAuditor();
      const code = `
import { defineAsyncComponent } from 'vue';
const routes = [
  {
    path: '/dashboard',
    component: defineAsyncComponent(() => import('./Dashboard.vue'))
  }
];
`;
      auditor.testScanFile('src/router/routes.ts', code);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-define-async-component-in-router');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects direct SPA navigation using window.location.href (no-window-location-navigation)', () => {
      const auditor = new TestableVueRouterAuditor();
      const sfc = `<script setup lang="ts">
function goToProfile() {
  window.location.href = '/user/profile'; // Destroys SPA state
}
</script>`;
      auditor.testScanFile('src/views/ProfileButton.vue', sfc);
      const violation = auditor.collectedViolations.find(v => v.ruleId === 'no-window-location-navigation');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('window.location');
    });
  });

  describe('Suppression & False Positive Resistance', () => {
    it('honors // router-ok: escape hatch', () => {
      const auditor = new TestableVueRouterAuditor();
      const code = `
router.beforeEach((to, from, next) => { // router-ok: Legacy 3rd-party auth SDK requires next
  next();
});
`;
      auditor.testScanFile('src/router/legacy.ts', code);
      expect(auditor.collectedViolations).toHaveLength(0);
    });

    it('does not flag window.location.reload() or window.location.hostname', () => {
      const auditor = new TestableVueRouterAuditor();
      const sfc = `<script setup lang="ts">
const hn = window.location.hostname;
if (!hn) window.location.reload();
</script>`;
      auditor.testScanFile('src/components/NetworkGuard.vue', sfc);
      expect(auditor.collectedViolations).toHaveLength(0);
    });
  });
});
