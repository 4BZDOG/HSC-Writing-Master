import { describe, it, expect } from 'vitest';
import { categorizeError, ErrorCategory } from '../../utils/errorHandler';

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
  });
});
