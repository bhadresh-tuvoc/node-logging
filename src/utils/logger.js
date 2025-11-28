/**
 * Production-Grade Logger
 * Winston-based logging with multiple transports, rotation, and structured logging
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure log directory exists
const logDir = path.resolve(config.logging.dir);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    const meta = metadata && Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${meta}`;
  })
);

// Create transports array
const transports = [];

// Console transport (always enabled in development)
if (config.app.isDevelopment) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    })
  );
} else {
  // In production, use JSON format for console (for log aggregators)
  transports.push(
    new winston.transports.Console({
      format: structuredFormat,
      level: config.logging.level,
    })
  );
}

// Rotating file transport for all logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    format: structuredFormat,
    zippedArchive: config.logging.compression,
    level: config.logging.level,
  })
);

// Separate rotating file for error logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    format: structuredFormat,
    zippedArchive: config.logging.compression,
    level: 'error',
  })
);

// Rotating file for access logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    format: structuredFormat,
    zippedArchive: config.logging.compression,
    level: 'http',
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    trace: 5,
  },
  defaultMeta: {
    service: config.app.name,
    version: config.app.version,
    environment: config.app.env,
    pid: process.pid,
    hostname: require('os').hostname(),
  },
  transports,
  exitOnError: false,
});

// Add colors for custom levels
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
  trace: 'cyan',
});

// Create child logger with request context
logger.child = (metadata) => {
  return winston.createLogger({
    level: logger.level,
    levels: logger.levels,
    defaultMeta: { ...logger.defaultMeta, ...metadata },
    transports: logger.transports,
    exitOnError: false,
  });
};

// Performance logging helper
logger.performance = (operation, durationMs, metadata = {}) => {
  const level = durationMs > 1000 ? 'warn' : 'info';
  logger.log(level, `Performance: ${operation}`, {
    operation,
    duration_ms: durationMs,
    slow: durationMs > 1000,
    ...metadata,
  });
};

// Audit logging helper
logger.audit = (action, userId, resource, metadata = {}) => {
  logger.info(`Audit: ${action}`, {
    audit: true,
    action,
    user_id: userId,
    resource,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

// Security logging helper
logger.security = (event, metadata = {}) => {
  logger.warn(`Security: ${event}`, {
    security: true,
    event,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

// Error with context helper
logger.errorWithContext = (message, error, context = {}) => {
  logger.error(message, {
    error_name: error.name,
    error_message: error.message,
    error_stack: error.stack,
    ...context,
  });
};

module.exports = logger;

