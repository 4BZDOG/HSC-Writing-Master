import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runBatchOperations,
  type BatchFatalError,
  type BatchProgress,
  type BatchTask,
} from '../utils/batchProcessor';

/**
 * The lifecycle of a long AI batch run, owned in one place.
 *
 * Both batch surfaces — the audit studio and the starter-questions step — had
 * written their own version of "is a run in flight?", and the two did not agree.
 * The studio tracked it as explicit state; the starter step derived it from
 * `progress.isComplete`, which does not mean "the run has ended". It means
 * "every task is accounted for", and after a Stop or a fatal halt it is FALSE
 * with tasks left unattempted — so that modal's close button stayed disabled,
 * its Stop button stayed on screen doing nothing, its Done button never
 * appeared, and the only way out was to reload the page.
 *
 * The distinction is real and worth keeping: a cancelled run genuinely has not
 * completed. What a surface needs in order to re-enable its own chrome is a
 * different question — has the runner returned? — and that is what this hook
 * answers. `runBatchOperations` always resolves, on abort and on halt alike, so
 * `isRunning` false in a `finally` is the honest signal.
 *
 * It also owns the AbortController, so Stop and unmount cannot get out of step
 * with each other, and a surface that forgets to abort on unmount is no longer
 * possible to write.
 */

export interface BatchRunOutcome {
  completed: number;
  failed: number;
  total: number;
  /** The ids of the tasks that failed, so a caller can offer to re-run them. */
  failedTaskIds: string[];
  /** The user pressed Stop. Tasks already finished keep their work. */
  aborted: boolean;
  /** The batch halted itself — bad key, exhausted quota, repeated failures. */
  fatalError?: BatchFatalError;
  /**
   * The runner itself threw, as opposed to individual tasks failing (which it
   * counts and carries on from). Nothing about the run can be trusted here.
   */
  runnerError?: unknown;
}

export interface UseBatchRunResult {
  progress: BatchProgress | null;
  /** A run has been started and the runner has not returned yet. */
  isRunning: boolean;
  /** Stop was pressed and the task in flight is still draining. */
  isStopping: boolean;
  run: (tasks: BatchTask<void>[], concurrency?: number) => Promise<BatchRunOutcome>;
  stop: () => void;
  /** Forget the last run's progress — for a surface that reopens. */
  reset: () => void;
}

const EMPTY_OUTCOME: BatchRunOutcome = {
  completed: 0,
  failed: 0,
  total: 0,
  failedTaskIds: [],
  aborted: false,
};

export const useBatchRun = (): UseBatchRunResult => {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  // Read through a ref as well as state: `run` is called from an event handler
  // that may fire twice before React has re-rendered with `isRunning` true.
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A run left in flight would go on spending AI quota and writing to the
      // library with nothing on screen to show it or stop it.
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (tasks: BatchTask<void>[], concurrency = 1): Promise<BatchRunOutcome> => {
      if (runningRef.current) return EMPTY_OUTCOME;
      runningRef.current = true;

      const controller = new AbortController();
      controllerRef.current = controller;
      setIsRunning(true);
      setIsStopping(false);
      setProgress(null);

      let finalProgress: BatchProgress | null = null;
      let runnerError: unknown;
      try {
        await runBatchOperations(
          tasks,
          concurrency,
          (prog) => {
            finalProgress = prog;
            // A run aborted by unmount still delivers its last progress; there
            // is no component left to hold it.
            if (mountedRef.current) setProgress(prog);
          },
          controller.signal
        );
      } catch (err) {
        runnerError = err;
      } finally {
        runningRef.current = false;
        controllerRef.current = null;
        if (mountedRef.current) {
          setIsRunning(false);
          setIsStopping(false);
        }
      }

      const settled: BatchProgress | null = finalProgress;
      return {
        completed: settled?.completed ?? 0,
        failed: settled?.failed ?? 0,
        total: settled?.total ?? tasks.length,
        failedTaskIds: settled?.failedTaskIds ?? [],
        aborted: controller.signal.aborted,
        fatalError: settled?.fatalError,
        runnerError,
      };
    },
    []
  );

  const stop = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.abort();
    setIsStopping(true);
  }, []);

  const reset = useCallback(() => {
    if (runningRef.current) return;
    setProgress(null);
  }, []);

  return { progress, isRunning, isStopping, run, stop, reset };
};
