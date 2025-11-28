/**
 * Centralized Error Handler
 * Production-grade error handling with proper logging and response formatting
 */

const logger = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const config = require('../config');

/**
 * Custom Error Classes
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * 404 Handler - Must be placed after all routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError('Endpoint');
  error.path = req.originalUrl;
  error.method = req.method;
  next(error);
};

/**
 * Global Error Handler
 */
const errorHandler = (err, req, res, next) => {
  // Ensure we have proper error structure
  let error = err;

  // Handle non-AppError errors
  if (!(err instanceof AppError)) {
    error = new AppError(err.message || 'Internal Server Error', 500, 'INTERNAL_ERROR');
    error.originalError = err;
    error.stack = err.stack;
    error.isOperational = false;
  }

  // Set defaults
  error.statusCode = error.statusCode || 500;
  error.code = error.code || 'INTERNAL_ERROR';

  // Record error metrics
  metrics.errorTotal.labels(
    error.code,
    error.statusCode.toString(),
    req.route?.path || req.path || 'unknown'
  ).inc();

  // Build log context
  const logContext = {
    request_id: req.requestId,
    trace_id: req.traceContext?.traceId,
    error_code: error.code,
    status_code: error.statusCode,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    user_agent: req.headers['user-agent'],
    ip: req.ip,
    is_operational: error.isOperational,
  };

  // Add body for non-GET requests (sanitized)
  if (req.method !== 'GET' && req.body) {
    logContext.body = sanitizeForLogging(req.body);
  }

  // Log the error
  if (error.statusCode >= 500) {
    logger.errorWithContext(
      `Server Error: ${error.message}`,
      error,
      logContext
    );
  } else if (error.statusCode >= 400) {
    logger.warn(`Client Error: ${error.message}`, {
      ...logContext,
      details: error.details,
    });
  }

  // Log stack trace for non-operational errors
  if (!error.isOperational) {
    logger.error('Non-operational error - stack trace', {
      stack: error.stack,
      original_stack: error.originalError?.stack,
    });
  }

  // Build response
  const response = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      ...(error.path && { path: error.path }),
    },
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  // Add stack trace in development
  if (config.app.isDevelopment && error.stack) {
    response.error.stack = error.stack.split('\n');
  }

  res.status(error.statusCode).json(response);
};

/**
 * Sanitize data for logging
 */
const sanitizeForLogging = (data) => {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization', 'creditCard', 'ssn'];
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  const sanitize = (obj) => {
    for (const key in obj) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };

  sanitize(sanitized);
  return sanitized;
};

/**
 * Async handler wrapper to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
};

