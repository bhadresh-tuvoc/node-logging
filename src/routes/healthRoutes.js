/**
 * Health Check Routes
 * Kubernetes-compatible health and readiness probes
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { metrics, register } = require('../utils/metrics');
const config = require('../config');

// Health check state
const healthState = {
  isReady: false,
  isHealthy: true,
  startTime: Date.now(),
  checks: {
    database: { status: 'unknown', lastCheck: null },
    memory: { status: 'unknown', lastCheck: null },
    eventLoop: { status: 'unknown', lastCheck: null },
  },
};

// Thresholds
const MEMORY_THRESHOLD_PERCENT = 90;
const EVENT_LOOP_LAG_THRESHOLD_MS = 500;

/**
 * Mark application as ready
 */
const markReady = () => {
  healthState.isReady = true;
  metrics.healthStatus.labels('application').set(1);
  logger.info('Application marked as ready');
};

/**
 * Mark application as not ready
 */
const markNotReady = () => {
  healthState.isReady = false;
  metrics.healthStatus.labels('application').set(0);
  logger.warn('Application marked as not ready');
};

/**
 * Update health check status
 */
const updateHealthCheck = (checkName, status, details = {}) => {
  healthState.checks[checkName] = {
    status,
    lastCheck: new Date().toISOString(),
    ...details,
  };

  metrics.healthStatus.labels(checkName).set(status === 'healthy' ? 1 : 0);
};

/**
 * Run health checks
 */
const runHealthChecks = async () => {
  const checks = {};

  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  const memoryHealthy = heapUsedPercent < MEMORY_THRESHOLD_PERCENT;

  checks.memory = {
    status: memoryHealthy ? 'healthy' : 'unhealthy',
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsedPercent: `${heapUsedPercent.toFixed(1)}%`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
  };
  updateHealthCheck('memory', checks.memory.status, checks.memory);

  // Event loop check
  const eventLoopStart = Date.now();
  await new Promise((resolve) => setImmediate(resolve));
  const eventLoopLag = Date.now() - eventLoopStart;
  const eventLoopHealthy = eventLoopLag < EVENT_LOOP_LAG_THRESHOLD_MS;

  checks.eventLoop = {
    status: eventLoopHealthy ? 'healthy' : 'unhealthy',
    lag: `${eventLoopLag} ms`,
    threshold: `${EVENT_LOOP_LAG_THRESHOLD_MS} ms`,
  };
  updateHealthCheck('eventLoop', checks.eventLoop.status, checks.eventLoop);

  // Database check (simulated)
  checks.database = {
    status: 'healthy',
    connected: true,
    latency: `${config.database.latencyMs} ms`,
  };
  updateHealthCheck('database', checks.database.status, checks.database);

  // Update overall health
  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');
  healthState.isHealthy = allHealthy;

  return checks;
};

/**
 * @route   GET /health
 * @desc    Basic health check (for load balancers)
 */
router.get('/', async (req, res) => {
  const checks = await runHealthChecks();
  const isHealthy = healthState.isHealthy;

  const response = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - healthState.startTime) / 1000),
    version: config.app.version,
    environment: config.app.env,
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

/**
 * @route   GET /health/live
 * @desc    Kubernetes liveness probe
 */
router.get('/live', (req, res) => {
  // Liveness just checks if the process is running
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
});

/**
 * @route   GET /health/ready
 * @desc    Kubernetes readiness probe
 */
router.get('/ready', async (req, res) => {
  if (!healthState.isReady) {
    return res.status(503).json({
      status: 'not_ready',
      message: 'Application is starting up',
      timestamp: new Date().toISOString(),
    });
  }

  const checks = await runHealthChecks();

  res.status(healthState.isHealthy ? 200 : 503).json({
    status: healthState.isHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with all components
 */
router.get('/detailed', async (req, res) => {
  const checks = await runHealthChecks();
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const response = {
    status: healthState.isHealthy ? 'healthy' : 'unhealthy',
    ready: healthState.isReady,
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.round((Date.now() - healthState.startTime) / 1000),
      human: formatUptime(Date.now() - healthState.startTime),
    },
    application: {
      name: config.app.name,
      version: config.app.version,
      environment: config.app.env,
      pid: process.pid,
      nodeVersion: process.version,
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      hostname: require('os').hostname(),
      cpus: require('os').cpus().length,
      loadAverage: require('os').loadavg(),
      freeMemory: `${Math.round(require('os').freemem() / 1024 / 1024)} MB`,
      totalMemory: `${Math.round(require('os').totalmem() / 1024 / 1024)} MB`,
    },
    process: {
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
        arrayBuffers: `${Math.round((memUsage.arrayBuffers || 0) / 1024 / 1024)} MB`,
      },
      cpu: {
        user: `${(cpuUsage.user / 1000000).toFixed(2)}s`,
        system: `${(cpuUsage.system / 1000000).toFixed(2)}s`,
      },
    },
    checks,
  };

  res.json(response);
});

/**
 * @route   GET /metrics
 * @desc    Prometheus metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).end(error.message);
  }
});

/**
 * Format uptime to human readable
 */
const formatUptime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

module.exports = {
  router,
  markReady,
  markNotReady,
  updateHealthCheck,
  healthState,
};

