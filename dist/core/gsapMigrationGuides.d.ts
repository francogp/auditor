/**
 * src/core/gsapMigrationGuides.ts
 *
 * Canonical remediation manuals for @francogp/domain-type/* Oxlint DOM-to-GSAP
 * migration rules, consumed by `npm run auditor:guide <ruleId>`.
 */
export declare const GSAP_DOM_MIGRATION_RULE_IDS: readonly ["@francogp/domain-type/no-dom-intersection-reveal", "@francogp/domain-type/no-scroll-mousemove-style-mutation", "@francogp/domain-type/no-smooth-scroll-into-view"];
export type GsapDomMigrationRuleId = (typeof GSAP_DOM_MIGRATION_RULE_IDS)[number];
export interface GsapMigrationRuleGuide {
  readonly description: string;
  readonly remediation: string;
}
export declare const GSAP_MIGRATION_RULE_GUIDES: Readonly<Record<GsapDomMigrationRuleId, GsapMigrationRuleGuide>>;