/**
 * Server Entry Point
 * Production-ready server with graceful shutdown
 */

require('dotenv').config();

const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { markReady, markNotReady } = require('./routes/healthRoutes');
const UserModel = require('./models/User');

// Create HTTP server
const server = http.createServer(app);

// Server state
const serverState = {
  isShuttingDown: false,
  connections: new Set(),
};

// Track connections for graceful shutdown
server.on('connection', (connection) => {
  serverState.connections.add(connection);
  connection.on('close', () => {
    serverState.connections.delete(connection);
  });
});

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal) => {
  if (serverState.isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }

  serverState.isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`, {
    signal,
    active_connections: serverState.connections.size,
  });

  // Mark as not ready (stop receiving new requests from load balancer)
  markNotReady();

  // Give load balancer time to stop sending traffic
  const drainDelay = parseInt(process.env.DRAIN_DELAY_MS, 10) || 5000;
  logger.info(`Waiting ${drainDelay}ms for load balancer drain...`);
  await new Promise((resolve) => setTimeout(resolve, drainDelay));

  // Close server (stop accepting new connections)
  server.close((err) => {
    if (err) {
      logger.error('Error closing server', { error: err.message });
    } else {
      logger.info('Server closed successfully');
    }
  });

  // Set timeout for force shutdown
  const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30000;
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Forced shutdown due to timeout', {
      timeout_ms: shutdownTimeout,
      remaining_connections: serverState.connections.size,
    });
    process.exit(1);
  }, shutdownTimeout);

  // Destroy remaining connections
  for (const connection of serverState.connections) {
    connection.end();
    setTimeout(() => {
      if (!connection.destroyed) {
        connection.destroy();
      }
    }, 5000);
  }

  // Wait for all connections to close
  const checkConnections = setInterval(() => {
    if (serverState.connections.size === 0) {
      clearInterval(checkConnections);
      clearTimeout(forceShutdownTimer);

      logger.info('All connections closed, shutting down');
      process.exit(0);
    }
  }, 100);
};

/**
 * Start the server
 */
const startServer = async () => {
  try {
    // Pre-startup initialization
    logger.info('Initializing application...', {
      environment: config.app.env,
      node_version: process.version,
      pid: process.pid,
    });

    // Seed some sample data for testing
    if (config.app.isDevelopment) {
      await UserModel.seed(10);
      logger.info('Sample data seeded');
    }

    // Start listening
    server.listen(config.app.port, () => {
      logger.info(`Server started successfully`, {
        port: config.app.port,
        environment: config.app.env,
        node_version: process.version,
        pid: process.pid,
        debug_mode: config.debug.enabled,
      });

      // Mark as ready after successful startup
      markReady();
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.app.port} is already in use`, {
          port: config.app.port,
          error_code: error.code,
        });
        process.exit(1);
      }
      throw error;
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    });
    process.exit(1);
  }
};

// ======================
// Process Event Handlers
// ======================

// Graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promise: promise.toString(),
  });

  // In production, you might want to exit
  // process.exit(1);
});

// Uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error_name: error.name,
    error_message: error.message,
    error_stack: error.stack,
  });

  // Force shutdown on uncaught exception
  gracefulShutdown('uncaughtException').then(() => {
    process.exit(1);
  });
});

// Warning handler
process.on('warning', (warning) => {
  logger.warn('Process Warning', {
    warning_name: warning.name,
    warning_message: warning.message,
    warning_stack: warning.stack,
  });
});

// Start the server
startServer();

module.exports = server;

