/**
 * Cluster Mode Entry Point
 * Production-ready clustering for multi-core utilization
 */

require('dotenv').config();

const cluster = require('cluster');
const os = require('os');
const logger = require('./utils/logger');
const config = require('./config');

// Number of workers (default to CPU count or env variable)
const numWorkers = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length;

// Cluster state
const clusterState = {
  isShuttingDown: false,
  workerRestarts: new Map(),
  maxRestartsPerMinute: 5,
};

if (cluster.isPrimary) {
  // ======================
  // Primary Process
  // ======================

  logger.info(`Primary process started`, {
    pid: process.pid,
    workers: numWorkers,
    cpus: os.cpus().length,
    environment: config.app.env,
  });

  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    forkWorker();
  }

  // Handle worker events
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker died`, {
      worker_id: worker.id,
      worker_pid: worker.process.pid,
      exit_code: code,
      signal,
    });

    // Don't restart if shutting down
    if (clusterState.isShuttingDown) {
      return;
    }

    // Check restart rate limit
    const now = Date.now();
    const restarts = clusterState.workerRestarts.get(worker.id) || [];
    const recentRestarts = restarts.filter((time) => now - time < 60000);

    if (recentRestarts.length >= clusterState.maxRestartsPerMinute) {
      logger.error(`Worker ${worker.id} restarting too frequently, not restarting`, {
        worker_id: worker.id,
        restart_count: recentRestarts.length,
        threshold: clusterState.maxRestartsPerMinute,
      });
      return;
    }

    // Track restart
    recentRestarts.push(now);
    clusterState.workerRestarts.set(worker.id, recentRestarts);

    // Restart worker
    logger.info(`Restarting worker`, { worker_id: worker.id });
    forkWorker();
  });

  cluster.on('online', (worker) => {
    logger.info(`Worker online`, {
      worker_id: worker.id,
      worker_pid: worker.process.pid,
    });
  });

  cluster.on('listening', (worker, address) => {
    logger.info(`Worker listening`, {
      worker_id: worker.id,
      worker_pid: worker.process.pid,
      address: address.address || 'localhost',
      port: address.port,
    });
  });

  cluster.on('disconnect', (worker) => {
    logger.warn(`Worker disconnected`, {
      worker_id: worker.id,
      worker_pid: worker.process.pid,
    });
  });

  // Message handling from workers
  cluster.on('message', (worker, message) => {
    if (message.type === 'log') {
      logger.info(`Message from worker ${worker.id}`, message.data);
    }
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    if (clusterState.isShuttingDown) {
      return;
    }

    clusterState.isShuttingDown = true;
    logger.info(`Primary received ${signal}, initiating graceful shutdown`, {
      signal,
      workers: Object.keys(cluster.workers).length,
    });

    // Send shutdown signal to all workers
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.send({ type: 'shutdown' });
      }
    }

    // Wait for workers to exit
    const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30000;
    const checkInterval = setInterval(() => {
      const workerCount = Object.keys(cluster.workers).length;
      if (workerCount === 0) {
        clearInterval(checkInterval);
        logger.info('All workers exited, primary shutting down');
        process.exit(0);
      }
    }, 500);

    // Force exit after timeout
    setTimeout(() => {
      logger.error('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, shutdownTimeout);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Zero-downtime restart
  process.on('SIGUSR2', () => {
    logger.info('Received SIGUSR2, performing rolling restart');
    const workerIds = Object.keys(cluster.workers);

    const restartNext = (index) => {
      if (index >= workerIds.length) {
        logger.info('Rolling restart complete');
        return;
      }

      const worker = cluster.workers[workerIds[index]];
      if (!worker) {
        restartNext(index + 1);
        return;
      }

      logger.info(`Restarting worker ${worker.id}`);

      // Fork new worker first
      const newWorker = cluster.fork();

      newWorker.on('listening', () => {
        // Disconnect old worker after new one is ready
        worker.disconnect();

        worker.on('exit', () => {
          // Restart next worker
          setTimeout(() => restartNext(index + 1), 1000);
        });
      });
    };

    restartNext(0);
  });

} else {
  // ======================
  // Worker Process
  // ======================

  logger.info(`Worker started`, {
    worker_id: cluster.worker.id,
    pid: process.pid,
  });

  // Handle shutdown message from primary
  process.on('message', (message) => {
    if (message.type === 'shutdown') {
      logger.info(`Worker ${cluster.worker.id} received shutdown signal`);
      process.emit('SIGTERM');
    }
  });

  // Start the server
  require('./server');
}

/**
 * Fork a new worker
 */
function forkWorker() {
  const worker = cluster.fork();

  // Set up heartbeat
  let lastHeartbeat = Date.now();

  worker.on('message', (msg) => {
    if (msg.type === 'heartbeat') {
      lastHeartbeat = Date.now();
    }
  });

  // Check heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    const timeSinceHeartbeat = Date.now() - lastHeartbeat;

    if (timeSinceHeartbeat > 60000) {
      logger.error(`Worker ${worker.id} heartbeat timeout, killing`, {
        worker_id: worker.id,
        time_since_heartbeat: timeSinceHeartbeat,
      });
      worker.kill();
    }
  }, 30000);

  worker.on('exit', () => {
    clearInterval(heartbeatInterval);
  });

  return worker;
}

// Send heartbeat from workers
if (!cluster.isPrimary) {
  setInterval(() => {
    try {
      process.send({ type: 'heartbeat' });
    } catch (err) {
      // Process might be disconnecting
    }
  }, 10000);
}

