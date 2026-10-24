import { FallowCloneGroup, MicroContextPacket } from "./refactorContracts.js";
export declare const MIN_DIRAC_TOKEN_THRESHOLD = 100;
export declare class MicroContextExtractor {
  /**
   * Evaluates if a clone group meets the minimum Dirac token threshold (>100 tokens)
   * to ensure micro-context compression focuses on consequential architectural clones.
   */
  static isDiracCandidate(group: FallowCloneGroup): boolean;
  /**
   * Extracts Hash-Anchored micro-context packet for a clone group.
   */
  extract(projectRoot: string, group: FallowCloneGroup): MicroContextPacket;
  /**
   * Parses snippet as TypeScript AST and analyzes variable reads vs assignments.
   */
  private analyzeDataflow;
}