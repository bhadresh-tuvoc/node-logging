#!/bin/bash

# Start Prometheus and Grafana
# Run this after setup-monitoring.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONITORING_DIR="$SCRIPT_DIR/../monitoring-local"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if setup was done
if [ ! -f "$MONITORING_DIR/prometheus/prometheus" ]; then
    echo -e "${RED}❌ Prometheus not found. Run setup first:${NC}"
    echo "   ./scripts/setup-monitoring.sh"
    exit 1
fi

# Kill any existing processes
pkill -f "prometheus --config" 2>/dev/null || true
pkill -f "grafana-server" 2>/dev/null || true
sleep 1

cd "$MONITORING_DIR"

echo -e "${GREEN}🚀 Starting Prometheus on port 9090...${NC}"
./prometheus/prometheus \
    --config.file=prometheus/prometheus.yml \
    --storage.tsdb.path=prometheus/data \
    --web.enable-lifecycle \
    > prometheus/prometheus.log 2>&1 &
PROM_PID=$!

sleep 2

echo -e "${GREEN}🚀 Starting Grafana on port 4002...${NC}"
GF_SERVER_HTTP_PORT=4002 \
GF_SECURITY_ADMIN_USER=admin \
GF_SECURITY_ADMIN_PASSWORD=admin123 \
GF_PATHS_PROVISIONING=./grafana/conf/provisioning \
GF_PATHS_DATA=./grafana/data \
./grafana/bin/grafana-server \
    --homepath=./grafana \
    > grafana/grafana.log 2>&1 &
GRAFANA_PID=$!

sleep 3

# Check if services are running
echo ""
if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Prometheus running:${NC} http://localhost:9090"
else
    echo -e "${RED}❌ Prometheus failed to start. Check: $MONITORING_DIR/prometheus/prometheus.log${NC}"
fi

if curl -s http://localhost:4002/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Grafana running:${NC} http://localhost:4002 (admin/admin123)"
else
    echo -e "${RED}❌ Grafana failed to start. Check: $MONITORING_DIR/grafana/grafana.log${NC}"
fi

echo ""
echo -e "${YELLOW}PIDs: Prometheus=$PROM_PID, Grafana=$GRAFANA_PID${NC}"
echo -e "${YELLOW}Logs: $MONITORING_DIR/prometheus/prometheus.log${NC}"
echo -e "${YELLOW}      $MONITORING_DIR/grafana/grafana.log${NC}"
echo ""
echo -e "${GREEN}To stop:${NC} ./scripts/stop-monitoring.sh"

