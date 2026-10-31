import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const DOCKER_CONFIG_RULES: readonly ["dockerignore-missing", "dockerignore-missing-pattern"];
export type DockerConfigRuleId = (typeof DOCKER_CONFIG_RULES)[number];
export declare const MANDATORY_DOCKER_IGNORE_PATTERNS: readonly string[];
export declare const CANONICAL_DOCKERIGNORE_LINES: readonly ["# Ignored files and dependencies for Docker image builds", "node_modules", ".git", "dist", "scratch", ".env*", "*.log", ""];
export declare const CANONICAL_DOCKERIGNORE_CONTENT: string;
export declare const DOCKER_FILE_CANDIDATES: readonly string[];
export declare function isDockerProjectContext(projectRoot: string): boolean;
export declare const DOCKER_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<DockerConfigRuleId>;
export interface DockerConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}
export declare class ValidateDockerConfigAuditor extends BaseAuditor<DockerConfigRuleId> {
  constructor(options?: DockerConfigAuditorOptions);
  runAudit(): Promise<void>;
}