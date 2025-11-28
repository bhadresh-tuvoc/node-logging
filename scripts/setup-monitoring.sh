#!/bin/bash

# Setup Prometheus and Grafana without Docker
# This script downloads and runs them as standalone binaries

set -e

MONITORING_DIR="$(dirname "$0")/../monitoring-local"
PROMETHEUS_VERSION="2.48.0"
GRAFANA_VERSION="10.2.3"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Setting up Prometheus and Grafana (no Docker required)${NC}"

# Create directories
mkdir -p "$MONITORING_DIR"/{prometheus,grafana}
cd "$MONITORING_DIR"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    armv7l) ARCH="armv7" ;;
esac

echo -e "${YELLOW}Detected: $OS-$ARCH${NC}"

# Download Prometheus if not exists
if [ ! -f "prometheus/prometheus" ]; then
    echo -e "${GREEN}📥 Downloading Prometheus v${PROMETHEUS_VERSION}...${NC}"
    PROM_URL="https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.${OS}-${ARCH}.tar.gz"
    curl -sL "$PROM_URL" | tar xz -C prometheus --strip-components=1
    echo -e "${GREEN}✅ Prometheus downloaded${NC}"
else
    echo -e "${YELLOW}Prometheus already exists${NC}"
fi

# Download Grafana if not exists
if [ ! -f "grafana/bin/grafana-server" ] && [ ! -f "grafana/bin/grafana" ]; then
    echo -e "${GREEN}📥 Downloading Grafana v${GRAFANA_VERSION}...${NC}"
    GRAFANA_URL="https://dl.grafana.com/oss/release/grafana-${GRAFANA_VERSION}.${OS}-${ARCH}.tar.gz"
    curl -sL "$GRAFANA_URL" | tar xz -C grafana --strip-components=1
    echo -e "${GREEN}✅ Grafana downloaded${NC}"
else
    echo -e "${YELLOW}Grafana already exists${NC}"
fi

# Create Prometheus config
cat > prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-app'
    static_configs:
      - targets: ['localhost:4000']
    metrics_path: '/metrics'
    scrape_interval: 5s
EOF

# Create Grafana datasource provisioning
mkdir -p grafana/conf/provisioning/datasources
cat > grafana/conf/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
EOF

# Create Grafana dashboard provisioning
mkdir -p grafana/conf/provisioning/dashboards
cat > grafana/conf/provisioning/dashboards/default.yml << 'EOF'
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    options:
      path: /var/lib/grafana/dashboards
EOF

# Copy dashboard
mkdir -p grafana/data/dashboards
cp "$(dirname "$0")/../monitoring/grafana/dashboards/nodejs-overview.json" grafana/data/dashboards/ 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${YELLOW}To start monitoring, run:${NC}"
echo ""
echo "  cd $MONITORING_DIR"
echo ""
echo "  # Terminal 1 - Start Prometheus (port 9090)"
echo "  ./prometheus/prometheus --config.file=prometheus/prometheus.yml"
echo ""
echo "  # Terminal 2 - Start Grafana (port 4002)"
echo "  GF_SERVER_HTTP_PORT=4002 ./grafana/bin/grafana-server --homepath=./grafana"
echo ""
echo -e "${GREEN}Or use the start script:${NC}"
echo "  ./scripts/start-monitoring.sh"

