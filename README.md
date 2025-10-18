# Nexus VTT - Document Library Microservice

A comprehensive document management system for the Nexus Virtual Tabletop, providing document upload, storage, search, and real-time collaboration features.

## Current Status: Phase 5 Complete ✅

### Phase 1: Basic PDF Viewer & CRUD ✅

- **Document Upload**: Generate pre-signed S3 URLs for secure client-side uploads
- **Document Management**: Full CRUD operations for document metadata
- **Document Streaming**: HTTP Range request support for efficient PDF rendering
- **Storage**: S3-compatible storage (MinIO for development, S3/R2 for production)
- **Database**: PostgreSQL with Prisma ORM for type-safe queries
- **Filtering**: Search by document type, campaign, tags, and text

### Phase 2: Processing, Search & Organization ✅

- **Automatic Processing**: Background worker for PDF text extraction and thumbnail generation
- **Full-Text Search**: ElasticSearch-powered search across document content
- **Quick Search**: Fast lookup with highlighted snippets
- **Bookmarks/References**: Create and manage document bookmarks with page numbers and notes
- **Thumbnail Generation**: Automatic first-page thumbnails for all PDF documents
- **Processing Queue**: BullMQ-based job queue with retry logic and error handling

### Phase 3: Real-time Collaboration ✅

- **WebSocket Server**: Real-time communication for document viewing sessions
- **Session Management**: Create and join document viewing sessions with room codes
- **Navigation Sync**: Synchronized page changes and scroll positions
- **DM Push Features**: Force page navigation and push references to players
- **Session Settings**: Configurable sync settings (scroll, page, highlight)
- **Ephemeral Sessions**: Redis-backed session storage with automatic TTL expiration
- **Connection Management**: Heartbeat monitoring and automatic cleanup

### Phase 4: Annotations & Enhancements ✅

- **Persistent Annotations**: Create highlights, notes, and drawings on documents
- **Annotation Types**: Support for highlights, text notes, and freehand drawings
- **Real-time Sync**: Live annotation updates across all session participants
- **Shared Annotations**: Mark annotations as shared with campaign members
- **Page-based Organization**: Annotations indexed by page number for fast retrieval
- **Reference Linking**: Link annotations to bookmarks/references
- **Color Coding**: Customizable colors for visual organization
- **Complete CRUD**: Full create, read, update, delete operations via REST and WebSocket

### Phase 5: Advanced Processing ✅

- **OCR Support**: Tesseract.js integration for image-based PDF text extraction
- **Markdown Documents**: Full support for Markdown (.md) file upload and processing
- **Structured Data Extraction**: Automatic extraction of D&D content (spells, monsters, items)
- **Quick Search API**: Fast lookup for spells, items, and monsters with structured data
- **Smart Detection**: Automatic detection of image-based PDFs for OCR processing
- **Multi-format Processing**: Unified pipeline for PDF and Markdown documents
- **Structured Database**: Dedicated table for searchable game content
- **Pattern Matching**: Advanced regex-based extraction for D&D stat blocks

### Tech Stack

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Fastify (REST API), Express + ws (WebSocket)
- **Database**: PostgreSQL 16 with Prisma ORM
- **Search**: ElasticSearch 8
- **Queue**: BullMQ (Redis-backed)
- **Storage**: MinIO (S3-compatible)
- **Cache**: Redis 7 (+ session storage)
- **Processing**: pdf-parse, pdfjs-dist, sharp, Tesseract.js (OCR), remark (Markdown)
- **WebSocket**: ws library with heartbeat monitoring
- **Container**: Docker & Docker Compose

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd NexusCodex
   ```

2. **Start all services**
   ```bash
   docker-compose up --build
   ```

3. **Access the services**
   - REST API: http://localhost:3000
   - WebSocket: ws://localhost:3002/ws
   - MinIO Console: http://localhost:9001 (admin/password)
   - PostgreSQL: localhost:5432 (user/pass)
   - ElasticSearch: http://localhost:9200

### API Endpoints

#### Document Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents` | Create document and get signed upload URL |
| `GET` | `/api/documents` | List documents with filtering |
| `GET` | `/api/documents/:id` | Get document metadata |
| `GET` | `/api/documents/:id/content` | Stream document (supports Range headers) |
| `PUT` | `/api/documents/:id` | Update document metadata |
| `DELETE` | `/api/documents/:id` | Delete document |

#### Document Processing (Phase 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/:id/process` | Trigger document processing (extract text, generate thumbnail) |
| `GET` | `/api/documents/:id/processing-status` | Get processing status and results |

#### Search (Phase 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?query=...` | Full-text search with filters (type, campaigns, tags) |
| `GET` | `/api/search/quick?query=...` | Quick search with top results and snippets |

#### References/Bookmarks (Phase 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/references` | Create a bookmark/reference |
| `GET` | `/api/references` | List references (filter by document, user, campaign) |
| `GET` | `/api/references/:id` | Get specific reference |
| `PUT` | `/api/references/:id` | Update reference |
| `DELETE` | `/api/references/:id` | Delete reference |

#### Annotations (Phase 4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents/:id/annotations` | Get all annotations for a document (filter by user, campaign, page, type) |
| `POST` | `/api/documents/:id/annotations` | Create a new annotation |
| `GET` | `/api/annotations` | List all annotations with filtering |
| `GET` | `/api/annotations/:id` | Get specific annotation |
| `PUT` | `/api/annotations/:id` | Update annotation (content, color, position, isShared) |
| `DELETE` | `/api/annotations/:id` | Delete annotation |

#### Structured Data (Phase 5)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents/:id/structured-data` | Get all structured data for a document (filter by type, name) |
| `GET` | `/api/structured-data` | List all structured data with filtering |
| `GET` | `/api/structured-data/:id` | Get specific structured data entry |
| `GET` | `/api/search/quick?term=...&type=...` | Quick search for spells, items, monsters with structured results |
| `DELETE` | `/api/structured-data/:id` | Delete structured data entry |

#### Health Checks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Basic service info (doc-api) |
| `GET` | `/health` | Health check with database status (doc-api) |
| `GET` | `/health` | WebSocket service health check (doc-websocket) |

### WebSocket Events

The WebSocket service (`ws://localhost:3002/ws`) supports real-time collaboration features.

#### Session Management Events

**Client → Server (Incoming)**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `doc:session:create` | Create a new viewing session | `{ documentId, campaignId, roomCode, presenter, syncSettings? }` |
| `doc:session:join` | Join an existing session | `{ sessionId, userId }` |
| `doc:session:leave` | Leave a session | `{ sessionId }` |
| `doc:session:update-settings` | Update session sync settings | `{ sessionId, syncSettings }` |

**Server → Client (Outgoing)**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `session:created` | Session created successfully | `{ session }` |
| `session:joined` | User joined session | `{ session?, userId }` |
| `session:left` | User left session | `{ userId }` |
| `session:updated` | Session settings updated | `{ syncSettings }` |

#### Navigation Sync Events

**Client → Server**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `doc:page:change` | Page navigation | `{ sessionId, page }` |
| `doc:scroll:sync` | Scroll position update | `{ sessionId, position }` |

**Server → Client**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `page:changed` | Page changed (broadcast to viewers) | `{ page }` |
| `scroll:synced` | Scroll position synced | `{ position }` |

#### DM Push Events

**Client → Server**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `doc:push:page` | Force page navigation for all viewers | `{ sessionId, page }` |
| `doc:push:reference` | Push a bookmark/reference to viewers | `{ sessionId, referenceId }` |

**Server → Client**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `page:pushed` | Page force-pushed by DM | `{ page }` |
| `reference:pushed` | Reference pushed by DM | `{ referenceId }` |

#### Annotation Real-time Events (Phase 4)

**Client → Server**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `doc:annotation:create` | Create annotation in real-time | `{ sessionId, annotation: {...} }` |
| `doc:annotation:update` | Update annotation in real-time | `{ sessionId, annotationId, updates: {...} }` |
| `doc:annotation:delete` | Delete annotation in real-time | `{ sessionId, annotationId }` |

**Server → Client**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `annotation:created` | Annotation created (broadcast) | `{ annotation }` |
| `annotation:updated` | Annotation updated (broadcast) | `{ annotation }` |
| `annotation:deleted` | Annotation deleted (broadcast) | `{ annotationId }` |

#### Error Events

**Server → Client**

| Event Type | Description | Payload |
|------------|-------------|---------|
| `error` | Error occurred | `{ message, error? }` |

### Example Usage

#### Upload a Document

1. **Create document record and get upload URL**
   ```bash
   curl -X POST http://localhost:3000/api/documents \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Player Handbook",
       "description": "D&D 5E Player Handbook",
       "type": "rulebook",
       "format": "pdf",
       "uploadedBy": "user-123",
       "fileSize": 15728640,
       "fileName": "phb.pdf",
       "tags": ["dnd5e", "core-rules"],
       "campaigns": ["campaign-abc"]
     }'
   ```

2. **Upload file to the signed URL**
   ```bash
   curl -X PUT "<uploadUrl>" \
     -H "Content-Type: application/pdf" \
     --data-binary "@phb.pdf"
   ```

#### List Documents

```bash
# List all documents
curl http://localhost:3000/api/documents

# Filter by campaign
curl http://localhost:3000/api/documents?campaign=campaign-abc

# Filter by type
curl http://localhost:3000/api/documents?type=rulebook

# Search
curl http://localhost:3000/api/documents?search=player
```

#### Stream a PDF

```bash
# Full document
curl http://localhost:3000/api/documents/:id/content -o document.pdf

# Range request (for PDF.js)
curl http://localhost:3000/api/documents/:id/content \
  -H "Range: bytes=0-1023"
```

#### Process a Document (Phase 2)

```bash
# Trigger processing (text extraction + thumbnail generation)
curl -X POST http://localhost:3000/api/documents/:id/process

# Check processing status
curl http://localhost:3000/api/documents/:id/processing-status
```

#### Search Documents (Phase 2)

```bash
# Full-text search
curl "http://localhost:3000/api/search?query=fireball&type=rulebook"

# Quick search with snippets
curl "http://localhost:3000/api/search/quick?query=spell&size=5"

# Search with filters
curl "http://localhost:3000/api/search?query=combat&campaigns=campaign-abc&tags=dnd5e"
```

#### Create and Manage Bookmarks (Phase 2)

```bash
# Create a bookmark
curl -X POST http://localhost:3000/api/references \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "doc-uuid",
    "userId": "user-123",
    "title": "Important Spell",
    "pageNumber": 241,
    "notes": "Fireball spell description",
    "tags": ["spell", "combat"],
    "isShared": true
  }'

# List bookmarks for a document
curl "http://localhost:3000/api/references?documentId=doc-uuid"

# List bookmarks for a user
curl "http://localhost:3000/api/references?userId=user-123"
```

#### Real-time Collaboration (Phase 3)

**JavaScript/TypeScript WebSocket Client Example:**

```typescript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:3002/ws');

ws.onopen = () => {
  console.log('Connected to WebSocket server');

  // Create a new viewing session (as DM/presenter)
  ws.send(JSON.stringify({
    type: 'doc:session:create',
    data: {
      documentId: 'doc-uuid',
      campaignId: 'campaign-123',
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
      console.log('Session created:', message.data.session);
      // Store sessionId for future events
      const sessionId = message.data.session.sessionId;
      break;

    case 'session:joined':
      console.log('User joined:', message.data.userId);
      break;

    case 'page:changed':
      console.log('Navigate to page:', message.data.page);
      // Update UI to show new page
      break;

    case 'page:pushed':
      console.log('DM pushed page:', message.data.page);
      // Force navigation to this page
      break;

    case 'error':
      console.error('Error:', message.data.message);
      break;
  }
};

// Join an existing session (as player)
ws.send(JSON.stringify({
  type: 'doc:session:join',
  data: {
    sessionId: 'session-uuid',
    userId: 'player-user-id'
  }
}));

// Send page change (synced to other viewers if enabled)
ws.send(JSON.stringify({
  type: 'doc:page:change',
  data: {
    sessionId: 'session-uuid',
    page: 42
  }
}));

// DM push page to all viewers (forced navigation)
ws.send(JSON.stringify({
  type: 'doc:push:page',
  data: {
    sessionId: 'session-uuid',
    page: 15
  }
}));

// Push a reference/bookmark to all viewers
ws.send(JSON.stringify({
  type: 'doc:push:reference',
  data: {
    sessionId: 'session-uuid',
    referenceId: 'ref-uuid'
  }
}));
```

#### Annotations (Phase 4)

```bash
# Create an annotation
curl -X POST http://localhost:3000/api/documents/doc-uuid/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "campaignId": "campaign-abc",
    "pageNumber": 42,
    "position": {
      "x": 100,
      "y": 200,
      "width": 150,
      "height": 20
    },
    "type": "highlight",
    "content": "Important spell description",
    "color": "#FFFF00",
    "isShared": true
  }'

# Get all annotations for a document
curl "http://localhost:3000/api/documents/doc-uuid/annotations"

# Get annotations for a specific page
curl "http://localhost:3000/api/documents/doc-uuid/annotations?pageNumber=42"

# Get only shared annotations
curl "http://localhost:3000/api/documents/doc-uuid/annotations?isShared=true"

# Update an annotation
curl -X PUT http://localhost:3000/api/annotations/annotation-uuid \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Updated note text",
    "color": "#FF00FF"
  }'

# Delete an annotation
curl -X DELETE http://localhost:3000/api/annotations/annotation-uuid
```

**Real-time Annotation Sync (WebSocket):**

```typescript
// Add to the WebSocket message handler
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'annotation:created':
      console.log('Annotation created:', message.data.annotation);
      // Add annotation to the UI
      break;

    case 'annotation:updated':
      console.log('Annotation updated:', message.data.annotation);
      // Update annotation in the UI
      break;

    case 'annotation:deleted':
      console.log('Annotation deleted:', message.data.annotationId);
      // Remove annotation from the UI
      break;
  }
};

// Create annotation in real-time (broadcasts to all session participants)
ws.send(JSON.stringify({
  type: 'doc:annotation:create',
  data: {
    sessionId: 'session-uuid',
    annotation: {
      documentId: 'doc-uuid',
      userId: 'user-123',
      pageNumber: 42,
      position: { x: 100, y: 200, width: 150, height: 20 },
      type: 'highlight',
      content: 'Important text',
      color: '#FFFF00',
      isShared: true
    }
  }
}));

// Update annotation in real-time
ws.send(JSON.stringify({
  type: 'doc:annotation:update',
  data: {
    sessionId: 'session-uuid',
    annotationId: 'annotation-uuid',
    updates: {
      content: 'Updated text',
      color: '#FF00FF'
    }
  }
}));

// Delete annotation in real-time
ws.send(JSON.stringify({
  type: 'doc:annotation:delete',
  data: {
    sessionId: 'session-uuid',
    annotationId: 'annotation-uuid'
  }
}));
```

#### Structured Data & Quick Search (Phase 5)

```bash
# Quick search for a spell
curl "http://localhost:3000/api/search/quick?term=fireball&type=spell"

# Response:
# {
#   "query": "fireball",
#   "total": 1,
#   "results": [{
#     "id": "struct-uuid",
#     "name": "Fireball",
#     "type": "spell",
#     "document": { "id": "doc-uuid", "title": "Player's Handbook" },
#     "pageNumber": 241,
#     "quickView": {
#       "name": "Fireball",
#       "level": "3",
#       "school": "evocation",
#       "castingTime": "1 action",
#       "range": "150 feet",
#       "components": "V, S, M",
#       "duration": "Instantaneous",
#       "description": "A bright streak flashes..."
#     }
#   }]
# }

# Search for monsters
curl "http://localhost:3000/api/search/quick?term=dragon&type=monster&limit=3"

# Search for magic items
curl "http://localhost:3000/api/search/quick?term=sword&type=item"

# Get all structured data from a document
curl "http://localhost:3000/api/documents/doc-uuid/structured-data"

# Filter by type
curl "http://localhost:3000/api/documents/doc-uuid/structured-data?type=spell"

# Search across all structured data
curl "http://localhost:3000/api/structured-data?search=fire&type=spell"
```

**Upload Markdown Document:**

```bash
# Create markdown document
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Campaign Notes",
    "description": "Session notes and NPC details",
    "type": "campaign_note",
    "format": "markdown",
    "uploadedBy": "dm-123",
    "fileSize": 5120,
    "fileName": "session-1.md",
    "campaigns": ["campaign-abc"]
  }'

# Upload the markdown file to the signed URL
curl -X PUT "<uploadUrl>" \
  -H "Content-Type": text/markdown" \
  --data-binary "@session-1.md"

# Trigger processing (extracts text, headings, structured data)
curl -X POST http://localhost:3000/api/documents/:id/process
```

## Development

### Local Development Setup

1. **Install dependencies**
   ```bash
   cd services/doc-api
   npm install
   ```

2. **Generate Prisma client**
   ```bash
   npm run prisma:generate
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

### Database Management

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema changes to database
npm run prisma:push

# Open Prisma Studio
npm run prisma:studio

# Create migration
npm run prisma:migrate
```

### Environment Variables

**doc-api service** (`.env` file in `services/doc-api/`):

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

**doc-processor service** (`.env` file in `services/doc-processor/`):

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

**doc-websocket service** (`.env` file in `services/doc-websocket/`):

```env
NODE_ENV=development
PORT=3002
DATABASE_URL=postgresql://user:pass@localhost:5432/doclib
REDIS_URL=redis://localhost:6379
SESSION_TTL=3600
```

## Project Structure

```
NexusCodex/
├── services/
│   ├── doc-api/                # Document API service (Phase 1 & 2)
│   │   ├── src/
│   │   │   ├── config/         # Environment configuration
│   │   │   │   └── env.ts      # Zod-validated env vars
│   │   │   ├── routes/         # API endpoints
│   │   │   │   ├── documents.ts    # Document CRUD
│   │   │   │   ├── processing.ts   # Processing triggers
│   │   │   │   ├── search.ts       # Search endpoints
│   │   │   │   ├── references.ts   # Bookmarks/references
│   │   │   │   ├── annotations.ts  # Annotation CRUD
│   │   │   │   └── structured-data.ts  # Structured data & quick search
│   │   │   ├── services/       # Business logic
│   │   │   │   ├── s3.service.ts
│   │   │   │   ├── database.service.ts
│   │   │   │   ├── queue.service.ts       # BullMQ producer
│   │   │   │   └── elastic.service.ts     # ElasticSearch client
│   │   │   ├── types/          # TypeScript types & schemas
│   │   │   │   ├── document.ts
│   │   │   │   ├── reference.ts
│   │   │   │   ├── annotation.ts
│   │   │   │   ├── structured-data.ts
│   │   │   │   └── search.ts
│   │   │   └── server.ts       # Fastify app entry point
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Full database schema (Document + ... + StructuredData)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── doc-processor/          # Document processing worker (Phase 2)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── env.ts
│   │   │   ├── services/
│   │   │   │   ├── queue.service.ts      # BullMQ consumer
│   │   │   │   ├── pdf.service.ts        # Text extraction
│   │   │   │   ├── thumbnail.service.ts  # Thumbnail generation
│   │   │   │   ├── elastic.service.ts    # ElasticSearch indexing
│   │   │   │   ├── ocr.service.ts        # OCR with Tesseract.js
│   │   │   │   ├── markdown.service.ts   # Markdown processing
│   │   │   │   ├── extraction.service.ts # Structured data extraction
│   │   │   │   ├── s3.service.ts         # S3 operations
│   │   │   │   └── database.service.ts   # Prisma client
│   │   │   ├── workers/
│   │   │   │   └── process-document.worker.ts  # Main processing logic
│   │   │   └── index.ts          # Worker entry point
│   │   ├── prisma/
│   │   │   └── schema.prisma     # Symlink to shared schema
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── doc-websocket/          # WebSocket service (Phase 3)
│       ├── src/
│       │   ├── config/
│       │   │   └── env.ts          # Environment configuration
│       │   ├── handlers/           # WebSocket event handlers
│       │   │   ├── session.handler.ts      # Session management
│       │   │   ├── navigation.handler.ts   # Page/scroll sync
│       │   │   ├── push.handler.ts         # DM push features
│       │   │   └── annotation.handler.ts   # Real-time annotations
│       │   ├── services/
│       │   │   ├── redis.service.ts        # Session storage
│       │   │   ├── session.service.ts      # Session CRUD
│       │   │   └── database.service.ts     # Prisma client
│       │   ├── types/
│       │   │   ├── events.ts       # WebSocket event types & schemas
│       │   │   └── session.ts      # Session types
│       │   ├── websocket/
│       │   │   └── server.ts       # WebSocket server setup
│       │   └── index.ts            # Express + WS entry point
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
└── README.md
```

## Data Models

### Document Model

The full document model includes:

- **Core Fields**: id, title, description, type, format
- **Storage**: storageKey, fileSize, pageCount, thumbnailKey
- **Metadata**: author, uploadedBy, uploadedAt, lastModified
- **Organization**: tags[], collections[], campaigns[]
- **Search**: searchIndex (ElasticSearch ID), ocrStatus
- **Access**: isPublic, metadata (flexible JSON)

#### Document Types

- `rulebook` - Game rule books
- `campaign_note` - Campaign notes and documents
- `handout` - Player handouts
- `map` - Battle maps and world maps
- `character_sheet` - Character sheets
- `homebrew` - Custom homebrew content

### DocumentReference Model (Phase 2)

The bookmark/reference model includes:

- **Identification**: id, documentId, userId, campaignId
- **Location**: pageNumber, section, textSelection (with start/end/text)
- **Metadata**: title, notes, tags[], color
- **Sharing**: isShared (visible to campaign members)
- **Timestamps**: createdAt, lastAccessed

### DocumentAnnotation Model (Phase 4)

The annotation model includes:

- **Identification**: id, documentId, referenceId (optional), userId, campaignId
- **Location**: pageNumber, position (x, y, width, height coordinates)
- **Type**: 'highlight', 'note', or 'drawing'
- **Content**: Note text or drawing data (SVG path, etc.)
- **Visual**: color (hex code for highlighting/markers)
- **Sharing**: isShared (visible to campaign members)
- **Timestamps**: createdAt, modifiedAt

#### Annotation Types

- `highlight` - Text highlights with color coding
- `note` - Text notes attached to specific locations
- `drawing` - Freehand drawings and shapes

### StructuredData Model (Phase 5)

The structured game content model includes:

- **Identification**: id, documentId, type (spell/monster/item/feat/class_feature/other)
- **Location**: pageNumber, section (for location within document)
- **Content**: name, data (JSON object with type-specific fields), searchText
- **Search**: searchIndex (ElasticSearch ID for advanced queries)
- **Timestamps**: createdAt, updatedAt

#### Structured Data Types

- `spell` - D&D spells with level, school, components, etc.
- `monster` - Creatures with stat blocks (AC, HP, CR, etc.)
- `item` - Magic items and equipment with rarity, attunement
- `feat` - Character feats and abilities
- `class_feature` - Class-specific features
- `other` - Other structured content

#### Example Spell Data Structure

```json
{
  "name": "Fireball",
  "level": "3",
  "school": "evocation",
  "castingTime": "1 action",
  "range": "150 feet",
  "components": "V, S, M",
  "duration": "Instantaneous",
  "description": "A bright streak flashes from your pointing finger..."
}
```

## Next Phases

All planned phases complete! Future enhancements could include:
- Advanced OCR for complex layouts
- AI-powered content extraction
- Enhanced structured data for more game systems
- Real-time collaborative document editing

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.
