import { useCallback, useState, useRef } from 'react';
import { categorizeError, ErrorCategory } from '../utils/errorHandler';

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number; // Exponential backoff multiplier
  onRetry?: (attempt: number, error: unknown) => void;
  shouldRetry?: (error: unknown) => boolean; // Custom retry condition
}

interface RetryState {
  isRetrying: boolean;
  attempt: number;
  error: unknown | null;
}

/**
 * Hook for retrying async operations with exponential backoff
 *
 * @param fn - Async function to retry
 * @param options - Configuration for retry behavior
 *
 * @example
 * const { execute, isRetrying, attempt, error } = useRetry(
 *   async () => fetchData(),
 *   { maxAttempts: 3, initialDelayMs: 1000 }
 * );
 *
 * const handleRetryClick = async () => {
 *   const result = await execute();
 * };
 */
export const useRetry = <T,>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
) => {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffFactor = 2,
    onRetry,
    shouldRetry,
  } = options;

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attempt: 0,
    error: null,
  });

  const attemptsRef = useRef(0);

  const execute = useCallback(
    async (overrideMaxAttempts?: number): Promise<T | null> => {
      const max = overrideMaxAttempts || maxAttempts;

      if (attemptsRef.current > 0) {
        setState(prev => ({
          ...prev,
          isRetrying: true,
          attempt: attemptsRef.current,
        }));
      }

      try {
        const result = await fn();
        // Reset on success
        attemptsRef.current = 0;
        setState({
          isRetrying: false,
          attempt: 0,
          error: null,
        });
        return result;
      } catch (error) {
        const categorized = categorizeError(error);

        // Check if we should retry
        const customShouldRetry = shouldRetry
          ? shouldRetry(error)
          : categorized.isRetryable;

        if (!customShouldRetry || attemptsRef.current >= max - 1) {
          // Don't retry or max attempts reached
          attemptsRef.current = 0;
          setState({
            isRetrying: false,
            attempt: 0,
            error,
          });
          throw error;
        }

        // Retry with exponential backoff
        attemptsRef.current++;
        const delayMs = initialDelayMs * Math.pow(backoffFactor, attemptsRef.current - 1);

        onRetry?.(attemptsRef.current, error);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Recursive call
        return execute(max);
      }
    },
    [fn, maxAttempts, initialDelayMs, backoffFactor, onRetry, shouldRetry]
  );

  const reset = useCallback(() => {
    attemptsRef.current = 0;
    setState({
      isRetrying: false,
      attempt: 0,
      error: null,
    });
  }, []);

  return {
    execute,
    reset,
    isRetrying: state.isRetrying,
    attempt: state.attempt,
    error: state.error,
  };
};

/**
 * Simple delay utility for use with retries
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Calculate delay with exponential backoff
 */
export const calculateBackoffDelay = (
  attempt: number,
  initialDelayMs: number = 1000,
  backoffFactor: number = 2
): number => {
  return initialDelayMs * Math.pow(backoffFactor, attempt - 1);
};
