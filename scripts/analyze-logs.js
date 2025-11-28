/**
 * Log Analysis Script
 * Analyze log files for patterns, errors, and performance issues
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOG_DIR = process.env.LOG_DIR || './logs';

async function analyzeLogFile(filePath) {
  const stats = {
    totalLines: 0,
    byLevel: {},
    errors: [],
    slowRequests: [],
    auditEvents: [],
    securityEvents: [],
    uniqueRequestIds: new Set(),
    uniqueTraceIds: new Set(),
    requestsByRoute: {},
    errorsByType: {},
    avgResponseTime: 0,
    responseTimes: [],
  };

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      const log = JSON.parse(line);
      stats.totalLines++;

      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

      // Track request IDs
      if (log.metadata?.request_id) {
        stats.uniqueRequestIds.add(log.metadata.request_id);
      }
      if (log.metadata?.trace_id) {
        stats.uniqueTraceIds.add(log.metadata.trace_id);
      }

      // Track errors
      if (log.level === 'error') {
        stats.errors.push({
          timestamp: log.timestamp,
          message: log.message,
          code: log.metadata?.error_code,
          stack: log.metadata?.error_stack?.substring(0, 200),
        });

        const errorType = log.metadata?.error_code || 'unknown';
        stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
      }

      // Track slow requests
      if (log.metadata?.slow === true || log.metadata?.duration_ms > 1000) {
        stats.slowRequests.push({
          timestamp: log.timestamp,
          route: log.metadata?.route,
          duration: log.metadata?.duration_ms,
        });
      }

      // Track audit events
      if (log.metadata?.audit === true) {
        stats.auditEvents.push({
          timestamp: log.timestamp,
          action: log.metadata?.action,
          userId: log.metadata?.user_id,
          resource: log.metadata?.resource,
        });
      }

      // Track security events
      if (log.metadata?.security === true) {
        stats.securityEvents.push({
          timestamp: log.timestamp,
          event: log.metadata?.event,
        });
      }

      // Track response times
      if (log.metadata?.duration_ms) {
        const duration = parseFloat(log.metadata.duration_ms);
        if (!isNaN(duration)) {
          stats.responseTimes.push(duration);
        }
      }

      // Track routes
      if (log.metadata?.route) {
        const route = `${log.metadata.method || 'GET'} ${log.metadata.route}`;
        stats.requestsByRoute[route] = (stats.requestsByRoute[route] || 0) + 1;
      }

    } catch (e) {
      // Skip non-JSON lines
    }
  }

  // Calculate average response time
  if (stats.responseTimes.length > 0) {
    stats.avgResponseTime = (
      stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
    ).toFixed(2);
    stats.maxResponseTime = Math.max(...stats.responseTimes).toFixed(2);
    stats.minResponseTime = Math.min(...stats.responseTimes).toFixed(2);
    stats.p95ResponseTime = percentile(stats.responseTimes, 95).toFixed(2);
    stats.p99ResponseTime = percentile(stats.responseTimes, 99).toFixed(2);
  }

  return {
    file: path.basename(filePath),
    ...stats,
    uniqueRequestIds: stats.uniqueRequestIds.size,
    uniqueTraceIds: stats.uniqueTraceIds.size,
    responseTimes: undefined, // Don't include raw array in output
  };
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function main() {
  console.log('\\n📊 Log Analysis Report');
  console.log('='.repeat(60));

  const logDir = path.resolve(LOG_DIR);

  if (!fs.existsSync(logDir)) {
    console.log(`\\n❌ Log directory not found: ${logDir}`);
    console.log('Run the application first to generate logs.');
    return;
  }

  const logFiles = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));

  if (logFiles.length === 0) {
    console.log('\\n❌ No log files found.');
    return;
  }

  console.log(`\\n📁 Found ${logFiles.length} log files in ${logDir}\\n`);

  for (const file of logFiles) {
    const filePath = path.join(logDir, file);
    const stats = await analyzeLogFile(filePath);

    console.log(`\\n📄 ${stats.file}`);
    console.log('-'.repeat(40));

    console.log(`   Total Lines: ${stats.totalLines}`);
    console.log(`   Unique Requests: ${stats.uniqueRequestIds}`);
    console.log(`   Unique Traces: ${stats.uniqueTraceIds}`);

    console.log('\\n   📈 Log Levels:');
    for (const [level, count] of Object.entries(stats.byLevel)) {
      const emoji = {
        error: '🔴',
        warn: '🟡',
        info: '🟢',
        http: '🔵',
        debug: '⚪',
      }[level] || '⚫';
      console.log(`      ${emoji} ${level}: ${count}`);
    }

    if (stats.avgResponseTime) {
      console.log('\\n   ⏱️  Response Times:');
      console.log(`      Avg: ${stats.avgResponseTime}ms`);
      console.log(`      Min: ${stats.minResponseTime}ms`);
      console.log(`      Max: ${stats.maxResponseTime}ms`);
      console.log(`      P95: ${stats.p95ResponseTime}ms`);
      console.log(`      P99: ${stats.p99ResponseTime}ms`);
    }

    if (Object.keys(stats.requestsByRoute).length > 0) {
      console.log('\\n   🛤️  Top Routes:');
      const sorted = Object.entries(stats.requestsByRoute)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [route, count] of sorted) {
        console.log(`      ${route}: ${count}`);
      }
    }

    if (stats.errors.length > 0) {
      console.log(`\\n   ❌ Errors (${stats.errors.length} total):`);
      const recentErrors = stats.errors.slice(-5);
      for (const error of recentErrors) {
        console.log(`      [${error.timestamp}] ${error.code || 'ERROR'}: ${error.message}`);
      }
    }

    if (Object.keys(stats.errorsByType).length > 0) {
      console.log('\\n   📊 Errors by Type:');
      for (const [type, count] of Object.entries(stats.errorsByType)) {
        console.log(`      ${type}: ${count}`);
      }
    }

    if (stats.slowRequests.length > 0) {
      console.log(`\\n   🐌 Slow Requests (${stats.slowRequests.length} total):`);
      const recentSlow = stats.slowRequests.slice(-5);
      for (const req of recentSlow) {
        console.log(`      ${req.route}: ${req.duration}ms`);
      }
    }

    if (stats.auditEvents.length > 0) {
      console.log(`\\n   📝 Audit Events (${stats.auditEvents.length} total)`);
    }

    if (stats.securityEvents.length > 0) {
      console.log(`\\n   🔒 Security Events (${stats.securityEvents.length} total):`);
      for (const event of stats.securityEvents.slice(-5)) {
        console.log(`      ${event.event}`);
      }
    }
  }

  console.log('\\n' + '='.repeat(60));
  console.log('Analysis complete!\\n');
}

main().catch(console.error);

