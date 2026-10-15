import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_accessibility.d.ts
export declare const ACCESSIBILITY_RULES: readonly ["a11y-img-alt", "a11y-form-control-has-label", "a11y-interactive-supports-focus", "a11y-anchor-has-content", "a11y-aria-role-invalid", "a11y-viewport-zoom-lock"];
export type AccessibilityRuleId = (typeof ACCESSIBILITY_RULES)[number];
declare const VALID_WAI_ARIA_ROLES_LIST: readonly ["alert", "alertdialog", "application", "article", "banner", "button", "cell", "checkbox", "columnheader", "combobox", "complementary", "contentinfo", "definition", "dialog", "directory", "document", "feed", "figure", "form", "grid", "gridcell", "group", "heading", "img", "link", "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "navigation", "none", "note", "option", "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem"];
export type ValidWaiAriaRole = (typeof VALID_WAI_ARIA_ROLES_LIST)[number];
/**
 * Maps an eslint-plugin-vuejs-accessibility rule to canonical AccessibilityRuleId.
 */
export declare function mapA11yRuleId(eslintRuleId: string): AccessibilityRuleId;
export declare class ValidateAccessibilityAuditor extends BaseAuditor<AccessibilityRuleId> {
  constructor(options?: {
    projectRoot?: string;
    fix?: boolean;
  });
  runAudit(): Promise<void>;
  private auditVueFileForRule;
  private auditImgAlt;
  private auditFormControlLabel;
  private auditInteractiveFocus;
  private auditAnchorContent;
  private auditAriaRole;
  private auditIndexViewport;
}
//#endregion
export {};