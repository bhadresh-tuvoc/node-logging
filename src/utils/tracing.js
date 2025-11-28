/**
 * Request Tracing & Correlation
 * Distributed tracing support for request tracking across services
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

// Headers for trace propagation
const TRACE_HEADERS = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  PARENT_SPAN_ID: 'x-parent-span-id',
  TRACE_ID: 'x-trace-id',
  SPAN_ID: 'x-span-id',
};

/**
 * Generate a new trace context
 */
const createTraceContext = (existingContext = {}) => {
  const now = Date.now();
  return {
    traceId: existingContext.traceId || uuidv4(),
    spanId: uuidv4().substring(0, 16),
    parentSpanId: existingContext.spanId || null,
    requestId: existingContext.requestId || uuidv4(),
    correlationId: existingContext.correlationId || uuidv4(),
    startTime: now,
    startHrTime: process.hrtime(),
  };
};

/**
 * Extract trace context from incoming request headers
 */
const extractTraceContext = (headers) => {
  return {
    traceId: headers[TRACE_HEADERS.TRACE_ID],
    spanId: headers[TRACE_HEADERS.SPAN_ID],
    parentSpanId: headers[TRACE_HEADERS.PARENT_SPAN_ID],
    requestId: headers[TRACE_HEADERS.REQUEST_ID],
    correlationId: headers[TRACE_HEADERS.CORRELATION_ID],
  };
};

/**
 * Inject trace context into outgoing request headers
 */
const injectTraceContext = (context, headers = {}) => {
  return {
    ...headers,
    [TRACE_HEADERS.TRACE_ID]: context.traceId,
    [TRACE_HEADERS.SPAN_ID]: context.spanId,
    [TRACE_HEADERS.PARENT_SPAN_ID]: context.parentSpanId,
    [TRACE_HEADERS.REQUEST_ID]: context.requestId,
    [TRACE_HEADERS.CORRELATION_ID]: context.correlationId,
  };
};

/**
 * Create a child span for nested operations
 */
const createChildSpan = (parentContext, operationName) => {
  const childContext = {
    ...parentContext,
    spanId: uuidv4().substring(0, 16),
    parentSpanId: parentContext.spanId,
    operationName,
    startTime: Date.now(),
    startHrTime: process.hrtime(),
  };

  return {
    context: childContext,
    end: (metadata = {}) => {
      const hrDuration = process.hrtime(childContext.startHrTime);
      const durationMs = hrDuration[0] * 1000 + hrDuration[1] / 1000000;

      logger.debug(`Span completed: ${operationName}`, {
        trace_id: childContext.traceId,
        span_id: childContext.spanId,
        parent_span_id: childContext.parentSpanId,
        operation: operationName,
        duration_ms: durationMs.toFixed(3),
        ...metadata,
      });

      return durationMs;
    },
  };
};

/**
 * Trace decorator for async functions
 */
const traceAsync = (operationName, context) => async (fn) => {
  const span = createChildSpan(context, operationName);

  try {
    const result = await fn();
    span.end({ status: 'success' });
    return result;
  } catch (error) {
    span.end({
      status: 'error',
      error_name: error.name,
      error_message: error.message,
    });
    throw error;
  }
};

/**
 * Simple timing utility for measuring operations
 */
class Timer {
  constructor(name, context = {}) {
    this.name = name;
    this.context = context;
    this.startTime = Date.now();
    this.startHrTime = process.hrtime();
    this.checkpoints = [];
  }

  checkpoint(label) {
    const elapsed = this.elapsed();
    this.checkpoints.push({ label, elapsed, timestamp: Date.now() });
    return elapsed;
  }

  elapsed() {
    const hrDuration = process.hrtime(this.startHrTime);
    return hrDuration[0] * 1000 + hrDuration[1] / 1000000;
  }

  end(metadata = {}) {
    const duration = this.elapsed();
    const result = {
      operation: this.name,
      duration_ms: duration.toFixed(3),
      checkpoints: this.checkpoints,
      ...this.context,
      ...metadata,
    };

    if (duration > 1000) {
      logger.warn(`Slow operation: ${this.name}`, result);
    } else {
      logger.debug(`Operation completed: ${this.name}`, result);
    }

    return duration;
  }
}

module.exports = {
  TRACE_HEADERS,
  createTraceContext,
  extractTraceContext,
  injectTraceContext,
  createChildSpan,
  traceAsync,
  Timer,
};

