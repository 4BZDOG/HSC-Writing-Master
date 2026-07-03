import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runBatchOperations, BatchTask, BatchProgress } from '../../utils/batchProcessor';

/**
 * runBatchOperations drives an internal 1500ms "don't burst the API" delay
 * before every task, so these tests run on fake timers and manually advance
 * past it rather than waiting in real time.
 */
describe('runBatchOperations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const flushDelay = async () => {
    await vi.advanceTimersByTimeAsync(1500);
  };

  const flushMicrotasks = async (turns = 5) => {
    for (let i = 0; i < turns; i++) {
      await Promise.resolve();
    }
  };

  it('runs all tasks to completion and reports final progress', async () => {
    const order: string[] = [];
    const tasks: BatchTask<void>[] = [1, 2, 3].map((n) => ({
      id: `t${n}`,
      description: `task ${n}`,
      action: async () => {
        order.push(`t${n}`);
      },
    }));

    let lastProgress: BatchProgress | undefined;
    const onProgress = (p: BatchProgress) => {
      lastProgress = p;
    };

    const run = runBatchOperations(tasks, 1, onProgress);
    await vi.runAllTimersAsync();
    await run;

    expect(order).toEqual(['t1', 't2', 't3']);
    expect(lastProgress?.completed).toBe(3);
    expect(lastProgress?.failed).toBe(0);
    expect(lastProgress?.isComplete).toBe(true);
  });

  it('counts failed tasks without stopping the rest of the batch', async () => {
    const tasks: BatchTask<void>[] = [
      { id: 't1', description: 'ok', action: async () => {} },
      {
        id: 't2',
        description: 'boom',
        action: async () => {
          throw new Error('boom');
        },
      },
      { id: 't3', description: 'ok again', action: async () => {} },
    ];

    let lastProgress: BatchProgress | undefined;
    const run = runBatchOperations(tasks, 1, (p) => {
      lastProgress = p;
    });
    await vi.runAllTimersAsync();
    await run;

    expect(lastProgress?.completed).toBe(2);
    expect(lastProgress?.failed).toBe(1);
    expect(lastProgress?.errors).toHaveLength(1);
  });

  it('waits for a sibling in-flight task to finish before resolving after abort()', async () => {
    // Regression test for a real bug: with concurrency >= 2, if the user
    // clicks Stop while task A happens to finish first but task B is still
    // running, the batch used to resolve as soon as A's finally-block
    // re-entered runNext() and saw the signal aborted — even though B (and
    // whatever state mutation its result triggers, e.g. updateCourses) was
    // still in flight. The caller would then tell the UI "stopped" while
    // B's result landed moments later, unannounced.
    const controller = new AbortController();
    let bStarted = false;
    let bFinished = false;
    let resolveA: () => void = () => {};
    let resolveB: () => void = () => {};

    const tasks: BatchTask<void>[] = [
      {
        id: 'a',
        description: 'finishes first',
        action: () => new Promise<void>((resolve) => (resolveA = resolve)),
      },
      {
        id: 'b',
        description: 'still in flight when A finishes',
        action: async () => {
          bStarted = true;
          await new Promise<void>((resolve) => (resolveB = resolve));
          bFinished = true;
        },
      },
    ];

    const run = runBatchOperations(tasks, 2, () => {}, controller.signal);

    // Let the shared pre-task delay elapse so both A and B start together.
    await flushDelay();
    await flushMicrotasks();
    expect(bStarted).toBe(true);

    let settled = false;
    run.then(() => {
      settled = true;
    });

    // User clicks "Stop" while both A and B are genuinely in flight.
    controller.abort();

    // A finishes (independently of the abort) — its finally-block re-enters
    // runNext(), which sees the signal aborted.
    resolveA();
    await flushMicrotasks();

    // B is still running — the batch must NOT report done yet.
    expect(bFinished).toBe(false);
    expect(settled).toBe(false);

    // Now let B finish; only then should the batch resolve.
    resolveB();
    await vi.runAllTimersAsync();
    await run;
    expect(bFinished).toBe(true);
    expect(settled).toBe(true);
  });

  it('reflects failed tasks in isComplete accounting used for the progress bar', async () => {
    const tasks: BatchTask<void>[] = [
      { id: 't1', description: 'ok', action: async () => {} },
      {
        id: 't2',
        description: 'boom',
        action: async () => {
          throw new Error('boom');
        },
      },
    ];

    const progressSnapshots: BatchProgress[] = [];
    const run = runBatchOperations(tasks, 1, (p) => progressSnapshots.push(p));
    await vi.runAllTimersAsync();
    await run;

    const final = progressSnapshots[progressSnapshots.length - 1];
    // completed + failed should account for every task, which is what the
    // progress bar width now uses instead of completed alone.
    expect(final.completed + final.failed).toBe(final.total);
  });
});
