/**
 * Debug Scenarios
 * Simulated real-world issues for testing monitoring and debugging
 * 
 * WARNING: These endpoints are for development/testing only!
 * Never expose these in production without proper authentication.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const config = require('../config');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// Memory leak storage (intentional)
let memoryLeakStorage = [];
let leakIntervalId = null;

/**
 * @route   POST /debug/memory-leak/start
 * @desc    Start a simulated memory leak
 */
router.post('/memory-leak/start', asyncHandler(async (req, res) => {
  const sizeMB = req.body.sizeMB || config.debug.memoryLeakSizeMB;
  const intervalMs = req.body.intervalMs || 1000;

  if (leakIntervalId) {
    return res.status(400).json({
      success: false,
      error: { message: 'Memory leak simulation already running' },
    });
  }

  logger.warn('Starting memory leak simulation', {
    size_mb: sizeMB,
    interval_ms: intervalMs,
    scenario: 'memory_leak',
  });

  leakIntervalId = setInterval(() => {
    // Allocate memory that won't be garbage collected
    const leak = Buffer.alloc(sizeMB * 1024 * 1024);
    leak.fill('x');
    memoryLeakStorage.push(leak);

    const memUsage = process.memoryUsage();
    logger.error('Memory leak growing', {
      scenario: 'memory_leak',
      leaked_buffers: memoryLeakStorage.length,
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
    });
  }, intervalMs);

  res.json({
    success: true,
    message: 'Memory leak simulation started',
    data: { sizeMB, intervalMs },
  });
}));

/**
 * @route   POST /debug/memory-leak/stop
 * @desc    Stop the memory leak simulation and clean up
 */
router.post('/memory-leak/stop', asyncHandler(async (req, res) => {
  if (leakIntervalId) {
    clearInterval(leakIntervalId);
    leakIntervalId = null;
  }

  const leakedCount = memoryLeakStorage.length;
  memoryLeakStorage = [];

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    logger.info('Forced garbage collection after memory leak cleanup');
  }

  logger.info('Memory leak simulation stopped', {
    scenario: 'memory_leak',
    cleaned_buffers: leakedCount,
  });

  res.json({
    success: true,
    message: 'Memory leak simulation stopped and memory released',
    data: { cleanedBuffers: leakedCount },
  });
}));

/**
 * @route   GET /debug/memory-leak/status
 * @desc    Get current memory leak status
 */
router.get('/memory-leak/status', asyncHandler(async (req, res) => {
  const memUsage = process.memoryUsage();

  res.json({
    success: true,
    data: {
      isRunning: !!leakIntervalId,
      leakedBuffers: memoryLeakStorage.length,
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
      },
    },
  });
}));

/**
 * @route   POST /debug/cpu-intensive
 * @desc    Simulate CPU-intensive operation that blocks event loop
 */
router.post('/cpu-intensive', asyncHandler(async (req, res) => {
  const iterations = req.body.iterations || config.debug.cpuIterations;

  logger.warn('Starting CPU-intensive operation', {
    scenario: 'cpu_spike',
    iterations,
  });

  const startTime = Date.now();
  const startCpu = process.cpuUsage();

  // CPU-intensive calculation (blocking)
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i) * Math.sin(i);
  }

  const endCpu = process.cpuUsage(startCpu);
  const durationMs = Date.now() - startTime;

  logger.error('CPU-intensive operation completed', {
    scenario: 'cpu_spike',
    iterations,
    duration_ms: durationMs,
    cpu_user_ms: endCpu.user / 1000,
    cpu_system_ms: endCpu.system / 1000,
    event_loop_blocked: true,
  });

  res.json({
    success: true,
    message: 'CPU-intensive operation completed',
    data: {
      iterations,
      durationMs,
      cpuUsage: {
        user: `${(endCpu.user / 1000).toFixed(2)} ms`,
        system: `${(endCpu.system / 1000).toFixed(2)} ms`,
      },
      result: result.toFixed(6),
    },
  });
}));

/**
 * @route   GET /debug/slow-endpoint
 * @desc    Simulate a slow endpoint (e.g., slow database query)
 */
router.get('/slow-endpoint', asyncHandler(async (req, res) => {
  const delayMs = parseInt(req.query.delay, 10) || 5000;
  const maxDelay = 30000;

  const actualDelay = Math.min(delayMs, maxDelay);

  logger.warn('Processing slow endpoint', {
    scenario: 'slow_endpoint',
    requested_delay_ms: delayMs,
    actual_delay_ms: actualDelay,
  });

  const startTime = Date.now();

  await new Promise((resolve) => setTimeout(resolve, actualDelay));

  const duration = Date.now() - startTime;

  logger.performance('slow_endpoint_completed', duration, {
    scenario: 'slow_endpoint',
    requested_delay: delayMs,
  });

  res.json({
    success: true,
    message: 'Slow endpoint completed',
    data: {
      requestedDelay: delayMs,
      actualDelay: actualDelay,
      actualDuration: duration,
    },
  });
}));

/**
 * @route   POST /debug/error/:type
 * @desc    Simulate various error types
 */
router.post('/error/:type', asyncHandler(async (req, res) => {
  const { type } = req.params;

  logger.warn('Simulating error scenario', {
    scenario: 'error_simulation',
    error_type: type,
  });

  switch (type) {
    case 'unhandled':
      // Simulate unhandled error
      throw new Error('Simulated unhandled error');

    case 'async':
      // Simulate async error
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Simulated async error')), 100);
      });
      break;

    case 'validation':
      throw new AppError('Simulated validation error', 400, 'VALIDATION_ERROR', {
        fields: ['email', 'name'],
      });

    case 'database':
      throw new AppError('Simulated database connection error', 503, 'DATABASE_ERROR', {
        database: 'primary',
        retryAfter: 30,
      });

    case 'timeout':
      throw new AppError('Simulated request timeout', 504, 'GATEWAY_TIMEOUT');

    case 'rate-limit':
      throw new AppError('Simulated rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', {
        retryAfter: 60,
      });

    case 'unauthorized':
      throw new AppError('Simulated unauthorized access', 401, 'UNAUTHORIZED');

    case 'forbidden':
      throw new AppError('Simulated forbidden access', 403, 'FORBIDDEN');

    case 'not-found':
      throw new AppError('Simulated resource not found', 404, 'NOT_FOUND');

    case 'conflict':
      throw new AppError('Simulated resource conflict', 409, 'CONFLICT');

    default:
      throw new AppError(`Unknown error type: ${type}`, 400, 'INVALID_ERROR_TYPE');
  }
}));

/**
 * @route   POST /debug/unhandled-promise
 * @desc    Simulate unhandled promise rejection
 */
router.post('/unhandled-promise', (req, res) => {
  logger.warn('Triggering unhandled promise rejection', {
    scenario: 'unhandled_promise',
  });

  // This creates an unhandled promise rejection
  Promise.reject(new Error('Simulated unhandled promise rejection'));

  res.json({
    success: true,
    message: 'Unhandled promise rejection triggered - check logs',
  });
});

/**
 * @route   POST /debug/cascade-failure
 * @desc    Simulate cascade failure with multiple dependent operations
 */
router.post('/cascade-failure', asyncHandler(async (req, res) => {
  logger.warn('Starting cascade failure simulation', {
    scenario: 'cascade_failure',
  });

  const results = [];

  // Step 1: Database query (might fail)
  try {
    logger.info('Cascade step 1: Database query');
    if (Math.random() < 0.3) {
      throw new Error('Database connection failed');
    }
    results.push({ step: 1, status: 'success', operation: 'database_query' });
  } catch (err) {
    results.push({ step: 1, status: 'failed', operation: 'database_query', error: err.message });
    throw new AppError('Cascade failure at step 1: Database', 503, 'CASCADE_FAILURE', { results });
  }

  // Step 2: External API call (might fail)
  try {
    logger.info('Cascade step 2: External API call');
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (Math.random() < 0.3) {
      throw new Error('External API timeout');
    }
    results.push({ step: 2, status: 'success', operation: 'external_api' });
  } catch (err) {
    results.push({ step: 2, status: 'failed', operation: 'external_api', error: err.message });
    throw new AppError('Cascade failure at step 2: External API', 503, 'CASCADE_FAILURE', { results });
  }

  // Step 3: Cache operation (might fail)
  try {
    logger.info('Cascade step 3: Cache operation');
    if (Math.random() < 0.3) {
      throw new Error('Cache write failed');
    }
    results.push({ step: 3, status: 'success', operation: 'cache_write' });
  } catch (err) {
    results.push({ step: 3, status: 'failed', operation: 'cache_write', error: err.message });
    throw new AppError('Cascade failure at step 3: Cache', 503, 'CASCADE_FAILURE', { results });
  }

  logger.info('Cascade operation completed successfully', {
    scenario: 'cascade_failure',
    results,
  });

  res.json({
    success: true,
    message: 'All cascade operations completed successfully',
    data: { results },
  });
}));

/**
 * @route   GET /debug/event-loop-delay
 * @desc    Measure event loop delay
 */
router.get('/event-loop-delay', asyncHandler(async (req, res) => {
  const samples = parseInt(req.query.samples, 10) || 10;
  const delays = [];

  for (let i = 0; i < samples; i++) {
    const start = Date.now();
    await new Promise((resolve) => setImmediate(resolve));
    const delay = Date.now() - start;
    delays.push(delay);
  }

  const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
  const max = Math.max(...delays);
  const min = Math.min(...delays);

  logger.info('Event loop delay measurement', {
    scenario: 'event_loop_health',
    samples,
    avg_delay_ms: avg.toFixed(2),
    max_delay_ms: max,
    min_delay_ms: min,
  });

  res.json({
    success: true,
    data: {
      samples,
      delays,
      statistics: {
        average: `${avg.toFixed(2)} ms`,
        max: `${max} ms`,
        min: `${min} ms`,
      },
      healthy: avg < 100,
    },
  });
}));

/**
 * @route   POST /debug/high-concurrency
 * @desc    Simulate high concurrency scenario
 */
router.post('/high-concurrency', asyncHandler(async (req, res) => {
  const concurrent = Math.min(req.body.concurrent || 100, 1000);
  const operationMs = req.body.operationMs || 100;

  logger.warn('Starting high concurrency simulation', {
    scenario: 'high_concurrency',
    concurrent_operations: concurrent,
    operation_duration_ms: operationMs,
  });

  const startTime = Date.now();
  const startMem = process.memoryUsage().heapUsed;

  // Create concurrent operations
  const operations = Array(concurrent).fill().map(async (_, i) => {
    await new Promise((resolve) => setTimeout(resolve, operationMs));
    return { operationId: i, completed: true };
  });

  const results = await Promise.all(operations);

  const duration = Date.now() - startTime;
  const endMem = process.memoryUsage().heapUsed;

  logger.info('High concurrency simulation completed', {
    scenario: 'high_concurrency',
    concurrent_operations: concurrent,
    duration_ms: duration,
    memory_delta_mb: ((endMem - startMem) / 1024 / 1024).toFixed(2),
    throughput: (concurrent / (duration / 1000)).toFixed(2),
  });

  res.json({
    success: true,
    data: {
      concurrentOperations: concurrent,
      totalDuration: `${duration} ms`,
      operationsPerSecond: (concurrent / (duration / 1000)).toFixed(2),
      memoryDelta: `${((endMem - startMem) / 1024 / 1024).toFixed(2)} MB`,
      completed: results.length,
    },
  });
}));

/**
 * @route   GET /debug/gc-stats
 * @desc    Get garbage collection statistics (requires --expose-gc flag)
 */
router.get('/gc-stats', asyncHandler(async (req, res) => {
  const memBefore = process.memoryUsage();

  if (global.gc) {
    const startTime = Date.now();
    global.gc();
    const gcDuration = Date.now() - startTime;

    const memAfter = process.memoryUsage();

    logger.info('Manual garbage collection triggered', {
      scenario: 'gc_stats',
      gc_duration_ms: gcDuration,
      heap_freed_mb: ((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024).toFixed(2),
    });

    res.json({
      success: true,
      data: {
        gcAvailable: true,
        gcDuration: `${gcDuration} ms`,
        before: {
          heapUsed: `${(memBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memBefore.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        },
        after: {
          heapUsed: `${(memAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memAfter.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        },
        freed: `${((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024).toFixed(2)} MB`,
      },
    });
  } else {
    res.json({
      success: true,
      data: {
        gcAvailable: false,
        message: 'Run with --expose-gc flag to enable manual GC',
        currentMemory: {
          heapUsed: `${(memBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memBefore.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          rss: `${(memBefore.rss / 1024 / 1024).toFixed(2)} MB`,
        },
      },
    });
  }
}));

/**
 * @route   POST /debug/logging-stress
 * @desc    Stress test the logging system
 */
router.post('/logging-stress', asyncHandler(async (req, res) => {
  const count = Math.min(req.body.count || 1000, 10000);
  const levels = ['debug', 'info', 'warn', 'error'];

  logger.warn('Starting logging stress test', {
    scenario: 'logging_stress',
    log_count: count,
  });

  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    const level = levels[Math.floor(Math.random() * levels.length)];
    logger[level](`Stress test log message ${i}`, {
      scenario: 'logging_stress',
      iteration: i,
      random_data: Math.random().toString(36).substring(7),
    });
  }

  const duration = Date.now() - startTime;

  logger.info('Logging stress test completed', {
    scenario: 'logging_stress',
    log_count: count,
    duration_ms: duration,
    logs_per_second: (count / (duration / 1000)).toFixed(2),
  });

  res.json({
    success: true,
    data: {
      logsGenerated: count,
      duration: `${duration} ms`,
      logsPerSecond: (count / (duration / 1000)).toFixed(2),
    },
  });
}));

module.exports = router;

