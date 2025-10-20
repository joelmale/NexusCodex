#!/bin/bash

echo "🚀 Starting Nexus Codex Stack Test..."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Start services
echo -e "${YELLOW}1. Starting Docker Compose...${NC}"
# Use legacy builder to avoid buildx permission issues on macOS
export DOCKER_BUILDKIT=0
docker compose up -d

echo -e "${YELLOW}2. Waiting for services to be healthy (60s)...${NC}"
sleep 60

# Test doc-api
echo -e "${YELLOW}3. Testing doc-api health...${NC}"
if curl -s http://localhost:3000/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ doc-api is healthy${NC}"
else
    echo -e "${RED}✗ doc-api health check failed${NC}"
    exit 1
fi

# Test doc-websocket
echo -e "${YELLOW}4. Testing doc-websocket health...${NC}"
if curl -s http://localhost:3002/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ doc-websocket is healthy${NC}"
else
    echo -e "${RED}✗ doc-websocket health check failed${NC}"
    exit 1
fi

# Test database connection
echo -e "${YELLOW}5. Testing database connection...${NC}"
if curl -s http://localhost:3000/health | grep -q "connected"; then
    echo -e "${GREEN}✓ Database connected${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

# Test ElasticSearch
echo -e "${YELLOW}6. Testing ElasticSearch...${NC}"
if curl -s http://localhost:9200/_cluster/health | grep -q "green\|yellow"; then
    echo -e "${GREEN}✓ ElasticSearch is running${NC}"
else
    echo -e "${RED}✗ ElasticSearch is not responding${NC}"
    exit 1
fi

# Test MinIO
echo -e "${YELLOW}7. Testing MinIO...${NC}"
if curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo -e "${GREEN}✓ MinIO is healthy${NC}"
else
    echo -e "${RED}✗ MinIO health check failed${NC}"
    exit 1
fi

# Test Redis
echo -e "${YELLOW}8. Testing Redis...${NC}"
if docker compose exec -T redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✓ Redis is responding${NC}"
else
    echo -e "${RED}✗ Redis is not responding${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All services are healthy!${NC}"
echo ""
echo "Service URLs:"
echo "  - REST API:    http://localhost:3000"
echo "  - WebSocket:   ws://localhost:3002/ws"
echo "  - MinIO UI:    http://localhost:9001 (admin/password)"
echo "  - ElasticSearch: http://localhost:9200"
echo ""
echo "Run 'docker compose logs -f' to view logs"
echo "Run 'docker compose down' to stop services"
