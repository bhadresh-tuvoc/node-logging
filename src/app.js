/**
 * Express Application Setup
 * Production-configured Express application with all middleware
 */

const express = require('express');
const compression = require('compression');
const config = require('./config');
const logger = require('./utils/logger');

// Middleware
const { helmetConfig, corsConfig, rateLimiter, sanitizeRequest } = require('./middleware/security');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Routes
const userRoutes = require('./routes/userRoutes');
const { router: healthRoutes } = require('./routes/healthRoutes');
const debugScenarios = require('./scenarios/debugScenarios');

// Create Express app
const app = express();

// Trust proxy (for when behind load balancer/reverse proxy)
app.set('trust proxy', 1);

// ======================
// Core Middleware
// ======================

// Security headers
app.use(helmetConfig);

// CORS
app.use(corsConfig);

// Compression
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses > 1KB
}));

// Body parsing
app.use(express.json({
  limit: '10mb',
  strict: true,
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
}));

// Request sanitization
app.use(sanitizeRequest);

// Request logging and tracing
app.use(requestLogger);

// Rate limiting (apply to API routes)
app.use('/api', rateLimiter());

// ======================
// Routes
// ======================

// Health check routes (no rate limiting)
app.use('/health', healthRoutes);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const { register } = require('./utils/metrics');
    res.set('Content-Type', register.contentType);
    const metricsData = await register.metrics();
    res.end(metricsData);
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// API routes
app.use('/api/users', userRoutes);

// Debug scenarios (only in development/testing)
if (config.debug.enabled) {
  logger.warn('Debug scenarios enabled - DO NOT use in production!');
  app.use('/debug', debugScenarios);
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: config.app.name,
    version: config.app.version,
    environment: config.app.env,
    documentation: '/health/detailed for system info',
    endpoints: {
      health: '/health',
      healthDetailed: '/health/detailed',
      metrics: '/metrics',
      users: '/api/users',
      debug: config.debug.enabled ? '/debug' : 'disabled',
    },
  });
});

// ======================
// Error Handling
// ======================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;

