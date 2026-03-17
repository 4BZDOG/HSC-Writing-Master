import { apiGuard } from '../services/geminiService';

export interface BatchTask<T> {
  id: string;
  description: string;
  action: () => Promise<T>;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  currentTask?: string;
  isComplete: boolean;
  errors: string[];
  logs: string[]; // Added logs array
}

export const runBatchOperations = async <T>(
  tasks: BatchTask<T>[],
  concurrency: number = 2,
  onProgress: (progress: BatchProgress) => void,
  signal?: AbortSignal // Added signal
): Promise<void> => {
  let completed = 0;
  let failed = 0;
  let active = 0;
  let index = 0;
  const errors: string[] = [];
  const logs: string[] = [];

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.unshift(`[${timestamp}] ${msg}`);
    // Keep log size manageable
    if (logs.length > 100) logs.pop();
  };

  const updateProgress = (currentTaskName?: string) => {
    onProgress({
      total: tasks.length,
      completed,
      failed,
      currentTask: currentTaskName,
      isComplete: completed + failed === tasks.length,
      errors,
      logs: [...logs], // Pass a copy
    });
  };

  return new Promise((resolve, reject) => {
    const runNext = async () => {
      if (signal?.aborted) {
        addLog('Batch operation cancelled by user.');
        updateProgress('Cancelled');
        resolve();
        return;
      }

      if (index >= tasks.length && active === 0) {
        updateProgress();
        resolve();
        return;
      }

      // If API Guard is blocked, wait and retry
      if (apiGuard.isBlocked()) {
        addLog('API limit reached. Pausing for cooldown...');
        updateProgress('Waiting for API cooldown...');
        setTimeout(runNext, 5000);
        return;
      }

      if (index >= tasks.length || active >= concurrency) {
        return;
      }

      const task = tasks[index++];
      active++;
      // updateProgress(task.description); // Reduce update frequency to avoid UI jitter

      try {
        // Add a small artificial delay to prevent burst rate limiting
        await new Promise((r) => setTimeout(r, 1500));

        if (signal?.aborted) throw new Error('Aborted');

        await task.action();
        completed++;
        addLog(`Success: ${task.description}`);
      } catch (err) {
        if ((err as Error).message === 'Aborted') {
          // Silent fail on abort
        } else {
          console.error(`Batch task failed [${task.id}]:`, err);
          failed++;
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${task.description}: ${errMsg}`);
          addLog(`Failed: ${task.description} - ${errMsg}`);
        }
      } finally {
        active--;
        updateProgress(tasks[index]?.description || 'Finishing up...');
        runNext();
      }
    };

    // Start initial batch
    for (let i = 0; i < concurrency; i++) {
      runNext();
    }
  });
};
