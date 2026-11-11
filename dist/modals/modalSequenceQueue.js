// src/modals/modalSequenceQueue.ts
function compareQueuedTasks(left, right) {
	if (right.task.priority !== left.task.priority) return right.task.priority - left.task.priority;
	return left.insertionOrder - right.insertionOrder;
}
var ModalSequenceQueue = class {
	onTaskError;
	queued = [];
	nextInsertionOrder = 0;
	running = false;
	runGeneration = 0;
	activeRunPromise = null;
	idleWaiters = /* @__PURE__ */ new Set();
	constructor(config = {}) {
		this.onTaskError = config.onTaskError;
	}
	isRunning() {
		return this.running;
	}
	isBusy() {
		return this.running || this.queued.length > 0;
	}
	getPendingTasks() {
		return Array.from(this.queued).sort(compareQueuedTasks).map((entry) => entry.task);
	}
	enqueue(task) {
		this.queued.push({
			task,
			insertionOrder: this.nextInsertionOrder++
		});
	}
	clear() {
		this.runGeneration++;
		this.queued = [];
		this.running = false;
		this.activeRunPromise = null;
		this.flushIdleWaiters();
	}
	waitUntilIdle() {
		if (!this.isBusy()) return Promise.resolve();
		return new Promise((resolve) => {
			this.idleWaiters.add(resolve);
		});
	}
	runSequence(context) {
		if (this.activeRunPromise) return this.activeRunPromise;
		const generation = ++this.runGeneration;
		this.running = true;
		const execution = this.drainQueue(context, generation).finally(() => {
			if (this.runGeneration === generation) {
				this.running = false;
				this.activeRunPromise = null;
				if (!this.isBusy()) this.flushIdleWaiters();
			}
		});
		this.activeRunPromise = execution;
		return execution;
	}
	async drainQueue(context, generation) {
		while (this.queued.length > 0 && this.running && this.runGeneration === generation) {
			this.queued.sort(compareQueuedTasks);
			const nextItem = this.queued.shift();
			if (!nextItem) break;
			try {
				await nextItem.task.execute(context);
			} catch (err) {
				const normalized = err instanceof Error ? err : new Error(String(err), { cause: err });
				if (this.onTaskError) this.onTaskError(normalized, nextItem.task);
				else throw normalized;
			}
		}
	}
	flushIdleWaiters() {
		if (this.idleWaiters.size === 0) return;
		const pending = Array.from(this.idleWaiters);
		this.idleWaiters.clear();
		for (const resolve of pending) resolve();
	}
};
function createModalSequenceQueue(config = {}) {
	return new ModalSequenceQueue(config);
}
export { ModalSequenceQueue, createModalSequenceQueue };
