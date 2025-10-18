# Testing Guide for Nexus Codex Document Library

This guide provides comprehensive testing strategies for the Nexus Codex document library microservices.

## Table of Contents

1. [Quick Start Testing](#quick-start-testing)
2. [Manual API Testing](#manual-api-testing)
3. [Automated Testing](#automated-testing)
4. [WebSocket Testing](#websocket-testing)
5. [Performance Testing](#performance-testing)
6. [Test Data Setup](#test-data-setup)

---

## Quick Start Testing

### Prerequisites

```bash
# Install dependencies for all services
cd services/doc-api && npm install && cd ../..
cd services/doc-processor && npm install && cd ../..
cd services/doc-websocket && npm install && cd ../..

# Start all services with Docker Compose
docker compose up -d
```

### Quick Smoke Test

Run the automated smoke test script:

```bash
chmod +x test-stack.sh
./test-stack.sh
```

This will verify:
- ✓ All services are running
- ✓ Health endpoints responding
- ✓ Database connectivity
- ✓ ElasticSearch cluster health
- ✓ MinIO storage health
- ✓ Redis connectivity

---

## Manual API Testing

### 1. Document Management

#### Create a Document

```bash
# Create test PDF file (or use an existing PDF)
echo "Test PDF content" > test.pdf

# Upload document
curl -X POST http://localhost:3000/api/documents \
  -F "file=@test.pdf" \
  -F "title=Test Rulebook" \
  -F "description=Test document for Nexus Codex" \
  -F "type=rulebook" \
  -F "campaigns=test-campaign" \
  -F "tags=test,rules,5e"
```

**Expected Response:**
```json
{
  "id": "uuid-here",
  "title": "Test Rulebook",
  "type": "rulebook",
  "format": "pdf",
  "status": "uploaded",
  "uploadedAt": "2025-10-18T...",
  ...
}
```

#### List Documents

```bash
# Get all documents
curl http://localhost:3000/api/documents

# Filter by type
curl http://localhost:3000/api/documents?type=rulebook

# Filter by campaign
curl http://localhost:3000/api/documents?campaign=test-campaign

# Search documents
curl http://localhost:3000/api/documents?search=rulebook

# Pagination
curl http://localhost:3000/api/documents?limit=10&offset=0
```

#### Get Document Details

```bash
# Replace {id} with actual document ID
curl http://localhost:3000/api/documents/{id}
```

#### Update Document

```bash
curl -X PUT http://localhost:3000/api/documents/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "description": "Updated description",
    "tags": ["updated", "test"]
  }'
```

#### Download Document

```bash
# Get pre-signed URL
curl http://localhost:3000/api/documents/{id}/download

# Download using pre-signed URL
curl -o downloaded.pdf "{presigned-url}"
```

#### Delete Document

```bash
curl -X DELETE http://localhost:3000/api/documents/{id}
```

### 2. Document Processing

#### Check Processing Status

```bash
curl http://localhost:3000/api/processing/{id}/status
```

**Expected Response:**
```json
{
  "documentId": "uuid",
  "ocrStatus": "completed",
  "pageCount": 10,
  "hasStructuredData": true,
  "structuredDataCount": {
    "spells": 5,
    "monsters": 3,
    "items": 2
  }
}
```

#### Reprocess Document

```bash
curl -X POST http://localhost:3000/api/processing/{id}/reprocess
```

### 3. Search Functionality

#### Full-Text Search

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "fireball spell",
    "filters": {
      "type": "rulebook",
      "campaigns": ["test-campaign"]
    },
    "limit": 10
  }'
```

#### Quick Search (Structured Data)

```bash
# Search all types
curl "http://localhost:3000/api/search/quick?term=fireball"

# Search specific type
curl "http://localhost:3000/api/search/quick?term=goblin&type=monster"

# Filter by campaign
curl "http://localhost:3000/api/search/quick?term=sword&type=item&campaign=my-campaign"

# Limit results
curl "http://localhost:3000/api/search/quick?term=spell&limit=5"
```

### 4. Structured Data

#### List Structured Data

```bash
# Get all structured data
curl http://localhost:3000/api/structured-data

# Filter by type
curl http://localhost:3000/api/structured-data?type=spell

# Filter by name
curl http://localhost:3000/api/structured-data?name=fireball

# Search in content
curl http://localhost:3000/api/structured-data?search=evocation

# Get for specific document
curl http://localhost:3000/api/documents/{id}/structured-data
```

#### Get Specific Entry

```bash
curl http://localhost:3000/api/structured-data/{id}
```

**Expected Response:**
```json
{
  "id": "uuid",
  "documentId": "doc-uuid",
  "type": "spell",
  "name": "Fireball",
  "data": {
    "name": "Fireball",
    "level": "3rd-level",
    "school": "evocation",
    "castingTime": "1 action",
    "range": "150 feet",
    ...
  },
  "document": {
    "id": "doc-uuid",
    "title": "Player's Handbook",
    "type": "rulebook"
  }
}
```

### 5. References

#### Create Reference

```bash
curl -X POST http://localhost:3000/api/references \
  -H "Content-Type: application/json" \
  -d '{
    "sourceDocId": "source-uuid",
    "targetDocId": "target-uuid",
    "sourcePageNumber": 42,
    "targetPageNumber": 15,
    "refType": "rule_clarification",
    "note": "See page 15 for detailed explanation"
  }'
```

#### Get Document References

```bash
# Get all references for a document
curl http://localhost:3000/api/documents/{id}/references

# Get only outgoing references
curl http://localhost:3000/api/documents/{id}/references?direction=outgoing

# Get only incoming references
curl http://localhost:3000/api/documents/{id}/references?direction=incoming

# Filter by type
curl http://localhost:3000/api/documents/{id}/references?type=rule_clarification
```

### 6. Annotations

#### Create Annotation

```bash
curl -X POST http://localhost:3000/api/documents/{id}/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "pageNumber": 5,
    "position": {
      "x": 100,
      "y": 200,
      "width": 150,
      "height": 50
    },
    "type": "highlight",
    "content": "Important rule!",
    "color": "#FFFF00",
    "isShared": true,
    "campaignId": "my-campaign"
  }'
```

#### Get Annotations

```bash
# Get all annotations for a document
curl http://localhost:3000/api/documents/{id}/annotations

# Filter by user
curl http://localhost:3000/api/documents/{id}/annotations?userId=user-123

# Filter by page
curl http://localhost:3000/api/documents/{id}/annotations?pageNumber=5

# Filter by campaign
curl http://localhost:3000/api/documents/{id}/annotations?campaignId=my-campaign

# Get shared only
curl http://localhost:3000/api/documents/{id}/annotations?isShared=true
```

#### Update Annotation

```bash
curl -X PUT http://localhost:3000/api/annotations/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Updated annotation text",
    "color": "#00FF00"
  }'
```

#### Delete Annotation

```bash
curl -X DELETE http://localhost:3000/api/annotations/{id}
```

---

## Automated Testing

### Running Unit Tests

```bash
# Test doc-processor services
cd services/doc-processor
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- extraction.service.test.ts
```

```bash
# Test doc-api routes
cd services/doc-api
npm test

# Run with coverage
npm test -- --coverage
```

### Running Integration Tests

```bash
# Start test database first
docker compose -f docker-compose.test.yml up -d

# Run integration tests
cd services/doc-api
npm run test:integration

# Clean up
docker compose -f docker-compose.test.yml down -v
```

### Test Commands Summary

Add these to your `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testMatch='**/*.integration.test.ts'"
  }
}
```

---

## WebSocket Testing

### Using wscat

Install wscat globally:

```bash
npm install -g wscat
```

#### Connect and Test Session

```bash
# Connect to WebSocket server
wscat -c ws://localhost:3002/ws

# After connection, create/join session
> {"type": "doc:session:join", "payload": {"documentId": "your-doc-id", "userId": "test-user", "username": "Test User"}}

# Server should respond with:
< {"type": "session:joined", "payload": {...}}

# Test heartbeat
> {"type": "heartbeat"}

# Server should respond with:
< {"type": "pong"}
```

#### Test Cursor Updates

```bash
# Send cursor position
> {"type": "doc:cursor:move", "payload": {"x": 100, "y": 200, "pageNumber": 1}}

# Other users in the session will receive:
< {"type": "cursor:moved", "payload": {"userId": "test-user", "x": 100, "y": 200, "pageNumber": 1}}
```

#### Test Annotations

```bash
# Create annotation via WebSocket
> {"type": "doc:annotation:create", "payload": {"documentId": "doc-id", "userId": "test-user", "pageNumber": 1, "position": {"x": 100, "y": 200}, "type": "highlight", "content": "Test annotation", "color": "#FFFF00"}}

# All users in session receive:
< {"type": "annotation:created", "payload": {...}}
```

### Using JavaScript Client

Create a test file `test-websocket.js`:

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3002/ws');

ws.on('open', () => {
  console.log('Connected to WebSocket server');

  // Join session
  ws.send(JSON.stringify({
    type: 'doc:session:join',
    payload: {
      documentId: 'test-doc-id',
      userId: 'test-user',
      username: 'Test User'
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message.type);
  console.log('Payload:', JSON.stringify(message.payload, null, 2));
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from WebSocket server');
});

// Keep alive with heartbeat
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'heartbeat' }));
  }
}, 30000);
```

Run with:
```bash
node test-websocket.js
```

---

## Performance Testing

### Load Testing with Apache Bench

```bash
# Test document listing endpoint
ab -n 1000 -c 10 http://localhost:3000/api/documents

# Test search endpoint
ab -n 500 -c 5 -p search.json -T application/json http://localhost:3000/api/search
```

Create `search.json`:
```json
{
  "query": "test",
  "limit": 10
}
```

### Load Testing with k6

Install k6: https://k6.io/docs/getting-started/installation/

Create `load-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10, // 10 virtual users
  duration: '30s',
};

export default function () {
  // Test document listing
  const listRes = http.get('http://localhost:3000/api/documents');
  check(listRes, { 'list status 200': (r) => r.status === 200 });

  // Test search
  const searchRes = http.post(
    'http://localhost:3000/api/search',
    JSON.stringify({ query: 'test', limit: 10 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(searchRes, { 'search status 200': (r) => r.status === 200 });

  sleep(1);
}
```

Run with:
```bash
k6 run load-test.js
```

---

## Test Data Setup

### Create Sample Documents

```bash
# Create script to upload test documents
cat > upload-test-docs.sh << 'EOF'
#!/bin/bash

# Upload rulebook
curl -X POST http://localhost:3000/api/documents \
  -F "file=@test-data/players-handbook.pdf" \
  -F "title=Player's Handbook" \
  -F "description=Core rulebook for D&D 5e" \
  -F "type=rulebook" \
  -F "campaigns=test-campaign" \
  -F "tags=5e,core,rules"

# Upload adventure
curl -X POST http://localhost:3000/api/documents \
  -F "file=@test-data/adventure.pdf" \
  -F "title=Lost Mine of Phandelver" \
  -F "description=Starter adventure" \
  -F "type=adventure" \
  -F "campaigns=test-campaign" \
  -F "tags=5e,adventure,level1-5"

# Upload character sheet
curl -X POST http://localhost:3000/api/documents \
  -F "file=@test-data/character.pdf" \
  -F "title=Character Sheet - Gandalf" \
  -F "description=Wizard character" \
  -F "type=character_sheet" \
  -F "campaigns=test-campaign" \
  -F "tags=wizard,level5"
EOF

chmod +x upload-test-docs.sh
./upload-test-docs.sh
```

### Create Sample Markdown Documents

```bash
# Create test markdown file
cat > test-data/campaign-notes.md << 'EOF'
# Campaign Notes

## Session 1: The Beginning

The party met in a tavern in Neverwinter...

### NPCs Met
- Sildar Hallwinter
- Gundren Rockseeker

## Important Locations

### Phandalin
A small frontier town...
EOF

# Upload markdown document
curl -X POST http://localhost:3000/api/documents \
  -F "file=@test-data/campaign-notes.md" \
  -F "title=Campaign Notes" \
  -F "description=Session notes for our campaign" \
  -F "type=notes" \
  -F "campaigns=test-campaign" \
  -F "tags=notes,session,phandelver"
```

---

## Troubleshooting

### Services Not Starting

```bash
# Check Docker logs
docker compose logs doc-api
docker compose logs doc-processor
docker compose logs doc-websocket

# Check database connection
docker compose exec postgres psql -U postgres -d nexus_vtt -c "SELECT 1"

# Check Redis
docker compose exec redis redis-cli ping
```

### Tests Failing

```bash
# Clear test database
docker compose exec postgres psql -U postgres -d nexus_vtt_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Run Prisma migrations
cd services/doc-api
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

### WebSocket Connection Issues

```bash
# Check WebSocket server logs
docker compose logs doc-websocket

# Verify Redis is accessible
docker compose exec doc-websocket npm run redis-cli ping

# Check active sessions
docker compose exec redis redis-cli KEYS "session:*"
```

---

## CI/CD Testing

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd services/doc-api && npm ci
          cd ../doc-processor && npm ci
          cd ../doc-websocket && npm ci

      - name: Run tests
        run: |
          cd services/doc-api && npm test
          cd ../doc-processor && npm test
          cd ../doc-websocket && npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379
```

---

## Summary

This testing guide covers:

1. ✅ **Quick smoke tests** - Verify all services are running
2. ✅ **Manual API testing** - Complete curl examples for all endpoints
3. ✅ **Automated unit tests** - Jest tests for services and utilities
4. ✅ **Integration tests** - Full API route testing with Fastify
5. ✅ **WebSocket testing** - Real-time feature verification
6. ✅ **Performance testing** - Load testing with ab and k6
7. ✅ **Test data setup** - Scripts to populate test data
8. ✅ **Troubleshooting** - Common issues and solutions
9. ✅ **CI/CD integration** - GitHub Actions example

For questions or issues, refer to the main README.md or check the logs with `docker compose logs -f`.
