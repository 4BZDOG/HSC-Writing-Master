import { apiGuard } from '../services/geminiService';
import { ApiKeyError, QuotaExceededError, ProxyUnavailableError } from '../services/aiCore';
import { categorizeError, ErrorCategory, type CategorizedError } from './errorHandler';

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
  logs: string[];
  /** Set when the batch auto-aborted due to a fatal (non-retryable) error. */
  fatalError?: BatchFatalError;
}

export interface BatchFatalError {
  category: ErrorCategory;
  userMessage: string;
  suggestion: string;
}

/**
 * Classify an AI error into a user-friendly fatal-error descriptor.
 * Returns undefined for transient/retryable errors that should not halt the batch.
 */
const classifyFatal = (err: unknown): BatchFatalError | undefined => {
  if (err instanceof ApiKeyError) {
    return {
      category: ErrorCategory.AUTH,
      userMessage: 'API key is invalid or expired.',
      suggestion: 'Check the key in Runtime AI Keys or .env.local, then retry.',
    };
  }

  if (err instanceof ProxyUnavailableError) {
    return {
      category: ErrorCategory.SERVER,
      userMessage: 'AI proxy is not connected on this deployment.',
      suggestion:
        'Connect an API host (see DEPLOYMENT.md) or paste a runtime key to use direct mode.',
    };
  }

  if (err instanceof QuotaExceededError) {
    if (err.zeroFreeTierQuota) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        userMessage: 'This model has no free-tier quota on your key.',
        suggestion:
          'Switch to a different AI engine (e.g. Gemini Flash) or add billing to the key.',
      };
    }
    if (err.message.toLowerCase().includes('daily')) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        userMessage: 'Daily AI quota exhausted.',
        suggestion: 'Wait until the quota resets tomorrow, or switch to a different provider.',
      };
    }
  }

  const categorised = categorizeError(err);

  if (categorised.category === ErrorCategory.AUTH) {
    return {
      category: ErrorCategory.AUTH,
      userMessage: categorised.userMessage,
      suggestion: 'Check your API key configuration and sign-in status.',
    };
  }

  if (categorised.category === ErrorCategory.RATE_LIMIT && !categorised.isRetryable) {
    return {
      category: ErrorCategory.RATE_LIMIT,
      userMessage: categorised.userMessage,
      suggestion: 'Wait for the rate limit to reset, or switch AI engine.',
    };
  }

  return undefined;
};

/**
 * Build a human-readable log line for a failed task, with the error
 * classified into a short label the admin can act on.
 */
const formatErrorLog = (taskDesc: string, err: unknown): string => {
  if (err instanceof ApiKeyError) return `⛔ ${taskDesc} — API key invalid`;
  if (err instanceof ProxyUnavailableError) return `⛔ ${taskDesc} — AI proxy not connected`;
  if (err instanceof QuotaExceededError) {
    if (err.zeroFreeTierQuota) return `⛔ ${taskDesc} — No free-tier quota for this model`;
    if (err.message.toLowerCase().includes('daily'))
      return `⛔ ${taskDesc} — Daily quota exhausted`;
    return `⚠ ${taskDesc} — Rate limited (429)`;
  }

  const categorised = categorizeError(err);
  switch (categorised.category) {
    case ErrorCategory.NETWORK:
      return `⚠ ${taskDesc} — Network error`;
    case ErrorCategory.SERVER:
      return `⚠ ${taskDesc} — Server error (${categorised.statusCode ?? '5xx'})`;
    case ErrorCategory.AUTH:
      return `⛔ ${taskDesc} — Auth error`;
    case ErrorCategory.RATE_LIMIT:
      return `⚠ ${taskDesc} — Rate limited`;
    default: {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const short = msg.length > 80 ? msg.slice(0, 77) + '…' : msg;
      return `✗ ${taskDesc} — ${short}`;
    }
  }
};

export const runBatchOperations = async <T>(
  tasks: BatchTask<T>[],
  concurrency: number = 2,
  onProgress: (progress: BatchProgress) => void,
  signal?: AbortSignal
): Promise<void> => {
  let completed = 0;
  let failed = 0;
  let active = 0;
  let index = 0;
  const errors: string[] = [];
  const logs: string[] = [];
  let fatalError: BatchFatalError | undefined;
  let consecutiveFailures = 0;

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.unshift(`[${timestamp}] ${msg}`);
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
      logs: [...logs],
      fatalError,
    });
  };

  return new Promise((resolve) => {
    let cancelledLogged = false;

    addLog(`Starting batch of ${tasks.length} task${tasks.length === 1 ? '' : 's'}…`);
    updateProgress(tasks[0]?.description);

    const runNext = async () => {
      if (fatalError) {
        if (active === 0) {
          const remaining = tasks.length - (completed + failed);
          if (remaining > 0) {
            addLog(
              `⛔ Batch halted — ${remaining} task${remaining === 1 ? '' : 's'} skipped: ${fatalError.userMessage}`
            );
          }
          updateProgress('Halted');
          resolve();
        }
        return;
      }

      if (signal?.aborted) {
        if (!cancelledLogged) {
          cancelledLogged = true;
          addLog('Batch operation cancelled by user.');
        }
        if (active === 0) {
          updateProgress('Cancelled');
          resolve();
        }
        return;
      }

      if (index >= tasks.length && active === 0) {
        updateProgress();
        resolve();
        return;
      }

      if (apiGuard.isBlocked()) {
        addLog('⚠ API guard tripped — pausing 5 s for cooldown…');
        updateProgress('Waiting for API cooldown…');
        setTimeout(runNext, 5000);
        return;
      }

      if (index >= tasks.length || active >= concurrency) {
        return;
      }

      const task = tasks[index++];
      active++;

      try {
        await new Promise((r) => setTimeout(r, 1500));

        if (signal?.aborted) throw new Error('Aborted');

        await task.action();
        completed++;
        consecutiveFailures = 0;
        addLog(`✓ ${task.description}`);
      } catch (err) {
        if ((err as Error).message === 'Aborted') {
          // Silent on user abort
        } else {
          console.error(`Batch task failed [${task.id}]:`, err);
          failed++;
          consecutiveFailures++;

          const logLine = formatErrorLog(task.description, err);
          errors.push(logLine);
          addLog(logLine);

          const fatal = classifyFatal(err);
          if (fatal) {
            fatalError = fatal;
          } else if (consecutiveFailures >= 5) {
            fatalError = {
              category: ErrorCategory.UNKNOWN,
              userMessage: `${consecutiveFailures} consecutive failures.`,
              suggestion:
                'The AI provider may be experiencing issues. Try again later or switch engine.',
            };
          }
        }
      } finally {
        active--;
        updateProgress(tasks[index]?.description || 'Finishing up…');
        runNext();
      }
    };

    for (let i = 0; i < concurrency; i++) {
      runNext();
    }
  });
};
