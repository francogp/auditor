import { MagicRefactorPlan } from "./magicContracts.js";
//#region src/core/refactor/magicNumberHarness.d.ts
export declare const FORBIDDEN_GENERIC_NAMES_LIST: readonly ["ID", "NAME", "TYPE", "KEY", "INDEX", "COUNT", "DEFAULT", "SIZE", "MAX", "MIN", "VAL", "VALUE", "ITEM", "STATE", "MODE", "TAG", "DATA", "INFO", "OPTIONS", "CONFIG", "RESULT", "STATUS"];
export type ForbiddenGenericName = (typeof FORBIDDEN_GENERIC_NAMES_LIST)[number];
export declare class ConstantHygieneGate {
  private static readonly FORBIDDEN_GENERIC_NAMES;
  /**
   * Validates proposed constant name against validate_constant_hygiene rules:
   * 1. constant-no-literal-suffix (_100, _500)
   * 2. constant-bad-names (including value in name)
   * 3. generic names ban
   */
  static validateOrSanitize(name: string, _value: string | number): string;
}
export declare class MagicNumberHarness {
  static execute(projectRoot: string, plan: MagicRefactorPlan): Promise<void>;
  private static maintainSharedConstants;
  private static processTargetFile;
  private static injectLocalDeclarations;
}
//#endregion