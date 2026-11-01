export declare const MAX_FUNCTION_NAME_CHARS = 18;
export declare const MAX_RECOMMENDED_LOC = 60;
export declare const MAX_RECOMMENDED_COGNITIVE = 20;
export declare const MAX_RECOMMENDED_CYCLOMATIC = 25;
export declare const MAX_FILE_PATH_DISPLAY_LENGTH = 27;
export declare const FILE_PATH_TAIL_CHARS = 24;
export declare const MAX_RECOMMENDATION_CHARS = 48;
interface FallowHealthRaw {
  findings?: Array<{
    path: string;
    name: string;
    line: number;
    cognitive: number;
    cyclomatic: number;
    line_count: number;
    exceeded: string;
  }>;
  large_functions?: Array<{
    path: string;
    name: string;
    line: number;
    line_count: number;
  }>;
  targets?: Array<{
    path: string;
    priority: number;
    recommendation: string;
    category: string;
  }>;
  summary?: {
    average_maintainability?: number;
    maintainability_index?: number;
    analyzed_functions?: number;
  };
}
export type FallowHealthRunner = () => FallowHealthRaw;
export declare function setFallowHealthRunner(runner: FallowHealthRunner | null): void;
export declare function runComplexityReport(): void;
export {};