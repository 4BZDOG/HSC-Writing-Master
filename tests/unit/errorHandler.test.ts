import { describe, it, expect } from 'vitest';
import {
  categorizeError,
  ErrorCategory,
  isRetryableError,
  getUserErrorMessage,
} from '../../utils/errorHandler';

describe('errorHandler', () => {
  describe('categorizeError', () => {
    it('should categorize network errors', () => {
      const error = new TypeError('Failed to fetch');
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.isRetryable).toBe(true);
      expect(result.userMessage).toContain('Network connection failed');
    });

    it('should categorize 401 Unauthorized errors', () => {
      const error = new Error('HTTP 401 Unauthorized');
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.AUTH);
      expect(result.statusCode).toBe(401);
      expect(result.isRetryable).toBe(false);
      expect(result.userMessage).toContain('session has expired');
    });

    it('should categorize 404 Not Found errors', () => {
      const error = new Error('HTTP 404 Not Found');
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.NOT_FOUND);
      expect(result.statusCode).toBe(404);
      expect(result.isRetryable).toBe(false);
    });

    it('should categorize 429 Rate Limit errors', () => {
      const error = new Error('HTTP 429 Too Many Requests');
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.isRetryable).toBe(true);
    });

    it('should categorize validation errors', () => {
      const error = new Error('validation: invalid email format');
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.isRetryable).toBe(false);
    });

    it('should categorize string network errors', () => {
      const result = categorizeError('network timeout');

      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.isRetryable).toBe(true);
    });

    it('should categorize CORS errors', () => {
      const error = new TypeError('Failed to fetch due to CORS policy');
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.CORS);
      expect(result.isRetryable).toBe(false);
      expect(result.userMessage).toContain('CORS');
    });

    it('should categorize AbortError as a timeout', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      const result = categorizeError(error);

      expect(result.category).toBe(ErrorCategory.TIMEOUT);
      expect(result.isRetryable).toBe(true);
      expect(result.userMessage).toContain('timed out');
    });

    it('should categorize timeout messages', () => {
      const result = categorizeError(new Error('Request timeout after 90000ms'));

      expect(result.category).toBe(ErrorCategory.TIMEOUT);
      expect(result.isRetryable).toBe(true);
    });

    it('should handle unknown error types', () => {
      const result = categorizeError({});

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.isRetryable).toBe(false);
    });

    it('should preserve original error reference', () => {
      const originalError = new Error('Original error');
      const result = categorizeError(originalError);

      expect(result.originalError).toBe(originalError);
    });

    it('should categorize 403 Forbidden errors', () => {
      const result = categorizeError(new Error('HTTP 403 Forbidden'));
      expect(result.category).toBe(ErrorCategory.AUTH);
      expect(result.statusCode).toBe(403);
      expect(result.isRetryable).toBe(false);
    });

    it('should categorize generic 5xx server errors', () => {
      const result = categorizeError(new Error('HTTP 503 Service Unavailable'));
      expect(result.category).toBe(ErrorCategory.SERVER);
      expect(result.isRetryable).toBe(true);
    });

    it('should categorize a bare numeric status code', () => {
      const result = categorizeError(404);
      expect(result.category).toBe(ErrorCategory.NOT_FOUND);
      expect(result.statusCode).toBe(404);
    });

    it('should categorize a generic 4xx client status code', () => {
      const result = categorizeError(418);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.isRetryable).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('returns true for retryable categories', () => {
      expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
      expect(isRetryableError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
    });

    it('returns false for non-retryable categories', () => {
      expect(isRetryableError(new Error('HTTP 401 Unauthorized'))).toBe(false);
      expect(isRetryableError({})).toBe(false);
    });
  });

  describe('getUserErrorMessage', () => {
    it('returns the user-facing message for an error', () => {
      expect(getUserErrorMessage(new Error('HTTP 404 Not Found'))).toContain('could not be found');
    });

    it('falls back to a generic message for unknown error shapes', () => {
      expect(getUserErrorMessage({})).toContain('unexpected error');
    });
  });
});
