/**
 * Prometheus Metrics
 * Production-grade metrics collection for monitoring and observability
 */

const client = require('prom-client');
const config = require('../config');
const logger = require('./logger');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: config.monitoring.prefix,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// Custom Metrics

// HTTP Request Duration Histogram
const httpRequestDuration = new client.Histogram({
  name: `${config.monitoring.prefix}http_request_duration_seconds`,
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// HTTP Request Counter
const httpRequestTotal = new client.Counter({
  name: `${config.monitoring.prefix}http_requests_total`,
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
  registers: [register],
});

// Active Requests Gauge
const httpActiveRequests = new client.Gauge({
  name: `${config.monitoring.prefix}http_active_requests`,
  help: 'Number of active HTTP requests',
  labelNames: ['method'],
  registers: [register],
});

// Request Size Histogram
const httpRequestSize = new client.Histogram({
  name: `${config.monitoring.prefix}http_request_size_bytes`,
  help: 'Size of HTTP request bodies in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

// Response Size Histogram
const httpResponseSize = new client.Histogram({
  name: `${config.monitoring.prefix}http_response_size_bytes`,
  help: 'Size of HTTP response bodies in bytes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

// Error Counter
const errorTotal = new client.Counter({
  name: `${config.monitoring.prefix}errors_total`,
  help: 'Total number of errors',
  labelNames: ['type', 'code', 'handler'],
  registers: [register],
});

// Database Query Duration
const dbQueryDuration = new client.Histogram({
  name: `${config.monitoring.prefix}db_query_duration_seconds`,
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Cache Metrics
const cacheOperations = new client.Counter({
  name: `${config.monitoring.prefix}cache_operations_total`,
  help: 'Total number of cache operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// Business Metrics
const userOperations = new client.Counter({
  name: `${config.monitoring.prefix}user_operations_total`,
  help: 'Total number of user-related operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// Memory Usage (custom tracking beyond default)
const memoryUsageCustom = new client.Gauge({
  name: `${config.monitoring.prefix}memory_usage_custom_bytes`,
  help: 'Custom memory usage tracking',
  labelNames: ['type'],
  registers: [register],
});

// Event Loop Lag
const eventLoopLag = new client.Gauge({
  name: `${config.monitoring.prefix}event_loop_lag_seconds`,
  help: 'Event loop lag in seconds',
  registers: [register],
});

// Health Status
const healthStatus = new client.Gauge({
  name: `${config.monitoring.prefix}health_status`,
  help: 'Application health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
  registers: [register],
});

// Uptime
const uptimeSeconds = new client.Gauge({
  name: `${config.monitoring.prefix}uptime_seconds`,
  help: 'Application uptime in seconds',
  registers: [register],
});

// Start time tracking
const startTime = Date.now();

// Update event loop lag periodically
let lastCheck = Date.now();
const updateEventLoopLag = () => {
  const now = Date.now();
  const lag = (now - lastCheck - 1000) / 1000; // Expected 1000ms, measure actual
  eventLoopLag.set(Math.max(0, lag));
  lastCheck = now;
};

setInterval(updateEventLoopLag, 1000);

// Update memory usage periodically
const updateMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  memoryUsageCustom.labels('heapUsed').set(memUsage.heapUsed);
  memoryUsageCustom.labels('heapTotal').set(memUsage.heapTotal);
  memoryUsageCustom.labels('external').set(memUsage.external);
  memoryUsageCustom.labels('rss').set(memUsage.rss);

  // Update uptime
  uptimeSeconds.set((Date.now() - startTime) / 1000);
};

setInterval(updateMemoryUsage, 5000);

// Helper to track database queries
const trackDbQuery = async (operation, table, queryFn) => {
  const timer = dbQueryDuration.startTimer({ operation, table });
  try {
    const result = await queryFn();
    timer({ success: 'true' });
    return result;
  } catch (error) {
    timer({ success: 'false' });
    throw error;
  }
};

// Helper to normalize route paths (replace IDs with :id)
const normalizeRoute = (path) => {
  if (!path) return 'unknown';
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
};

// Get status class (2xx, 4xx, 5xx)
const getStatusClass = (statusCode) => {
  return `${Math.floor(statusCode / 100)}xx`;
};

module.exports = {
  register,
  metrics: {
    httpRequestDuration,
    httpRequestTotal,
    httpActiveRequests,
    httpRequestSize,
    httpResponseSize,
    errorTotal,
    dbQueryDuration,
    cacheOperations,
    userOperations,
    memoryUsageCustom,
    eventLoopLag,
    healthStatus,
    uptimeSeconds,
  },
  trackDbQuery,
  normalizeRoute,
  getStatusClass,
};

