#!/bin/bash

# Nexus Codex - Test Runner Script
# This script sets up the test environment and runs all tests

set -e  # Exit on error

echo "🧪 Nexus Codex Test Runner"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_MODE=${1:-"unit"}  # unit, integration, or all

# Function to print colored output
print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_step "Checking prerequisites..."

if ! command_exists docker; then
    print_error "Docker is not installed"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    print_error "Docker Compose is not installed"
    exit 1
fi

if ! command_exists node; then
    print_error "Node.js is not installed"
    exit 1
fi

print_success "All prerequisites found"
echo ""

# Start test infrastructure
if [ "$TEST_MODE" = "integration" ] || [ "$TEST_MODE" = "all" ]; then
    print_step "Starting test infrastructure..."
    # Use legacy builder to avoid buildx permission issues on macOS
    export DOCKER_BUILDKIT=0
    docker compose -f docker-compose.test.yml up -d

    print_step "Waiting for services to be ready (30s)..."
    sleep 30

    # Check if services are healthy
    print_step "Checking service health..."

    if docker compose -f docker-compose.test.yml ps | grep -q "unhealthy"; then
        print_error "Some services are unhealthy"
        docker compose -f docker-compose.test.yml ps
        exit 1
    fi

    print_success "Test infrastructure is ready"
    echo ""
fi

# Install dependencies if needed
print_step "Checking dependencies..."

for service in doc-api doc-processor doc-websocket; do
    if [ ! -d "services/$service/node_modules" ]; then
        print_warning "Installing dependencies for $service..."
        cd "services/$service"
        npm install
        cd ../..
        print_success "Dependencies installed for $service"
    fi
done

echo ""

# Run database migrations for integration tests
if [ "$TEST_MODE" = "integration" ] || [ "$TEST_MODE" = "all" ]; then
    print_step "Running database migrations..."
    cd services/doc-api
    export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_vtt_test
    npx prisma migrate deploy || print_warning "Migrations may have already been applied"
    npx prisma generate
    cd ../..
    print_success "Database ready"
    echo ""
fi

# Run tests
FAILED=0

run_service_tests() {
    local service=$1
    local test_type=$2

    print_step "Running $test_type tests for $service..."

    cd "services/$service"

    if [ "$test_type" = "unit" ]; then
        if npm test -- --testPathIgnorePatterns=integration 2>&1 | tee test-output.log; then
            print_success "$service $test_type tests passed"
        else
            print_error "$service $test_type tests failed"
            FAILED=1
        fi
    elif [ "$test_type" = "integration" ]; then
        if [ -f ".env.test" ]; then
            export $(cat .env.test | grep -v '^#' | xargs)
        fi

        if npm run test:integration 2>&1 | tee test-output.log; then
            print_success "$service $test_type tests passed"
        else
            print_error "$service $test_type tests failed"
            FAILED=1
        fi
    fi

    cd ../..
    echo ""
}

# Run tests based on mode
if [ "$TEST_MODE" = "unit" ] || [ "$TEST_MODE" = "all" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Running Unit Tests"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    run_service_tests "doc-processor" "unit"
    run_service_tests "doc-api" "unit"
    run_service_tests "doc-websocket" "unit"
fi

if [ "$TEST_MODE" = "integration" ] || [ "$TEST_MODE" = "all" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Running Integration Tests"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    run_service_tests "doc-api" "integration"
fi

# Cleanup
if [ "$TEST_MODE" = "integration" ] || [ "$TEST_MODE" = "all" ]; then
    echo ""
    print_step "Cleaning up test infrastructure..."
    docker compose -f docker-compose.test.yml down -v
    print_success "Cleanup complete"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAILED -eq 0 ]; then
    print_success "All tests passed!"
    echo ""
    echo "Next steps:"
    echo "  - Run smoke tests: ./test-stack.sh"
    echo "  - Review coverage reports in services/*/coverage/"
    echo "  - Check test logs: services/*/test-output.log"
    exit 0
else
    print_error "Some tests failed"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check test logs: services/*/test-output.log"
    echo "  - Review service logs: docker compose -f docker-compose.test.yml logs"
    echo "  - Ensure test database is clean: docker compose -f docker-compose.test.yml down -v"
    exit 1
fi
