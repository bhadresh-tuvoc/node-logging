# Production-Level Node.js Express Application

A comprehensive, production-ready Node.js Express application featuring enterprise-grade logging, monitoring, observability, and debugging capabilities.

## 🚀 Features

### Core Features
- **RESTful User CRUD API** - Complete user management with validation
- **Production-grade Logging** - Winston with multiple transports and log rotation
- **Prometheus Metrics** - Full observability with custom metrics
- **Request Tracing** - Distributed tracing with correlation IDs
- **Health Checks** - Kubernetes-compatible liveness/readiness probes
- **Graceful Shutdown** - Proper connection draining and cleanup
- **Cluster Mode** - Multi-core utilization with zero-downtime restarts
- **Security** - Helmet, CORS, rate limiting, input sanitization

### Debug Scenarios
Built-in endpoints to simulate real-world production issues:
- Memory leaks
- CPU-intensive operations
- Slow endpoints
- Various error types
- Cascade failures
- High concurrency

## 📦 Installation

```bash
# Clone or navigate to the project
cd node-logging

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Start development server
npm run dev

# Start production server
npm start

# Start cluster mode (multi-core)
npm run start:cluster
```

## 🔧 Configuration

Environment variables (`.env`):

```env
# Application
NODE_ENV=development
PORT=4000
APP_NAME=node-production-app
APP_VERSION=1.0.0

# Logging
LOG_LEVEL=info          # error, warn, info, http, debug, trace
LOG_FORMAT=json         # json or pretty
LOG_DIR=./logs
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d
LOG_COMPRESSION=true

# Monitoring
METRICS_ENABLED=true
METRICS_PREFIX=app_

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Debug Scenarios (development only!)
ENABLE_DEBUG_SCENARIOS=true
```

## 📚 API Endpoints

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users (paginated) |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/users` | Create new user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| GET | `/api/users/stats` | User statistics |
| POST | `/api/users/bulk/status` | Bulk status update |

### Health & Monitoring

| Endpoint | Description |
|----------|-------------|
| `/health` | Basic health check |
| `/health/live` | Kubernetes liveness probe |
| `/health/ready` | Kubernetes readiness probe |
| `/health/detailed` | Detailed system info |
| `/metrics` | Prometheus metrics |

### Debug Scenarios (Development Only)

| Endpoint | Description |
|----------|-------------|
| `POST /debug/memory-leak/start` | Start memory leak simulation |
| `POST /debug/memory-leak/stop` | Stop and cleanup memory leak |
| `GET /debug/memory-leak/status` | Current memory status |
| `POST /debug/cpu-intensive` | CPU-blocking operation |
| `GET /debug/slow-endpoint?delay=5000` | Slow response simulation |
| `POST /debug/error/:type` | Simulate error types |
| `POST /debug/cascade-failure` | Multi-step failure simulation |
| `GET /debug/event-loop-delay` | Measure event loop health |
| `POST /debug/high-concurrency` | High load simulation |
| `GET /debug/gc-stats` | Garbage collection info |
| `POST /debug/logging-stress` | Logging performance test |

## 📊 Logging

### Log Levels
- `error` - Error conditions
- `warn` - Warning conditions
- `info` - Informational messages
- `http` - HTTP request/response logs
- `debug` - Debug information
- `trace` - Detailed trace information

### Log Files
Logs are stored in the `./logs` directory:
- `app-YYYY-MM-DD.log` - All application logs
- `error-YYYY-MM-DD.log` - Error logs only
- `access-YYYY-MM-DD.log` - HTTP access logs

### Log Format (JSON)
```json
{
  "level": "info",
  "message": "Request completed",
  "timestamp": "2024-01-15 10:30:45.123",
  "metadata": {
    "request_id": "uuid",
    "trace_id": "uuid",
    "method": "GET",
    "url": "/api/users",
    "status_code": 200,
    "duration_ms": "45.23"
  },
  "service": "node-production-app",
  "version": "1.0.0",
  "environment": "production",
  "pid": 12345,
  "hostname": "server-1"
}
```

### Analyze Logs
```bash
npm run logs:analyze
```

## 📈 Metrics

Prometheus metrics available at `/metrics`:

### HTTP Metrics
- `app_http_request_duration_seconds` - Request duration histogram
- `app_http_requests_total` - Request counter
- `app_http_active_requests` - Active request gauge
- `app_http_request_size_bytes` - Request size histogram
- `app_http_response_size_bytes` - Response size histogram

### Application Metrics
- `app_errors_total` - Error counter
- `app_user_operations_total` - User operation counter
- `app_db_query_duration_seconds` - Database query duration

### System Metrics
- `app_memory_usage_custom_bytes` - Memory usage
- `app_event_loop_lag_seconds` - Event loop lag
- `app_health_status` - Health status gauge
- `app_uptime_seconds` - Application uptime

### Node.js Default Metrics
- `nodejs_heap_size_*` - Heap memory
- `nodejs_gc_duration_seconds` - GC duration
- `nodejs_eventloop_lag_*` - Event loop metrics
- `process_cpu_*` - CPU usage

## 🔍 Request Tracing

Every request gets:
- `X-Request-ID` - Unique request identifier
- `X-Trace-ID` - Trace ID for distributed tracing
- Correlation through logs via `request_id` and `trace_id`

## 🛡️ Security Features

- **Helmet** - Security headers
- **CORS** - Cross-origin request handling
- **Rate Limiting** - Request throttling
- **Input Sanitization** - Request body sanitization
- **Sensitive Data Redaction** - Auto-redact passwords, tokens in logs

## 🏗️ Architecture

```
src/
├── config/           # Configuration management
│   └── index.js
├── controllers/      # HTTP request handlers
│   └── userController.js
├── middleware/       # Express middleware
│   ├── errorHandler.js
│   ├── requestLogger.js
│   └── security.js
├── models/           # Data models
│   └── User.js
├── routes/           # Route definitions
│   ├── healthRoutes.js
│   └── userRoutes.js
├── scenarios/        # Debug scenarios
│   └── debugScenarios.js
├── services/         # Business logic
│   └── userService.js
├── utils/            # Utilities
│   ├── logger.js
│   ├── metrics.js
│   └── tracing.js
├── app.js            # Express app setup
├── cluster.js        # Cluster mode entry
└── server.js         # Server entry point
```

## 🧪 Testing Debug Scenarios

### 1. Memory Leak Detection
```bash
# Start memory leak
curl -X POST http://localhost:4000/debug/memory-leak/start \
  -H "Content-Type: application/json" \
  -d '{"sizeMB": 10, "intervalMs": 1000}'

# Check status
curl http://localhost:4000/debug/memory-leak/status

# Watch memory grow in metrics
curl http://localhost:4000/metrics | grep memory

# Stop and cleanup
curl -X POST http://localhost:4000/debug/memory-leak/stop
```

### 2. CPU Spike
```bash
curl -X POST http://localhost:4000/debug/cpu-intensive \
  -H "Content-Type: application/json" \
  -d '{"iterations": 10000000}'
```

### 3. Slow Requests
```bash
curl "http://localhost:4000/debug/slow-endpoint?delay=5000"
```

### 4. Error Simulation
```bash
# Database error
curl -X POST http://localhost:4000/debug/error/database

# Validation error
curl -X POST http://localhost:4000/debug/error/validation

# Unhandled error
curl -X POST http://localhost:4000/debug/error/unhandled

# Cascade failure
curl -X POST http://localhost:4000/debug/cascade-failure
```

### 5. High Concurrency
```bash
curl -X POST http://localhost:4000/debug/high-concurrency \
  -H "Content-Type: application/json" \
  -d '{"concurrent": 100, "operationMs": 100}'
```

## 🚀 Production Deployment

### Cluster Mode
```bash
# Uses all CPU cores
npm run start:cluster

# Or specify worker count
CLUSTER_WORKERS=4 npm run start:cluster
```

### Zero-Downtime Restart
```bash
# Send SIGUSR2 to primary process for rolling restart
kill -SIGUSR2 <primary_pid>
```

### Graceful Shutdown
```bash
# Properly drains connections
kill -SIGTERM <pid>
```

### Docker Example
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Enable GC stats
CMD ["node", "--expose-gc", "src/cluster.js"]
```

### Kubernetes Health Probes
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

## 📋 Sample API Usage

### Create User
```bash
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "status": "active"
  }'
```

### List Users
```bash
curl "http://localhost:4000/api/users?page=1&limit=10&status=active"
```

### Get User
```bash
curl http://localhost:4000/api/users/{user-id}
```

### Update User
```bash
curl -X PUT http://localhost:4000/api/users/{user-id} \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "status": "inactive"}'
```

### Delete User
```bash
curl -X DELETE http://localhost:4000/api/users/{user-id}
```

## 📊 Monitoring Setup with Grafana

### Quick Start (Docker Required)

```bash
# Make sure your Node.js app is running on port 4000
npm start

# Start Prometheus & Grafana
docker compose up -d

# Access:
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:4002 (admin/admin123)
```

### What's Included

The monitoring setup includes:
- **Prometheus** - Metrics collection (port 9090)
- **Grafana** - Visualization dashboards (port 4002)
- **Pre-configured Dashboard** - Ready-to-use Node.js monitoring dashboard
- **Alert Rules** - Predefined alerts for common issues

### Grafana Dashboard Features

The pre-configured dashboard shows:

| Panel | Description |
|-------|-------------|
| Heap Usage % | Memory pressure indicator |
| Active Requests | Current concurrent requests |
| Request Rate | Requests per second |
| Error Rate | Errors per second |
| P95 Latency | 95th percentile response time |
| Uptime | Application uptime |
| Request Rate by Status | 2xx, 4xx, 5xx breakdown |
| Response Time Percentiles | P50, P90, P95, P99 |
| Memory Usage | Heap, RSS, External |
| Event Loop Lag | Node.js event loop health |
| CPU Usage | Process CPU utilization |
| Database Query Duration | Query performance |
| User Operations | Business metrics |
| Health Status | Component health |

### Manual Prometheus Setup
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'node-app'
    static_configs:
      - targets: ['localhost:4000']
    metrics_path: '/metrics'
```

### Alert Rules Example
```yaml
groups:
  - name: node-app
    rules:
      - alert: HighErrorRate
        expr: rate(app_errors_total[5m]) > 10
        for: 5m
        labels:
          severity: critical

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(app_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning

      - alert: HighMemoryUsage
        expr: app_memory_usage_custom_bytes{type="heapUsed"} / app_memory_usage_custom_bytes{type="heapTotal"} > 0.9
        for: 5m
        labels:
          severity: warning
```

## 📝 License

MIT

