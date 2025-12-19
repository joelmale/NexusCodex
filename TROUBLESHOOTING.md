# Troubleshooting Guide for NexusCodex

This guide helps you diagnose and fix common issues with document processing and system monitoring.

## Document Processing Issues

### Problem: Documents Stuck in "Processing" Status

**Symptoms:**
- Documents show as "processing" in the admin UI
- Processing queue shows 0 jobs
- Documents never complete processing

**Root Causes:**
1. Processing job was never created when document was uploaded
2. Processing job failed silently
3. Worker not running or crashed

**Diagnosis Steps:**

#### 1. Check Document Status in Database

```bash
docker compose exec postgres psql -U user -d doclib -c \
  "SELECT id, title, \"ocrStatus\", \"pageCount\", \"thumbnailKey\", \"searchIndex\" FROM documents WHERE title LIKE '%YOUR_DOC_NAME%';"
```

**What to look for:**
- `ocrStatus`: Should be 'pending', 'processing', or 'completed'
- `pageCount`: Should be > 0 when processed
- `thumbnailKey`: Should have a value when processed
- `searchIndex`: Should have a value when indexed

If `ocrStatus = 'not_required'` but `pageCount = 0`, the document was never processed.

#### 2. Check Processing Queue Status

```bash
# Check for waiting jobs
docker compose exec redis redis-cli LLEN bull:document-processing:wait

# Check for active jobs
docker compose exec redis redis-cli LLEN bull:document-processing:active

# Check for failed jobs
docker compose exec redis redis-cli LLEN bull:document-processing:failed
```

#### 3. Check Worker Logs

```bash
# Recent logs
docker compose logs --tail=100 doc-processor

# Follow logs in real-time
docker compose logs -f doc-processor

# Search for errors
docker compose logs doc-processor | grep -i error
```

### Solution: Manually Trigger Processing

If documents were uploaded but never processed:

```bash
# Trigger processing for a specific document
curl -X POST http://localhost:3000/api/documents/<DOCUMENT_ID>/process

# Or use the admin endpoint to reprocess
curl -X POST http://localhost:3000/api/admin/documents/<DOCUMENT_ID>/reprocess
```

You can find the document ID from the Documents page in the admin UI or from the database query above.

---

## Common Processing Errors

### Error: "Failed to generate thumbnail: Please provide binary data as `Uint8Array`, rather than `Buffer`"

**Cause:** Node.js 22 compatibility issue with pdfjs-dist requiring Uint8Array instead of Buffer.

**Fix:** Already fixed in `services/doc-processor/src/services/thumbnail.service.ts`. If you see this error:

```bash
# Rebuild doc-processor with no cache
docker compose build --no-cache doc-processor
docker compose up -d doc-processor

# Reprocess the failed documents
curl -X POST http://localhost:3000/api/admin/documents/<DOCUMENT_ID>/reprocess
```

---

### Error: "Do not know how to serialize a BigInt"

**Cause:** Node.js 22 compatibility issue with PostgreSQL returning BigInt values that can't be JSON serialized.

**Fix:** Already fixed in `services/doc-api/src/services/health.service.ts`. Rebuild doc-api:

```bash
docker compose build --no-cache doc-api
docker compose up -d doc-api
```

---

## Monitoring Document Processing

### Check Processing Queue via API

```bash
# Get queue statistics
curl http://localhost:3000/api/admin/queue/stats

# List recent jobs
curl 'http://localhost:3000/api/admin/queue/jobs?limit=20'

# Get logs for a specific job
curl http://localhost:3000/api/admin/queue/jobs/<JOB_ID>/logs
```

### Check Processing Queue via Admin UI

1. Navigate to http://localhost:3001/processing
2. View:
   - Queue stats (waiting, active, completed, failed)
   - Recent jobs with status
   - Job logs for failed jobs

### Monitor Worker Health

```bash
# Check if worker is running
docker compose ps doc-processor

# Check worker logs for activity
docker compose logs --tail=50 doc-processor

# Restart worker if stuck
docker compose restart doc-processor
```

---

## Debugging Workflow

### Full Diagnostic Check

Run this complete check when documents aren't processing:

```bash
#!/bin/bash

echo "=== 1. Check Worker Status ==="
docker compose ps doc-processor

echo -e "\n=== 2. Check Queue Lengths ==="
echo "Waiting: $(docker compose exec redis redis-cli LLEN bull:document-processing:wait)"
echo "Active: $(docker compose exec redis redis-cli LLEN bull:document-processing:active)"
echo "Failed: $(docker compose exec redis redis-cli LLEN bull:document-processing:failed)"

echo -e "\n=== 3. Check Recent Worker Logs ==="
docker compose logs --tail=20 doc-processor

echo -e "\n=== 4. Check Documents Missing Processing ==="
docker compose exec postgres psql -U user -d doclib -c \
  "SELECT id, title, \"ocrStatus\", \"pageCount\" FROM documents WHERE \"pageCount\" = 0 LIMIT 10;"

echo -e "\n=== 5. Check ElasticSearch Health ==="
curl -s http://localhost:9200/_cluster/health | jq

echo -e "\n=== 6. Check MinIO Health ==="
curl -s http://localhost:9000/minio/health/live
```

Save this as `scripts/debug-processing.sh` and run it when investigating issues.

---

## Service Health Checks

### Check All Services

```bash
# Quick health check script
./test-stack.sh

# Or manually check each service
curl http://localhost:3000/health        # doc-api
curl http://localhost:3002/health        # doc-websocket (if implemented)
curl http://localhost:9200/_cluster/health  # elasticsearch
curl http://localhost:9000/minio/health/live # minio
```

### Check Service Logs

```bash
# All services
docker compose logs --tail=50

# Specific service
docker compose logs --tail=100 doc-api
docker compose logs --tail=100 doc-processor
docker compose logs --tail=100 doc-websocket

# Follow logs in real-time
docker compose logs -f
```

---

## Database Queries for Debugging

### Find Documents by Processing Status

```sql
-- Documents never processed
SELECT id, title, "uploadedAt"
FROM documents
WHERE "pageCount" = 0
ORDER BY "uploadedAt" DESC;

-- Documents currently processing
SELECT id, title, "ocrStatus"
FROM documents
WHERE "ocrStatus" IN ('pending', 'processing');

-- Recently completed documents
SELECT id, title, "pageCount", "uploadedAt"
FROM documents
WHERE "ocrStatus" = 'completed'
ORDER BY "uploadedAt" DESC
LIMIT 10;

-- Failed OCR documents
SELECT id, title, "ocrStatus"
FROM documents
WHERE "ocrStatus" = 'failed';
```

Run these queries:

```bash
docker compose exec postgres psql -U user -d doclib -c "YOUR_SQL_QUERY_HERE"
```

---

## Performance Monitoring

### Check System Metrics

The admin UI provides comprehensive monitoring:

1. **Dashboard** (http://localhost:3001) - Overview statistics
2. **Health** (http://localhost:3001/health) - Service health and metrics
3. **Processing** (http://localhost:3001/processing) - Queue statistics and logs

### API Endpoints for Monitoring

```bash
# System health
curl http://localhost:3000/api/admin/health

# Performance metrics
curl http://localhost:3000/api/admin/metrics

# Metrics history
curl 'http://localhost:3000/api/admin/metrics/history?limit=50'

# Metrics summary
curl http://localhost:3000/api/admin/metrics/summary/24h
```

---

## Common Issues and Solutions

### Issue: Worker Not Processing Jobs

**Check:**
1. Is the worker container running? `docker compose ps doc-processor`
2. Are there errors in logs? `docker compose logs doc-processor`
3. Can it connect to Redis? `docker compose logs doc-processor | grep -i redis`
4. Can it connect to S3? `docker compose logs doc-processor | grep -i s3`

**Solution:**
```bash
# Restart worker
docker compose restart doc-processor

# If that doesn't work, rebuild
docker compose up -d --build doc-processor
```

### Issue: ElasticSearch Not Indexing

**Check:**
```bash
# Check ES health
curl http://localhost:9200/_cluster/health

# Check index exists
curl http://localhost:9200/_cat/indices

# Check document count
curl http://localhost:9200/documents/_count
```

**Solution:**
```bash
# Recreate index via admin API
curl -X POST http://localhost:3000/api/admin/elasticsearch/recreate

# Reindex all documents
curl -X POST http://localhost:3000/api/admin/elasticsearch/reindex
```

### Issue: S3 Upload/Download Failures

**Check:**
```bash
# Check MinIO is running
docker compose ps minio

# Check MinIO health
curl http://localhost:9000/minio/health/live

# Check bucket exists
docker compose exec minio mc ls local/documents
```

**Solution:**
```bash
# Restart MinIO
docker compose restart minio

# Reinitialize bucket (via doc-api startup)
docker compose restart doc-api
```

---

## Preventive Maintenance

### Regular Health Checks

Add to your maintenance routine:

```bash
# Weekly: Check for stuck documents
docker compose exec postgres psql -U user -d doclib -c \
  "SELECT count(*) FROM documents WHERE \"pageCount\" = 0 AND \"uploadedAt\" < NOW() - INTERVAL '1 day';"

# Weekly: Clean old failed jobs
curl -X POST http://localhost:3000/api/admin/queue/clean

# Monthly: Check ElasticSearch index health
curl http://localhost:9200/documents/_stats
```

### Automated Monitoring

Consider setting up:
1. **Prometheus + Grafana** for metrics visualization
2. **Sentry** or similar for error tracking
3. **Uptime monitoring** for service availability
4. **Log aggregation** (ELK stack or similar)

---

## Getting Help

If you encounter issues not covered in this guide:

1. **Check logs** for all services
2. **Check GitHub Issues**: https://github.com/your-org/NexusCodex/issues
3. **Review CLAUDE.md** for architecture details
4. **Check recent git commits** for related changes

### Reporting Issues

When reporting issues, include:
- Description of the problem
- Steps to reproduce
- Relevant log output
- Output from `docker compose ps`
- Output from `docker compose logs <service>`
- Database query results showing affected documents
