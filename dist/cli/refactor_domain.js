#!/usr/bin/env -S node --experimental-strip-types
import { isMainModule } from "./cliUtils.js";
import { DomainRefactorEngine } from "../core/refactor/domainRefactorEngine.js";
import { formatCliRelativeFilePath, runRefactorCliHarness } from "../core/refactor/refactorCliHarness.js";
import { styleText } from "node:util";
// src/cli/refactor_domain.ts
/**
* src/cli/refactor_domain.ts
*
* CANONICAL DOMAIN TYPE & BRANDED ID REFACTORING CLI (Node.js 26+ Native)
* Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
* for naked string parameters, unfrozen domain catalogs, and unbranded ID types.
*/
const domainCliDef = {
	toolName: "auditor-domain",
	toolDescription: "parameters with naked strings, mutable catalogs, unbranded IDs, or unbranded Record keys",
	bannerTitle: "AUDITOR DOMAIN: DOMAIN TYPE & BRANDED ID HYGIENE",
	bannerSubtitle: "Deterministic auto-remediation of naked strings, mutable catalogs, and unbranded Record keys",
	scanningMessage: "Scanning domain contracts and nominal types in",
	zeroFindingsMessage: "Zero raw strings, mutable catalogs, or unbranded IDs detected!",
	tableColumns: [
		{
			key: "file",
			header: "Archivo",
			width: 36,
			align: "left"
		},
		{
			key: "naked",
			header: "NakedStr",
			width: 9,
			align: "right"
		},
		{
			key: "unfrozen",
			header: "Unfrozen",
			width: 9,
			align: "right"
		},
		{
			key: "unbranded",
			header: "Unbranded",
			width: 10,
			align: "right"
		},
		{
			key: "records",
			header: "RecordKey",
			width: 10,
			align: "right"
		},
		{
			key: "total",
			header: "Total",
			width: 7,
			align: "right"
		}
	],
	engineFactory: (projectRoot) => new DomainRefactorEngine({ projectRoot }),
	discoverInFile: (filePath) => DomainRefactorEngine.discoverInFile(filePath),
	buildTableRow: (relFile, findings) => {
		const naked = findings.filter((f) => f.kind === "naked-string-parameter").length;
		const unfrozen = findings.filter((f) => f.kind === "unfrozen-catalog").length;
		const unbranded = findings.filter((f) => f.kind === "unbranded-id").length;
		const records = findings.filter((f) => f.kind === "record-string-key").length;
		return {
			file: formatCliRelativeFilePath(relFile),
			naked: String(naked),
			unfrozen: String(unfrozen),
			unbranded: String(unbranded),
			records: String(records),
			total: String(findings.length)
		};
	},
	buildSummaryMessage: (filesCount, allFindings) => {
		const naked = allFindings.filter((f) => f.kind === "naked-string-parameter").length;
		const unfrozen = allFindings.filter((f) => f.kind === "unfrozen-catalog").length;
		const unbranded = allFindings.filter((f) => f.kind === "unbranded-id").length;
		const records = allFindings.filter((f) => f.kind === "record-string-key").length;
		return `Summary: ${filesCount} file(s) with ${allFindings.length} domain opportunities (${naked} raw strings, ${unfrozen} mutable catalogs, ${unbranded} unbranded IDs, ${records} record keys).`;
	},
	toDiracItem: (f) => ({
		line: f.line,
		kind: f.kind,
		originalSnippet: f.originalSnippet,
		suggestedReplacement: f.suggestedReplacement,
		explanation: f.explanation
	}),
	createPlan: (id, findings) => DomainRefactorEngine.createPlan(id, findings),
	applyPlan: (dir, plan) => DomainRefactorEngine.applyPlan(dir, plan),
	extendedHelp: `
================================================================================
CANONICAL DOMAIN TYPES QUICK-REFERENCE (@francogp/auditor)
================================================================================
When remediating naked strings, raw identifiers, or untyped collections, NEVER
invent ad-hoc escape hatches (// domain-ok:). Use these official semantic types:

  Primitive Defect          Canonical Auditor Type       Import Source
  -----------------------   --------------------------   ------------------
  title, label, desc: string DisplayText                 @francogp/auditor
  lang, localeKey: string   LocalizedText                @francogp/auditor
  color, hex: string        HexColor                     @francogp/auditor
  url, path, icon: string   AssetUri                     @francogp/auditor
  timestamp, date: string   IsoDateString                @francogp/auditor
  domId, elementId: string  DomElementId                 @francogp/auditor
  className, cls: string    CssClassName                 @francogp/auditor
  uuid, userId: string      UserUuid                     @francogp/auditor
  meta: Record<string,any>  JsonObject                   @francogp/auditor
  type MyId = string        Brand<string, 'MyId'>        @francogp/auditor

MIGRATION TEMPLATES:
  1. Branded Nominal IDs:
     import type { Brand } from '@francogp/auditor';
     export type OrderId = Brand<string, 'OrderId'>;

  2. Strict Catalogs & Domain Unions:
     export const ORDER_STATUSES = ['pending', 'shipped', 'delivered'] as const;
     export type OrderStatus = (typeof ORDER_STATUSES)[number];

  3. O(1) Domain Lookup Sets:
     export const ORDER_STATUS_SET: ReadonlySet<OrderStatus> = new Set<OrderStatus>(ORDER_STATUSES);

See comprehensive guide:
  .agents/skills/domain-type-first/references/canonical-data-types.md
  .agents/skills/domain-type-first/references/rapid-type-migration-templates.md
================================================================================
`
};
async function runRefactorDomainCli(argv) {
	await runRefactorCliHarness(domainCliDef, argv);
}
if (isMainModule(import.meta.url, ["auditor-domain", "refactor_domain"])) runRefactorDomainCli().catch((err) => {
	console.error(styleText("red", `\n[Error] Fatal error in auditor-domain: ${err.message}`));
	process.exit(1);
});
export { runRefactorDomainCli };
