import { ConsoleOutputMode, TaskStreamProgressParams } from "./streamingFormat.js";
export interface TaskStreamCoordinatorOptions {
  indent?: string;
  mode?: ConsoleOutputMode;
}
export declare class TaskStreamCoordinator {
  private completedCount;
  private readonly totalTasks;
  private readonly indent;
  private readonly mode;
  private printLock;
  constructor(totalTasks: number, options?: TaskStreamCoordinatorOptions);
  onTaskComplete(params: TaskStreamProgressParams): Promise<void>;
  private printTaskItem;
}