# Docker Troubleshooting Guide

## Common Issues and Solutions

### Issue: "permission denied" error with buildx on macOS

**Error Message:**
```
open /Users/USERNAME/.docker/buildx/activity/desktop-linux: permission denied
```

**Cause:** Docker Desktop on macOS sometimes has permission issues with the buildx builder directory.

**Solutions:**

#### Solution 1: Fix Permissions (Recommended)
Run the provided fix script:
```bash
./fix-docker-permissions.sh
```

Or manually fix permissions:
```bash
sudo chown -R $(whoami) ~/.docker
```

#### Solution 2: Restart Docker Desktop
1. Open Docker Desktop
2. Click the troubleshoot icon (bug/gear)
3. Click "Restart"
4. Wait for Docker to fully restart
5. Try again

#### Solution 3: Use Legacy Builder (Automatic)
The scripts (`test-stack.sh` and `run-tests.sh`) now automatically use the legacy builder to avoid this issue:
```bash
export DOCKER_BUILDKIT=0
docker compose up -d
```

This is already built into the test scripts, so you don't need to do anything!

---

## Package Lock Files

**Issue:** Docker build fails with "package-lock.json not found"

**Solution:** Generate lock files first:
```bash
cd services/doc-api && npm install --package-lock-only
cd ../doc-processor && npm install --package-lock-only
cd ../doc-websocket && npm install --package-lock-only
```

These files have already been generated for you.

---

## Port Conflicts

**Issue:** Port already in use

**Solution:** Check what's using the port:
```bash
# Check specific port
lsof -i :3000
lsof -i :5432

# Stop conflicting services
docker compose down
```

**Ports used by this project:**
- 3000 - doc-api
- 3002 - doc-websocket
- 5432 - PostgreSQL
- 6379 - Redis
- 9000 - MinIO API
- 9001 - MinIO Console
- 9200 - ElasticSearch

---

## Services Not Starting

**Issue:** Services fail to start or become unhealthy

**Check logs:**
```bash
# All services
docker compose logs

# Specific service
docker compose logs doc-api
docker compose logs postgres

# Follow logs in real-time
docker compose logs -f
```

**Common causes:**
1. Missing dependencies - Run `npm install` in each service directory
2. Database not ready - Wait longer for health checks
3. Environment variables - Check `.env` files
4. Port conflicts - See "Port Conflicts" above

---

## Clean Start

**Issue:** Services are in a bad state

**Solution:** Complete reset:
```bash
# Stop everything and remove volumes
docker compose down -v

# Remove images (forces rebuild)
docker compose down --rmi all -v

# Start fresh
./test-stack.sh
```

---

## Build Performance

**Issue:** Docker builds are slow

**Solutions:**

1. **Use BuildKit (if permissions work):**
   ```bash
   export DOCKER_BUILDKIT=1
   docker compose up -d --build
   ```

2. **Clean up Docker:**
   ```bash
   # Remove unused images
   docker image prune -a

   # Remove build cache
   docker builder prune
   ```

3. **Use layer caching:**
   The Dockerfiles are already optimized with multi-stage builds for better caching.

---

## macOS Specific Issues

### File Permissions in Containers

If you see permission errors inside containers:
```bash
# Fix ownership of files
sudo chown -R $(whoami) services/
```

### Docker Desktop Resource Limits

If builds are failing or services are crashing:

1. Open Docker Desktop
2. Go to Settings → Resources
3. Increase:
   - **CPUs**: 4+ recommended
   - **Memory**: 8GB+ recommended
   - **Swap**: 2GB+
   - **Disk**: 60GB+

---

## Quick Diagnostics

Run this command to check system status:

```bash
# Check Docker version
docker --version
docker compose version

# Check running containers
docker compose ps

# Check container health
docker compose ps --format json | jq '.[].Health'

# Check logs for errors
docker compose logs --tail=50 | grep -i error

# Check resource usage
docker stats --no-stream
```

---

## Getting Help

If you're still experiencing issues:

1. **Check the logs:** `docker compose logs -f`
2. **Check container status:** `docker compose ps`
3. **Verify prerequisites:**
   - Docker Desktop 4.0+ installed
   - Node.js 20+ installed
   - At least 8GB RAM available
   - At least 20GB disk space available

4. **Try a clean start:**
   ```bash
   docker compose down -v
   rm -rf services/*/node_modules
   ./test-stack.sh
   ```

5. **Check the main documentation:**
   - README.md - Overview and architecture
   - TESTING.md - Testing guide
   - .docker-compose-migration.md - Docker Compose V2 migration

---

## Environment Variables

If services can't connect to dependencies, verify environment variables:

**doc-api:**
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `ELASTICSEARCH_URL` - ElasticSearch connection
- `S3_ENDPOINT` - MinIO endpoint

**doc-processor:**
- Same as doc-api

**doc-websocket:**
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `PORT` - WebSocket server port

All values are pre-configured in `docker-compose.yml`.

---

## Summary

Most issues can be resolved by:

1. **Fixing Docker permissions:** `./fix-docker-permissions.sh`
2. **Using legacy builder:** Already enabled in scripts
3. **Clean restart:** `docker compose down -v && ./test-stack.sh`
4. **Checking logs:** `docker compose logs -f`

The test scripts now automatically handle common macOS issues, so just run `./test-stack.sh` to get started!
