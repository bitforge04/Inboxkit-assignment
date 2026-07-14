/**
 * Per-cell mutex queue.
 *
 * Guarantees that for any given cell, only one claim_cell handler runs at a
 * time, serialising concurrent requests without deadlocks.
 *
 * Implementation: each cell id maps to a Promise chain.  Callers enqueue a
 * function onto the tail of the chain; when it's their turn the function runs
 * and the chain advances.
 *
 * This is sufficient for a single-server deployment.  For multi-instance
 * horizontal scaling, replace with a Redis SETNX-based distributed lock or
 * a Redlock implementation.
 */

type Task<T> = () => Promise<T>;

export class CellLockManager {
  private queues: Map<number, Promise<unknown>>;

  constructor() {
    this.queues = new Map();
  }

  /**
   * Execute `task` exclusively for `cellId`.
   * Returns a promise that resolves with the task's return value.
   */
  async withLock<T>(cellId: number, task: Task<T>): Promise<T> {
    const prev = this.queues.get(cellId) ?? Promise.resolve();

    // Chain this task after whatever is currently running for this cell
    const next = prev.then(() => task()).finally(() => {
      // Clean up the map when this is the last entry in the chain
      if (this.queues.get(cellId) === next) {
        this.queues.delete(cellId);
      }
    });

    this.queues.set(cellId, next);
    return next;
  }

  get activeLocks(): number {
    return this.queues.size;
  }
}

// Singleton — shared across all socket handlers in this process
export const cellLocks = new CellLockManager();
