# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NexusCodex is a document library microservice for a Virtual Tabletop (VTT) system, enabling document upload, processing, search, real-time collaboration, and structured data extraction for D&D content. The system is composed of three Node.js/TypeScript microservices orchestrated via Docker Compose.

## Architecture

### Microservices

**doc-api** (Port 3000)
- Fastify-based REST API for document CRUD operations
- Handles document uploads via S3 pre-signed URLs
- Manages references/bookmarks, annotations, and structured data
- Supports HTTP Range requests for PDF streaming (critical for PDF.js)
- Triggers background processing jobs via BullMQ

**doc-processor** (Background Worker)
- BullMQ worker that processes uploaded documents
- PDF text extraction (pdf-parse), thumbnail generation (sharp/pdfjs-dist)
- OCR support for image-based PDFs (Tesseract.js)
- Markdown processing (remark/unified)
- Structured data extraction for D&D content (spells, monsters, items)
- Indexes extracted text in ElasticSearch (NOT in PostgreSQL)

**doc-websocket** (Port 3002)
- Express + ws-based WebSocket server for real-time collaboration
- Session management (Redis-backed with TTL)
- Synchronized document viewing (page navigation, scroll position)
- Real-time annotation sync across session participants
- DM "push" features to force page navigation for players

### Storage Layer

- **PostgreSQL 16**: Primary datastore (Prisma ORM) for documents, references, annotations, structured data
- **Redis 7**: BullMQ job queue + WebSocket session storage
- **ElasticSearch 8**: Full-text search for document content (text NOT stored in Postgres)
- **MinIO (dev) / S3/R2 (prod)**: Document file storage

### Data Flow

1. Client requests document upload → doc-api generates S3 pre-signed URL
2. Client uploads file directly to S3
3. doc-api enqueues processing job to BullMQ (Redis)
4. doc-processor picks up job → extracts text, generates thumbnail, OCR if needed
5. Extracted text indexed in ElasticSearch (NOT saved to Postgres)
6. Structured data (spells, monsters, etc.) extracted and saved to Postgres
7. Client queries via REST API or WebSocket for real-time collaboration

**CRITICAL**: Text content is stored ONLY in ElasticSearch to keep the primary database lean. The `Document` model has no `textContent` field.

## Common Commands

### Start All Services

```bash
# Build and start all services (postgres, redis, elasticsearch, minio, all microservices)
docker compose up --build

# Start in background
docker compose up -d

# View logs
docker compose logs -f [service-name]
```

### Stop Services

```bash
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

### Database Management (Prisma)

```bash
cd services/doc-api  # or doc-processor or doc-websocket

# Generate Prisma client after schema changes
npm run prisma:generate

# Push schema changes to database (dev only, no migrations)
npm run prisma:push

# Open Prisma Studio (GUI for database)
npm run prisma:studio

# Create migration (for production-ready schema changes)
npm run prisma:migrate
```

### Development

```bash
cd services/[service-name]

# Install dependencies
npm install

# Run in watch mode (hot reload with tsx)
npm run dev

# Build TypeScript
npm run build

# Start production build
npm start
```

### Testing

```bash
# Quick smoke test (health checks for all services)
./test-stack.sh

# Run unit tests
cd services/doc-api && npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Integration tests
npm run test:integration

# Full test suite (all services)
./run-tests.sh all
```

## Key Implementation Details

### HTTP Range Header Support

The `GET /api/documents/:id/content` endpoint in doc-api **must** support HTTP Range headers for PDF.js to function correctly. This is implemented in `services/doc-api/src/routes/documents.ts` using S3's `Range` parameter.

### Document Processing Pipeline

1. Upload triggers BullMQ job in doc-api (`services/doc-api/src/services/queue.service.ts`)
2. Worker in doc-processor consumes job (`services/doc-processor/src/workers/process-document.worker.ts`)
3. Processing steps:
   - Download from S3
   - Extract text (PDF or Markdown)
   - Generate thumbnail (first page for PDFs)
   - OCR if image-based PDF detected
   - Extract structured D&D content (spells, monsters, items)
   - Index text in ElasticSearch
   - Save structured data to Postgres
   - Update document status

### WebSocket Event Flow

Clients connect to `ws://localhost:3002/ws` and send/receive JSON messages with `{ type, data }` structure. All events are validated with Zod schemas in `services/doc-websocket/src/types/events.ts`.

**Session Flow**:
1. DM sends `doc:session:create` → creates session in Redis
2. Players send `doc:session:join` → adds to session viewers list
3. Page changes broadcast via `page:changed` if sync enabled
4. DM can force navigation with `doc:push:page` (always broadcasts)

### Structured Data Extraction

The extraction service (`services/doc-processor/src/services/extraction.service.ts`) uses regex patterns to identify and parse D&D content:

- **Spells**: Pattern matches "X-level [school]" or "Cantrip"
- **Monsters**: Pattern matches stat blocks with AC, HP, Speed
- **Items**: Pattern matches rarity keywords (uncommon, rare, legendary, etc.)

Extracted data is stored in the `StructuredData` Prisma model and searchable via `/api/search/quick?term=fireball&type=spell`.

## Schema Management

The Prisma schema is defined in `services/doc-api/prisma/schema.prisma`. **Important**: `services/doc-processor/prisma/schema.prisma` is a **symlink** to the doc-api schema to ensure consistency. Both services share the same database and schema.

When modifying the schema:
1. Edit only `services/doc-api/prisma/schema.prisma`
2. Run `npm run prisma:generate` in **both** doc-api and doc-processor
3. Run `npm run prisma:push` to apply changes to the database
4. Rebuild Docker images if needed

## Environment Variables

Each service requires a `.env` file (see `README.md` for full templates). Key variables:

**doc-api**:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection for BullMQ
- `ELASTICSEARCH_URL`: ElasticSearch endpoint
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`: S3 config
- `S3_FORCE_PATH_STYLE=true`: Required for MinIO

**doc-processor**:
- Same as doc-api (shares database, Redis, ElasticSearch, S3)

**doc-websocket**:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis for session storage
- `SESSION_TTL`: Session expiration time (seconds)

## Testing Strategy

- **Unit tests**: Test individual services, functions, and utilities
- **Integration tests**: Test API endpoints with real database (uses `docker-compose.test.yml`)
- **Smoke tests**: `test-stack.sh` validates all services are running and healthy
- **Manual testing**: Use curl commands from `README.md` or Postman

Unit tests are located in `__tests__` directories within each service's `src` folder.

## Common Patterns

### Adding a New API Endpoint

1. Define route in `services/doc-api/src/routes/[resource].ts`
2. Use Zod schemas from `services/doc-api/src/types/` for validation
3. Call Prisma client via `services/doc-api/src/services/database.service.ts`
4. Return standardized JSON responses
5. Add integration tests in `services/doc-api/src/__tests__/`

### Adding a New WebSocket Event

1. Define event schema in `services/doc-websocket/src/types/events.ts`
2. Create handler in `services/doc-websocket/src/handlers/[category].handler.ts`
3. Register handler in `services/doc-websocket/src/websocket/server.ts`
4. Update README.md WebSocket Events section
5. Add tests in `services/doc-websocket/src/__tests__/`

### Adding a New Processing Step

1. Create service in `services/doc-processor/src/services/[name].service.ts`
2. Import and call in `services/doc-processor/src/workers/process-document.worker.ts`
3. Update document status enum in Prisma schema if needed
4. Add unit tests in `services/doc-processor/src/services/__tests__/`

## Security Notes

- **ElasticSearch**: Currently `xpack.security.enabled=false` for development. **MUST** be enabled in production.
- **S3 URLs**: Pre-signed URLs expire (default: 1 hour). Clients must refresh if needed.
- **WebSocket Auth**: Not yet implemented. In production, VTT server must authenticate with shared secret.
- **Docker**: Development `docker-compose.yml` uses weak credentials. Change in production.

## File Structure Highlights

```
services/
├── doc-api/
│   ├── src/
│   │   ├── routes/         # API endpoints (documents, search, references, annotations, structured-data, processing)
│   │   ├── services/       # Business logic (s3, database, queue, elastic)
│   │   ├── types/          # Zod schemas & TypeScript types
│   │   └── server.ts       # Fastify app setup
│   └── prisma/schema.prisma  # Master schema
├── doc-processor/
│   ├── src/
│   │   ├── services/       # Processing logic (pdf, ocr, markdown, thumbnail, extraction, elastic)
│   │   └── workers/        # BullMQ job handlers
│   └── prisma/schema.prisma  # Symlink to doc-api schema
└── doc-websocket/
    ├── src/
    │   ├── handlers/       # WebSocket event handlers (session, navigation, push, annotation)
    │   ├── services/       # Redis, session management
    │   └── websocket/      # WebSocket server setup
```

## Troubleshooting

**Database connection errors**: Ensure `docker compose up` has fully started postgres (check `docker compose logs postgres`)

**Prisma client not found**: Run `npm run prisma:generate` in the service directory

**S3 upload failures**: Verify MinIO is running (`docker compose ps minio`) and credentials match `.env`

**ElasticSearch indexing fails**: Check ElasticSearch health (`curl http://localhost:9200/_cluster/health`), ensure index exists

**WebSocket disconnects**: Check Redis is running and `SESSION_TTL` is reasonable (default: 3600s)

**Docker build failures on macOS**: Set `export DOCKER_BUILDKIT=0` to use legacy builder (avoids permission issues)

## Key Files to Review

- `docker-compose.yml`: Full service orchestration
- `services/doc-api/src/server.ts`: API entry point with all route registrations
- `services/doc-processor/src/workers/process-document.worker.ts`: Core processing logic
- `services/doc-websocket/src/websocket/server.ts`: WebSocket event routing
- `services/doc-api/prisma/schema.prisma`: Complete data models
- `test-stack.sh`: Quick health check script
- `README.md`: Comprehensive API documentation and examples
