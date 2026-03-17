/**
 * Categorized error types for better error handling
 */
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  SERVER = 'SERVER',
  AUTH = 'AUTH',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION = 'VALIDATION',
  RATE_LIMIT = 'RATE_LIMIT',
  UNKNOWN = 'UNKNOWN',
}

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  userMessage: string; // User-friendly message to display in UI
  statusCode?: number;
  isRetryable: boolean;
  originalError?: Error;
}

/**
 * Categorize and provide user-friendly messages for errors
 */
export const categorizeError = (error: unknown): CategorizedError => {
  // Handle Fetch API errors
  if (error instanceof TypeError) {
    if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
      return {
        category: ErrorCategory.NETWORK,
        message: error.message,
        userMessage: 'Network connection failed. Please check your internet and try again.',
        isRetryable: true,
        originalError: error,
      };
    }
  }

  // Handle Response errors
  if (error instanceof Error && error.message.startsWith('HTTP')) {
    const statusCode = parseInt(error.message.match(/\d+/)?.[0] || '500', 10);
    return categorizeByStatusCode(statusCode, error);
  }

  // Handle plain Error objects with messages
  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return {
        category: ErrorCategory.AUTH,
        message: error.message,
        userMessage: 'Your session has expired. Please log in again.',
        isRetryable: false,
        statusCode: 401,
        originalError: error,
      };
    }

    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      return {
        category: ErrorCategory.AUTH,
        message: error.message,
        userMessage: 'You do not have permission to perform this action.',
        isRetryable: false,
        statusCode: 403,
        originalError: error,
      };
    }

    if (error.message.includes('404') || error.message.includes('Not Found')) {
      return {
        category: ErrorCategory.NOT_FOUND,
        message: error.message,
        userMessage: 'The requested item could not be found. It may have been deleted.',
        isRetryable: false,
        statusCode: 404,
        originalError: error,
      };
    }

    if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        message: error.message,
        userMessage: 'Too many requests. Please wait a moment and try again.',
        isRetryable: true,
        statusCode: 429,
        originalError: error,
      };
    }

    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return {
        category: ErrorCategory.VALIDATION,
        message: error.message,
        userMessage: `Validation error: ${error.message.split(':').pop()?.trim() || 'Please check your input.'}`,
        isRetryable: false,
        originalError: error,
      };
    }

    // Generic server error (5xx)
    if (error.message.includes('5')) {
      return {
        category: ErrorCategory.SERVER,
        message: error.message,
        userMessage: 'Server error. Our team has been notified. Please try again shortly.',
        isRetryable: true,
        originalError: error,
      };
    }

    // Fallback for any error message
    return {
      category: ErrorCategory.UNKNOWN,
      message: error.message,
      userMessage: error.message || 'An unexpected error occurred.',
      isRetryable: false,
      originalError: error,
    };
  }

  // Handle plain status codes
  if (typeof error === 'number') {
    return categorizeByStatusCode(error);
  }

  // Handle string error messages
  if (typeof error === 'string') {
    if (error.toLowerCase().includes('network')) {
      return {
        category: ErrorCategory.NETWORK,
        message: error,
        userMessage: 'Network connection failed. Please check your internet and try again.',
        isRetryable: true,
      };
    }
    return {
      category: ErrorCategory.UNKNOWN,
      message: error,
      userMessage: error,
      isRetryable: false,
    };
  }

  // Fallback for unknown error type
  return {
    category: ErrorCategory.UNKNOWN,
    message: 'An unexpected error occurred',
    userMessage: 'An unexpected error occurred. Please try again.',
    isRetryable: false,
  };
};

/**
 * Categorize error by HTTP status code
 */
const categorizeByStatusCode = (statusCode: number, originalError?: Error): CategorizedError => {
  if (statusCode === 401) {
    return {
      category: ErrorCategory.AUTH,
      message: `HTTP ${statusCode}: Unauthorized`,
      userMessage: 'Your session has expired. Please log in again.',
      statusCode,
      isRetryable: false,
      originalError,
    };
  }

  if (statusCode === 403) {
    return {
      category: ErrorCategory.AUTH,
      message: `HTTP ${statusCode}: Forbidden`,
      userMessage: 'You do not have permission to perform this action.',
      statusCode,
      isRetryable: false,
      originalError,
    };
  }

  if (statusCode === 404) {
    return {
      category: ErrorCategory.NOT_FOUND,
      message: `HTTP ${statusCode}: Not Found`,
      userMessage: 'The requested item could not be found. It may have been deleted.',
      statusCode,
      isRetryable: false,
      originalError,
    };
  }

  if (statusCode === 429) {
    return {
      category: ErrorCategory.RATE_LIMIT,
      message: `HTTP ${statusCode}: Too Many Requests`,
      userMessage: 'Too many requests. Please wait a moment and try again.',
      statusCode,
      isRetryable: true,
      originalError,
    };
  }

  if (statusCode >= 500) {
    return {
      category: ErrorCategory.SERVER,
      message: `HTTP ${statusCode}: Server Error`,
      userMessage: 'Server error. Our team has been notified. Please try again shortly.',
      statusCode,
      isRetryable: true,
      originalError,
    };
  }

  if (statusCode >= 400) {
    return {
      category: ErrorCategory.VALIDATION,
      message: `HTTP ${statusCode}: Client Error`,
      userMessage: 'There was an issue with your request. Please check your input and try again.',
      statusCode,
      isRetryable: false,
      originalError,
    };
  }

  return {
    category: ErrorCategory.UNKNOWN,
    message: `HTTP ${statusCode}: Unknown Error`,
    userMessage: 'An unexpected error occurred. Please try again.',
    statusCode,
    isRetryable: false,
    originalError,
  };
};

/**
 * Check if an error is retryable
 */
export const isRetryableError = (error: unknown): boolean => {
  const categorized = categorizeError(error);
  return categorized.isRetryable;
};

/**
 * Get user-friendly error message
 */
export const getUserErrorMessage = (error: unknown): string => {
  const categorized = categorizeError(error);
  return categorized.userMessage;
};
