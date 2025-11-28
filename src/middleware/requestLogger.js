/**
 * Request Logger Middleware
 * Comprehensive HTTP request/response logging with timing
 */

const onFinished = require('on-finished');
const logger = require('../utils/logger');
const { metrics, normalizeRoute, getStatusClass } = require('../utils/metrics');
const { createTraceContext, extractTraceContext, TRACE_HEADERS } = require('../utils/tracing');

const requestLogger = (req, res, next) => {
  // Extract or create trace context
  const existingContext = extractTraceContext(req.headers);
  const traceContext = createTraceContext(existingContext);

  // Attach to request for downstream use
  req.traceContext = traceContext;
  req.requestId = traceContext.requestId;

  // Set response headers for trace propagation
  res.setHeader(TRACE_HEADERS.REQUEST_ID, traceContext.requestId);
  res.setHeader(TRACE_HEADERS.TRACE_ID, traceContext.traceId);

  // Create request-scoped logger
  req.logger = logger.child({
    request_id: traceContext.requestId,
    trace_id: traceContext.traceId,
    span_id: traceContext.spanId,
  });

  // Track request size
  const requestSize = parseInt(req.headers['content-length'], 10) || 0;

  // Increment active requests
  metrics.httpActiveRequests.labels(req.method).inc();

  // Log request start
  req.logger.http('Request started', {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    user_agent: req.headers['user-agent'],
    ip: req.ip || req.socket.remoteAddress,
    content_length: requestSize,
    content_type: req.headers['content-type'],
  });

  // Track request body for non-GET requests (sanitized)
  if (req.method !== 'GET' && req.body) {
    req.logger.debug('Request body', {
      body: sanitizeBody(req.body),
    });
  }

  // Track timing when response finishes
  onFinished(res, (err, res) => {
    const hrDuration = process.hrtime(traceContext.startHrTime);
    const durationMs = hrDuration[0] * 1000 + hrDuration[1] / 1000000;
    const durationSeconds = durationMs / 1000;

    const route = normalizeRoute(req.route?.path || req.path);
    const statusCode = res.statusCode;
    const statusClass = getStatusClass(statusCode);

    // Decrement active requests
    metrics.httpActiveRequests.labels(req.method).dec();

    // Record metrics
    metrics.httpRequestDuration.labels(req.method, route, statusCode, statusClass).observe(durationSeconds);
    metrics.httpRequestTotal.labels(req.method, route, statusCode, statusClass).inc();

    if (requestSize > 0) {
      metrics.httpRequestSize.labels(req.method, route).observe(requestSize);
    }

    const responseSize = parseInt(res.getHeader('content-length'), 10) || 0;
    if (responseSize > 0) {
      metrics.httpResponseSize.labels(req.method, route, statusCode).observe(responseSize);
    }

    // Determine log level based on status and duration
    let logLevel = 'http';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    } else if (durationMs > 3000) {
      logLevel = 'warn';
    }

    // Log response
    req.logger.log(logLevel, 'Request completed', {
      method: req.method,
      url: req.originalUrl,
      route,
      status_code: statusCode,
      status_class: statusClass,
      duration_ms: durationMs.toFixed(3),
      response_size: responseSize,
      slow: durationMs > 1000,
      error: err ? err.message : null,
    });

    // Performance warning for slow requests
    if (durationMs > 1000) {
      logger.performance('slow_request', durationMs, {
        method: req.method,
        route,
        status_code: statusCode,
      });
    }
  });

  next();
};

/**
 * Sanitize request body to remove sensitive data
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization', 'creditCard', 'ssn'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
};

module.exports = requestLogger;

