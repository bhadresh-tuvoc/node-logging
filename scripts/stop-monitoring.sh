#!/bin/bash

# Stop Prometheus and Grafana

GREEN='\033[0;32m'
NC='\033[0m'

echo "Stopping Prometheus..."
pkill -f "prometheus --config" 2>/dev/null || true

echo "Stopping Grafana..."
pkill -f "grafana-server" 2>/dev/null || true

sleep 1
echo -e "${GREEN}✅ Monitoring services stopped${NC}"

