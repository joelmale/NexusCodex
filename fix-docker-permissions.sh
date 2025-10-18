#!/bin/bash

# Fix Docker Buildx Permissions on macOS
# This script fixes the common "permission denied" error with Docker Desktop

echo "🔧 Fixing Docker BuildX Permissions..."
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "Current user: $(whoami)"
echo "Docker directory: $HOME/.docker"
echo ""

# Option 1: Fix permissions
echo "Option 1: Fix permissions on ~/.docker"
echo "Running: sudo chown -R $(whoami) ~/.docker"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo chown -R $(whoami) ~/.docker
    echo "✅ Permissions fixed!"
    echo ""
    echo "Now try running: ./test-stack.sh"
else
    echo ""
    echo "Alternative: Restart Docker Desktop"
    echo "  1. Open Docker Desktop"
    echo "  2. Click the troubleshoot icon (bug)"
    echo "  3. Click 'Restart'"
    echo "  4. Wait for Docker to fully restart"
    echo "  5. Try running ./test-stack.sh again"
fi

echo ""
echo "If problems persist, you can use the legacy builder:"
echo "  export DOCKER_BUILDKIT=0"
echo "  docker compose up -d --build"
