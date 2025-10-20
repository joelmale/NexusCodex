# NexusCodex - Document Library for Virtual Tabletops

A production-ready microservices platform for managing, processing, and collaborating on TTRPG documents. Built for the Nexus Virtual Tabletop, NexusCodex provides intelligent document management with real-time collaboration, full-text search, OCR, and automated extraction of game content.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [WebSocket Events](#websocket-events)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 📚 Document Management
- **Multi-format Support**: PDF and Markdown documents
- **S3-Compatible Storage**: MinIO for development, AWS S3/Cloudflare R2 for production
- **Smart Upload**: Client-side uploads via pre-signed URLs (no server bottleneck)
- **HTTP Range Support**: Efficient PDF streaming for browser-based viewers (PDF.js)
- **Automatic Thumbnails**: First-page previews generated on upload
- **Organizational Tools**: Tags, collections, and campaign-specific grouping

### 🔍 Intelligent Search
- **Full-Text Search**: ElasticSearch-powered search across all document content
- **Quick Lookup**: Fast access to spells, monsters, items, and feats
- **Structured Data**: Automatically extracted D&D 5e content with searchable fields
- **Smart Filtering**: Filter by document type, campaign, tags, or content type

### 🎮 Real-Time Collaboration
- **Synchronized Viewing**: DMs and players view documents together in real-time
- **Page Navigation Sync**: Optional synchronized page changes and scrolling
- **DM Push Controls**: Force page navigation or push bookmarks to players
- **Session Management**: Room-based sessions with configurable sync settings
- **Live Annotations**: Real-time highlights, notes, and drawings shared across participants

### 🤖 Automated Processing
- **Text Extraction**: Automatic OCR for image-based PDFs using Tesseract.js
- **Structured Parsing**: Extract spells, monsters, items, and feats from rulebooks
- **Background Workers**: Non-blocking job queue (BullMQ) for heavy processing
- **Smart Detection**: Automatically detects image-based vs. text-based PDFs
- **Markdown Support**: Process and index Markdown campaign notes

### 📍 Bookmarks & Annotations
- **Document References**: Save page numbers, sections, and text selections
- **Persistent Annotations**: Highlights, text notes, and drawings
- **Shared Content**: Mark bookmarks and annotations as visible to campaign members
- **Color Coding**: Organize with customizable colors
- **Linked References**: Connect annotations to bookmarks for context

---

## Architecture

NexusCodex is built as a distributed microservices architecture with three core services:

```
┌─────────────┐
│   Client    │
│  (VTT UI)   │
└──────┬──────┘
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌──────────────┐
│  doc-api    │  │doc-websocket │
│   :3000     │  │    :3002     │
│  (Fastify)  │  │  (Express)   │
└──────┬──────┘  └──────┬───────┘
       │                │
       │         ┌──────┴────────┐
       │         │               │
       ▼         ▼               ▼
┌─────────────┐ ┌─────┐   ┌──────────┐
│doc-processor│ │Redis│   │PostgreSQL│
│ (BullMQ)    │ └─────┘   └──────────┘
└──────┬──────┘
       │
       ├──────────┬──────────┐
       ▼          ▼          ▼
  ┌───────┐ ┌─────────┐ ┌────────────┐
  │ MinIO │ │  Elastic│ │ PostgreSQL │
  │  (S3) │ │ Search  │ │            │
  └───────┘ └─────────┘ └────────────┘
```

### Services

**doc-api** (REST API)
- Document CRUD operations
- Search endpoints (full-text and quick search)
- Reference/bookmark management
- Annotation management
- Structured data queries
- Job queue producer (BullMQ)

**doc-processor** (Background Worker)
- PDF/Markdown text extraction
- Thumbnail generation
- OCR for image-based documents
- D&D content extraction (spells, monsters, items)
- ElasticSearch indexing
- Job queue consumer (BullMQ)

**doc-websocket** (Real-time Service)
- WebSocket server for live collaboration
- Session management (Redis-backed)
- Event broadcasting (page sync, annotations)
- Heartbeat monitoring
- DM control features

### Data Stores

- **PostgreSQL**: Document metadata, references, annotations, structured data
- **ElasticSearch**: Full-text search index (document content NOT in Postgres)
- **Redis**: Job queue + WebSocket session storage
- **MinIO/S3**: Document file storage

---

## Quick Start

### Prerequisites

- [Docker](https://www.docker.com/get-started) 20.10+
- [Docker Compose](https://docs.docker.com/compose/) 2.0+
- [Node.js](https://nodejs.org/) 20+ (for local development)

### Start the Stack

```bash
# Clone the repository
git clone https://github.com/your-org/NexusCodex.git
cd NexusCodex

# Start all services
docker compose up -d

# Wait ~60 seconds for all services to be healthy
# Then verify the stack
./test-stack.sh
```

**Service URLs:**
- REST API: http://localhost:3000
- WebSocket: ws://localhost:3002/ws
- MinIO Console: http://localhost:9001 (login: admin/password)
- ElasticSearch: http://localhost:9200

### Upload Your First Document

```bash
# Create a document record and get upload URL
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Players Handbook",
    "description": "D&D 5E Core Rulebook",
    "type": "rulebook",
    "format": "pdf",
    "uploadedBy": "user-123",
    "fileSize": 15728640,
    "fileName": "phb.pdf",
    "tags": ["dnd5e", "core-rules"],
    "campaigns": ["my-campaign"]
  }' | jq .

# Upload the PDF to the returned uploadUrl
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/pdf" \
  --data-binary "@your-document.pdf"

# Trigger processing (text extraction, OCR, thumbnails)
curl -X POST http://localhost:3000/api/documents/<document-id>/process
```

### Search for Content

```bash
# Full-text search
curl "http://localhost:3000/api/search?query=fireball"

# Quick lookup for spells
curl "http://localhost:3000/api/search/quick?term=fireball&type=spell"

# Search with filters
curl "http://localhost:3000/api/search?query=combat&type=rulebook&campaigns=my-campaign"
```

---

## API Documentation

### Document Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents` | Create document record and get S3 upload URL |
| `GET` | `/api/documents` | List documents with filtering (type, campaign, tags, search) |
| `GET` | `/api/documents/:id` | Get document metadata |
| `GET` | `/api/documents/:id/content` | Stream document file (supports Range headers) |
| `PUT` | `/api/documents/:id` | Update document metadata |
| `DELETE` | `/api/documents/:id` | Delete document and all associated data |

### Search Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search` | Full-text search with filters (query, type, campaigns, tags) |
| `GET` | `/api/search/quick` | Quick search with structured results and snippets |

### Reference/Bookmark Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/references` | Create a bookmark/reference |
| `GET` | `/api/references` | List references (filter by documentId, userId, campaignId) |
| `GET` | `/api/references/:id` | Get specific reference |
| `PUT` | `/api/references/:id` | Update reference (title, notes, tags) |
| `DELETE` | `/api/references/:id` | Delete reference |

### Annotation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/:id/annotations` | Create annotation (highlight, note, drawing) |
| `GET` | `/api/documents/:id/annotations` | Get annotations (filter by pageNumber, type, isShared) |
| `GET` | `/api/annotations/:id` | Get specific annotation |
| `PUT` | `/api/annotations/:id` | Update annotation (content, color, position) |
| `DELETE` | `/api/annotations/:id` | Delete annotation |

### Structured Data Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents/:id/structured-data` | Get extracted game content (filter by type, name) |
| `GET` | `/api/structured-data` | List all structured data with filtering |
| `GET` | `/api/structured-data/:id` | Get specific structured data entry |
| `DELETE` | `/api/structured-data/:id` | Delete structured data entry |

### Processing Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/:id/process` | Trigger document processing (extraction, OCR, indexing) |
| `GET` | `/api/documents/:id/processing-status` | Get processing status and results |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health (doc-api and doc-websocket) |

### Example Request/Response

**Create Document:**
```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Monster Manual",
    "description": "D&D 5E Creature Reference",
    "type": "rulebook",
    "format": "pdf",
    "uploadedBy": "dm-456",
    "fileSize": 52428800,
    "fileName": "mm.pdf",
    "tags": ["dnd5e", "monsters"],
    "campaigns": []
  }'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Monster Manual",
  "description": "D&D 5E Creature Reference",
  "type": "rulebook",
  "format": "pdf",
  "uploadUrl": "http://localhost:9000/documents/550e8400-e29b-41d4-a716-446655440000.pdf?X-Amz-Algorithm=...",
  "uploadedBy": "dm-456",
  "uploadedAt": "2025-10-19T12:00:00.000Z",
  "tags": ["dnd5e", "monsters"],
  "campaigns": [],
  "ocrStatus": "pending"
}
```

**Quick Search (Spell):**
```bash
curl "http://localhost:3000/api/search/quick?term=fireball&type=spell"
```

**Response:**
```json
{
  "query": "fireball",
  "total": 1,
  "results": [
    {
      "id": "struct-123",
      "name": "Fireball",
      "type": "spell",
      "document": {
        "id": "doc-456",
        "title": "Player's Handbook"
      },
      "pageNumber": 241,
      "quickView": {
        "name": "Fireball",
        "level": "3",
        "school": "evocation",
        "castingTime": "1 action",
        "range": "150 feet",
        "components": "V, S, M",
        "duration": "Instantaneous",
        "description": "A bright streak flashes from your pointing finger..."
      }
    }
  ]
}
```

---

## WebSocket Events

Connect to `ws://localhost:3002/ws` for real-time collaboration features.

### Event Format

All events follow this structure:
```json
{
  "type": "event:name",
  "data": { ... }
}
```

### Session Management

**Client → Server:**

| Event | Description | Payload |
|-------|-------------|---------|
| `doc:session:create` | Create viewing session | `{ documentId, campaignId, roomCode, presenter, syncSettings? }` |
| `doc:session:join` | Join existing session | `{ sessionId, userId }` |
| `doc:session:leave` | Leave session | `{ sessionId }` |
| `doc:session:update-settings` | Update sync settings | `{ sessionId, syncSettings }` |

**Server → Client:**

| Event | Description | Payload |
|-------|-------------|---------|
| `session:created` | Session created | `{ session }` |
| `session:joined` | User joined | `{ session?, userId }` |
| `session:left` | User left | `{ userId }` |
| `session:updated` | Settings updated | `{ syncSettings }` |

### Navigation Sync

**Client → Server:**

| Event | Description | Payload |
|-------|-------------|---------|
| `doc:page:change` | Navigate to page | `{ sessionId, page }` |
| `doc:scroll:sync` | Sync scroll position | `{ sessionId, position }` |

**Server → Client:**

| Event | Description | Payload |
|-------|-------------|---------|
| `page:changed` | Page changed (broadcast) | `{ page }` |
| `scroll:synced` | Scroll synced (broadcast) | `{ position }` |

### DM Controls

**Client → Server:**

| Event | Description | Payload |
|-------|-------------|---------|
| `doc:push:page` | Force page for all viewers | `{ sessionId, page }` |
| `doc:push:reference` | Push bookmark to viewers | `{ sessionId, referenceId }` |

**Server → Client:**

| Event | Description | Payload |
|-------|-------------|---------|
| `page:pushed` | Page force-pushed | `{ page }` |
| `reference:pushed` | Reference pushed | `{ referenceId }` |

### Real-time Annotations

**Client → Server:**

| Event | Description | Payload |
|-------|-------------|---------|
| `doc:annotation:create` | Create annotation | `{ sessionId, annotation }` |
| `doc:annotation:update` | Update annotation | `{ sessionId, annotationId, updates }` |
| `doc:annotation:delete` | Delete annotation | `{ sessionId, annotationId }` |

**Server → Client:**

| Event | Description | Payload |
|-------|-------------|---------|
| `annotation:created` | Annotation created | `{ annotation }` |
| `annotation:updated` | Annotation updated | `{ annotation }` |
| `annotation:deleted` | Annotation deleted | `{ annotationId }` |

### Example WebSocket Client

```typescript
const ws = new WebSocket('ws://localhost:3002/ws');

ws.onopen = () => {
  // Create session as DM
  ws.send(JSON.stringify({
    type: 'doc:session:create',
    data: {
      documentId: 'doc-123',
      campaignId: 'campaign-456',
      roomCode: 'GAME42',
      presenter: 'dm-user-id',
      syncSettings: {
        syncScroll: true,
        syncPage: true,
        syncHighlight: true
      }
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'session:created':
      console.log('Session ID:', message.data.session.sessionId);
      break;

    case 'page:changed':
      console.log('Navigate to page:', message.data.page);
      break;

    case 'annotation:created':
      console.log('New annotation:', message.data.annotation);
      break;
  }
};

// Join session as player
ws.send(JSON.stringify({
  type: 'doc:session:join',
  data: {
    sessionId: 'session-789',
    userId: 'player-user-id'
  }
}));

// DM pushes page to all players
ws.send(JSON.stringify({
  type: 'doc:push:page',
  data: {
    sessionId: 'session-789',
    page: 42
  }
}));
```

---

## Development

### Local Setup

```bash
# Install dependencies for each service
cd services/doc-api && npm install && cd ../..
cd services/doc-processor && npm install && cd ../..
cd services/doc-websocket && npm install && cd ../..

# Generate Prisma client
cd services/doc-api && npm run prisma:generate && cd ../..
cd services/doc-processor && npm run prisma:generate && cd ../..
cd services/doc-websocket && npm run prisma:generate && cd ../..

# Start infrastructure (without application services)
docker compose up -d postgres redis elasticsearch minio

# Run services in development mode (hot reload)
cd services/doc-api && npm run dev &
cd services/doc-processor && npm run dev &
cd services/doc-websocket && npm run dev &
```

### Database Management

```bash
cd services/doc-api

# Generate Prisma client after schema changes
npm run prisma:generate

# Push schema changes to database (no migrations)
npm run prisma:push

# Open Prisma Studio (database GUI)
npm run prisma:studio

# Create migration (for production)
npm run prisma:migrate
```

### Building Services

```bash
# Build TypeScript
cd services/doc-api && npm run build

# Build Docker images
docker compose build

# Build specific service
docker compose build doc-api
```

### Environment Variables

Each service requires a `.env` file. See examples below:

**services/doc-api/.env:**
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/doclib
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=documents
QUEUE_NAME=document-processing
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=admin
S3_SECRET_KEY=password
S3_BUCKET=documents
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
UPLOAD_URL_EXPIRY=3600
DOWNLOAD_URL_EXPIRY=3600
MAX_FILE_SIZE=104857600
```

**services/doc-processor/.env:**
```env
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/doclib
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=documents
QUEUE_NAME=document-processing
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=admin
S3_SECRET_KEY=password
S3_BUCKET=documents
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

**services/doc-websocket/.env:**
```env
NODE_ENV=development
PORT=3002
DATABASE_URL=postgresql://user:pass@localhost:5432/doclib
REDIS_URL=redis://localhost:6379
SESSION_TTL=3600
```

---

## Testing

### Quick Smoke Test

```bash
# Start all services and verify health
./test-stack.sh
```

### Unit Tests

```bash
# Run all unit tests
cd services/doc-api && npm test
cd services/doc-processor && npm test
cd services/doc-websocket && npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Run integration tests (requires docker-compose.test.yml)
cd services/doc-api && npm run test:integration
```

### Full Test Suite

```bash
# Run all tests across all services
./run-tests.sh all

# Run only unit tests
./run-tests.sh unit

# Run only integration tests
./run-tests.sh integration
```

### Manual Testing

See [TESTING.md](TESTING.md) for comprehensive manual testing guides including:
- Document upload/download workflows
- Search functionality testing
- WebSocket connection testing
- Performance testing strategies

---

## Deployment

### Production Considerations

**Security:**
- Set `xpack.security.enabled=true` in ElasticSearch (currently disabled for dev)
- Use strong database credentials (not `user:pass`)
- Enable S3/CloudFlare R2 authentication
- Implement WebSocket authentication via shared secret
- Use HTTPS/WSS in production

**Environment:**
- Set `NODE_ENV=production`
- Use production-grade PostgreSQL (AWS RDS, etc.)
- Use managed Redis (AWS ElastiCache, etc.)
- Use managed ElasticSearch (AWS OpenSearch, Elastic Cloud)
- Use AWS S3 or Cloudflare R2 instead of MinIO

**Scaling:**
- Run multiple `doc-api` instances behind a load balancer
- Run multiple `doc-processor` workers for parallel processing
- Use Redis Cluster for high availability
- Configure ElasticSearch cluster with replicas

**Monitoring:**
- Add application logging (Pino, Winston)
- Set up health check monitoring
- Monitor BullMQ queue depth and job failures
- Track ElasticSearch query performance
- Monitor S3 upload/download metrics

### Docker Deployment

```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Start production stack
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## Project Structure

```
NexusCodex/
├── services/
│   ├── doc-api/                    # REST API service
│   │   ├── src/
│   │   │   ├── config/             # Environment configuration
│   │   │   ├── routes/             # API endpoints
│   │   │   ├── services/           # Business logic (S3, DB, Queue, ElasticSearch)
│   │   │   ├── types/              # TypeScript types and Zod schemas
│   │   │   └── server.ts           # Fastify application
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Database schema
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── doc-processor/              # Background processing worker
│   │   ├── src/
│   │   │   ├── config/             # Environment configuration
│   │   │   ├── services/           # Processing services (PDF, OCR, extraction, etc.)
│   │   │   ├── workers/            # BullMQ job handlers
│   │   │   └── index.ts            # Worker entry point
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Symlink to doc-api schema
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── doc-websocket/              # WebSocket real-time service
│       ├── src/
│       │   ├── config/             # Environment configuration
│       │   ├── handlers/           # WebSocket event handlers
│       │   ├── services/           # Session management, Redis
│       │   ├── types/              # Event schemas
│       │   ├── websocket/          # WebSocket server
│       │   └── index.ts            # Express + WebSocket entry
│       ├── Dockerfile
│       └── package.json
│
├── docker-compose.yml              # Development stack
├── docker-compose.test.yml         # Testing stack
├── test-stack.sh                   # Health check script
├── run-tests.sh                    # Test runner
├── README.md                       # This file
├── CLAUDE.md                       # Development guide for Claude Code
├── TESTING.md                      # Comprehensive testing guide
└── LICENSE
```

---

## Tech Stack

**Backend:**
- Node.js 20 + TypeScript 5.3
- Fastify 4 (REST API)
- Express + ws (WebSocket)
- Prisma ORM (PostgreSQL)

**Processing:**
- BullMQ (Redis-backed job queue)
- pdf-parse (text extraction)
- Tesseract.js (OCR)
- sharp + pdfjs-dist (thumbnails)
- remark + unified (Markdown)

**Storage:**
- PostgreSQL 16 (metadata)
- ElasticSearch 8 (full-text search)
- Redis 7 (queue + sessions)
- MinIO / S3 / R2 (file storage)

**DevOps:**
- Docker + Docker Compose
- Jest (testing)
- tsx (development hot reload)

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** and create a feature branch
2. **Write tests** for new features or bug fixes
3. **Run the test suite** and ensure all tests pass
4. **Follow TypeScript best practices** and use Zod for validation
5. **Update documentation** (README, CLAUDE.md, TESTING.md)
6. **Submit a pull request** with a clear description

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and test
npm test

# Commit changes
git add .
git commit -m "Add new feature: description"

# Push and create PR
git push origin feature/my-feature
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

For issues, questions, or feature requests:
- **GitHub Issues**: [Open an issue](https://github.com/your-org/NexusCodex/issues)
- **Documentation**: See [CLAUDE.md](CLAUDE.md) for architecture details
- **Testing Guide**: See [TESTING.md](TESTING.md) for testing strategies

---

## Acknowledgments

Built with ❤️ for the Nexus VTT community.

Special thanks to:
- The D&D community for inspiration
- Open source maintainers of our dependencies
- Contributors and testers

---

**Status**: Production Ready ✅

All planned phases (1-5) are complete. The system is ready for integration with VTT frontends.
