/**
 * Configuration Management
 * Centralized configuration with environment variable validation
 */

require('dotenv').config();

const config = {
  // Application
  app: {
    name: process.env.APP_NAME || 'node-production-app',
    version: process.env.APP_VERSION || '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 4000,
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    dir: process.env.LOG_DIR || './logs',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    compression: process.env.LOG_COMPRESSION === 'true',
  },

  // Monitoring
  monitoring: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    prefix: process.env.METRICS_PREFIX || 'app_',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // Database (simulated)
  database: {
    latencyMs: parseInt(process.env.DB_LATENCY_MS, 10) || 50,
    errorRate: parseFloat(process.env.DB_ERROR_RATE) || 0.01,
  },

  // Debug Scenarios
  debug: {
    enabled: process.env.ENABLE_DEBUG_SCENARIOS === 'true',
    memoryLeakSizeMB: parseInt(process.env.MEMORY_LEAK_SIZE_MB, 10) || 10,
    cpuIterations: parseInt(process.env.CPU_INTENSIVE_ITERATIONS, 10) || 1000000,
  },
};

// Validate required configuration
const validateConfig = () => {
  const requiredEnvVars = [];
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
};

validateConfig();

module.exports = config;

