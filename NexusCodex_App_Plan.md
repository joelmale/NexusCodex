Here is a comprehensive development plan in markdown format, incorporating your specific requests.

-----

# Nexus VTT: Document Library Microservice Plan

## 1\. High-Level Architecture

This microservice provides a modular, real-time, and searchable document library for the Nexus VTT. It is composed of three core services (REST API, WebSocket Service, Document Processor) and a storage layer.

```mermaid
graph TB
    subgraph "Nexus VTT"
        VTT[VTT Frontend]
        VTTWS[VTT WebSocket Server]
        VTTDB[(VTT PostgreSQL)]
    end
    
    subgraph "Document Library Service"
        API[REST API Gateway]
        WS[WebSocket Service]
        PROC[Document Processor]
        SEARCH[Search Service]
        
        subgraph "Storage Layer"
            S3[S3-Compatible Storage]
            DB[(PostgreSQL)]
            REDIS[(Redis Cache)]
            ELASTIC[(ElasticSearch)]
        end
    end
    
    VTT --> API
    VTT --> WS
    VTTWS --> WS
    
    API --> DB
    API --> S3
    API --> REDIS
    API --> SEARCH
    
    WS --> REDIS
    WS --> DB
    
    PROC --> S3
    PROC --> DB
    PROC --> ELASTIC
    
    SEARCH --> ELASTIC
    SEARCH --> DB
```

## 2\. Data Models (Schema)

The following TypeScript interfaces define the core data structures.

### Core Document Model

**Note:** `textContent` is intentionally omitted. Extracted text will be stored *only* in ElasticSearch to keep the primary database lean. The `metadata` field uses `unknown` for type-safety, requiring type-checking upon use.

```typescript
// Core Document Model
interface Document {
  id: string;                    // UUID
  title: string;
  description: string;
  type: DocumentType;             // 'rulebook' | 'campaign_note' | 'handout' | 'map' | 'character_sheet' | 'homebrew'
  format: 'pdf' | 'markdown' | 'html';
  
  // Storage
  storageKey: string;            // S3 object key
  fileSize: number;
  pageCount: number;
  thumbnailKey?: string;         // S3 key for thumbnail
  
  // Metadata
  author: string;
  uploadedBy: string;            // User ID from VTT
  uploadedAt: Date;
  lastModified: Date;
  
  // Organization
  tags: string[];                // ['dnd5e', 'spell', 'combat', 'level-3']
  collections: string[];         // ['Core Rules', 'Player Resources']
  campaigns: string[];           // Campaign IDs this document belongs to
  
  // Search & Processing
  searchIndex?: string;          // ElasticSearch document ID
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'not_required';
  
  // Access
  isPublic: boolean;            // System-wide vs campaign-specific
  metadata: Record<string, unknown>; // Flexible metadata (edition, level range, etc.)
}
```

### Supporting Models

```typescript
// Bookmark/Reference Model
interface DocumentReference {
  id: string;
  documentId: string;
  userId: string;                // Who created this reference
  campaignId?: string;           // Campaign-specific reference
  
  // Location within document
  pageNumber?: number;
  section?: string;              // For markdown/structured docs
  textSelection?: {
    start: number;
    end: number;
    text: string;
  };
  
  // Reference metadata
  title: string;                 // Custom title for the bookmark
  notes?: string;                // User notes
  tags: string[];                // Personal organization tags
  color?: string;                // Visual marker
  isShared: boolean;            // Visible to other campaign members
  
  createdAt: Date;
  lastAccessed?: Date;
}

// Annotation Model
interface DocumentAnnotation {
  id: string;
  documentId: string;
  referenceId?: string;          // Link to bookmark
  userId: string;
  campaignId?: string;
  
  pageNumber: number;
  position: {                    // Coordinates on page
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  
  type: 'highlight' | 'note' | 'drawing';
  content: string;               // Note text or drawing data
  color: string;
  
  isShared: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

// Real-time Session Model
interface DocumentSession {
  sessionId: string;
  documentId: string;
  campaignId: string;
  roomCode: string;              // VTT room code
  
  presenter: string;             // DM user ID
  viewers: string[];             // Player user IDs
  
  currentPage: number;
  scrollPosition?: number;
  activeHighlights: string[];    // Annotation IDs being shown
  
  syncSettings: {
    syncScroll: boolean;
    syncPage: boolean;
    syncHighlight: boolean;
  };
  
  startedAt: Date;
  lastActivity: Date;
}
```

## 3\. Microservice Components

### A. REST API Service

Provides core CRUD, search, and metadata management.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/documents` | List documents with filtering (tags, campaign, type). |
| `POST` | `/api/documents` | Upload a new document. Returns a signed URL for client upload. |
| `GET` | `/api/documents/:id` | Get metadata for a single document. |
| `PUT` | `/api/documents/:id` | Update document metadata (title, tags, etc.). |
| `DELETE` | `/api/documents/:id` | Delete a document (removes from S3, DB, and Search). |
| `GET` | `/api/documents/:id/content` | **Must support HTTP `Range` headers.** Serves the raw document file (e.g., PDF) from S3, enabling streaming/chunking in viewers like PDF.js. |
| `GET` | `/api/documents/:id/thumbnail` | Get the pre-generated thumbnail image. |
| `GET` | `/api/references` | Get all references/bookmarks for the current user. |
| `POST` | `/api/references` | Create a new reference/bookmark. |
| `PUT` | `/api/references/:id` | Update a reference (notes, title). |
| `DELETE`| `/api/references/:id` | Delete a reference. |
| `GET` | `/api/documents/:id/annotations` | Get all annotations for a document (filtered by user/campaign). |
| `POST` | `/api/documents/:id/annotations` | Create a new annotation. |
| `PUT` | `/api/annotations/:id` | Update an annotation (content, color). |
| `DELETE`| `/api/annotations/:id` | Delete an annotation. |
| `GET` | `/api/search` | Full-text search across all indexed documents. |
| `GET` | `/api/search/quick` | Quick lookup (e.g., spells, items) with structured data. |
| `POST` | `/api/campaigns/:id/documents` | Add an existing document to a campaign. |
| `DELETE`| `/api/campaigns/:id/documents/:docId` | Remove a document from a campaign. |

### B. WebSocket Service (Real-time Features)

Handles real-time synchronization of document viewing sessions.

**Security Note:** The VTT WebSocket server must authenticate with this service using a shared secret or service token. This service should *not* trust `userId` or `campaignId` from an unauthenticated connection.

```typescript
// WebSocket Events
interface DocumentWSEvents {
  // Session Management
  'doc:session:create': { documentId: string, campaignId: string };
  'doc:session:join': { sessionId: string };
  'doc:session:leave': { sessionId: string };
  
  // Navigation Sync
  'doc:page:change': { sessionId: string, page: number };
  'doc:scroll:sync': { sessionId: string, position: number };
  
  // Highlighting & Annotation (Real-time)
  'doc:highlight:add': { sessionId: string, selection: TextSelection };
  'doc:highlight:remove': { sessionId: string, highlightId: string };
  'doc:annotation:create': { sessionId: string, annotation: Annotation };
  'doc:annotation:update': { sessionId: string, annotation: Annotation };
  
  // DM Push Features
  'doc:push:page': { sessionId: string, documentId: string, page: number };
  'doc:push:reference': { sessionId: string, referenceId: string };
}
```

### C. Document Processing Pipeline

A background-worker service triggered by new uploads via a message queue (BullMQ).

1.  **Upload Handler:** Client requests upload from API. API generates UUID, creates initial DB record (`ocrStatus: 'pending'`), and returns a signed S3 `PUT` URL.
2.  **Client Upload:** Client uploads file directly to S3.
3.  **S3 Trigger / Queue:** S3 upload completion triggers a message to the processing queue (e.g., via S3 event or API confirmation).
4.  **Processor Receives Job:**
      * **Validate:** Confirms file exists and is valid.
      * **Thumbnail Generator:** Creates preview images (e.g., first page) using `sharp` or `pdfjs-dist`. Saves to S3 and updates `thumbnailKey` in DB.
      * **Text Extractor:** Uses `pdf-parse` to extract all text content from the document.
      * **Search Indexer:** Pushes the extracted text, title, tags, and document ID to ElasticSearch. **The extracted text is NOT saved to Postgres.**
      * **DB Update:** Processor updates the `Document` record in Postgres with `pageCount`, `fileSize`, `searchIndex` (ElasticSearch doc ID), and sets `ocrStatus: 'completed'`.

## 4\. Technology Stack

```json
{
  "core": {
    "runtime": "Node.js 20 + TypeScript",
    "framework": "Fastify for REST, ws for WebSocket",
    "database": "PostgreSQL 16",
    "cache": "Redis 7",
    "search": "ElasticSearch 8",
    "storage": "MinIO (dev), AWS S3 / Cloudflare R2 (prod)"
  },
  "processing": {
    "pdf": "pdf-parse, pdfjs-dist",
    "images": "sharp",
    "markdown": "unified, remark, rehype",
    "queue": "BullMQ with Redis"
  },
  "frontend": {
    "viewer": "PDF.js",
    "markdown": "react-markdown",
    "annotations": "react-pdf-highlighter",
    "sync": "Yjs for collaborative annotations"
  }
}
```

## 5\. Deployment Architecture (docker-compose.yml)

This file is for local development.

**Security Implementation:** Note the `elasticsearch` service environment. This configuration is **for development only**. In production, `xpack.security.enabled` must be set to `true`, and credentials (e.g., `ELASTIC_PASSWORD`) must be provided. All services must be configured to connect to ElasticSearch over HTTPS with valid credentials.

```yaml
version: '3.8'

services:
  doc-api:
    build: ./services/doc-api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/doclib
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - postgres
      - redis
      - elasticsearch
      - minio

  doc-websocket:
    build: ./services/doc-websocket
    ports:
      - "3001:3001"
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/doclib
    depends_on:
      - redis
      - postgres

  doc-processor:
    build: ./services/doc-processor
    environment:
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - DATABASE_URL=postgresql://user:pass@postgres:5432/doclib
    depends_on:
      - redis
      - postgres
      - minio

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=doclib
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      # DEV ONLY: Disable security for local development.
      # PROD: This MUST be 'true' and credentials provided.
      - xpack.security.enabled=false 
    volumes:
      - elastic_data:/usr/share/elasticsearch/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=password
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  elastic_data:
  minio_data:
```

## 6\. Implementation Phases

### Phase 1: Basic PDF Viewer & CRUD

  * **Goal:** Allow users to upload, view, and delete PDF documents.
  * **Key Tasks:**
      * [ ] Set up `docker-compose.yml` with `postgres`, `redis`, and `minio`.
      * [ ] Build `doc-api` service (Node.js/Fastify).
      * [ ] Implement `Document` model in Postgres (using an ORM like Prisma or TypeORM).
      * [ ] Implement `POST /api/documents` to generate a signed S3 upload URL.
      * [ ] Implement `GET /api/documents` (list) and `GET /api/documents/:id` (metadata).
      * [ ] Implement `GET /api/documents/:id/content` with **HTTP Range header support** for PDF streaming.
      * [ ] Implement `DELETE /api/documents/:id`.
      * [ ] Frontend: Integrate `PDF.js` to render a document from the `/content` endpoint.

### Phase 2: Processing, Search & Organization

  * **Goal:** Automatically process uploaded files and make them searchable.
  * **Key Tasks:**
      * [ ] Add `elasticsearch` to `docker-compose.yml`.
      * [ ] Build `doc-processor` service.
      * [ ] Set up `BullMQ` queue for processing.
      * [ ] Implement processing pipeline:
          * [ ] PDF text extraction (`pdf-parse`).
          * [ ] PDF thumbnail generation (`pdfjs-dist`/`sharp`).
      * [ ] Implement ElasticSearch indexing: On job completion, processor sends document ID, title, tags, and full extracted text to ElasticSearch.
      * [ ] Implement `GET /api/search` endpoint in `doc-api` to query ElasticSearch.
      * [ ] Implement `GET /api/search/quick` for structured results.
      * [ ] Implement `DocumentReference` model (bookmarks) and associated CRUD endpoints.
      * [ ] Frontend: Build a search bar and a "quick reference" widget.

### Phase 3: Real-time Collaboration

  * **Goal:** Enable DMs to sync document views with players.
  * **Key Tasks:**
      * [ ] Build `doc-websocket` service.
      * [ ] Implement `DocumentSession` model (stored in Redis for fast access).
      * [ ] Implement WebSocket events: `doc:session:create`, `doc:session:join`, `doc:session:leave`.
      * [ ] Implement navigation sync: `doc:page:change`, `doc:scroll:sync`.
      * [ ] Implement DM push features: `doc:push:page`, `doc:push:reference`.
      * [ ] Implement VTT WebSocket Bridge for secure event forwarding.
      * [ ] Frontend: Create a `DocumentViewer` component that connects to the WebSocket and syncs state based on session.

### Phase 4: Annotations & Enhancements

  * **Goal:** Allow users to create persistent, shareable annotations (highlights, notes).
  * **Key Tasks:**
      * [ ] Implement `DocumentAnnotation` model in Postgres.
      * [ ] Implement `GET /api/documents/:id/annotations` and `POST /api/documents/:id/annotations`.
  * [ ] Implement `PUT /api/annotations/:id` and `DELETE /api/annotations/:id`.
      * [ ] Integrate `Yjs` for real-time collaborative annotation drawing/highlighting, using the WebSocket service to broadcast updates.
      * [ ] Use `doc:annotation:create` and `doc:annotation:update` events for live sync.
      * [ ] Frontend: Integrate `react-pdf-highlighter` (or similar) to display and create annotations.

### Phase 5: Advanced Processing (Future)

  * **Goal:** Support more document types and advanced data extraction.
  * **Key Tasks:**
      * [ ] Add Markdown (`.md`) support (upload, render with `react-markdown`).
      * [ ] Implement OCR pipeline (e.g., Tesseract.js worker) for image-based PDFs.
      * [ ] Add `ocrStatus` tracking to `Document` model.
      * [ ] Implement structured data extraction (e.g., parsing spell blocks, stat blocks).

## 7\. API Examples

### Quick Spell Reference

```http
GET /api/search/quick?term=fireball&type=spell&campaign=abc123
```

```json
{
  "results": [{
    "documentId": "phb-001",
    "documentTitle": "Player's Handbook",
    "reference": {
      "page": 241,
      "section": "Spell Descriptions",
      "snippet": "Fireball - 3rd Level Evocation..."
    },
    "quickView": {
      "title": "Fireball",
      "level": "3rd-level evocation",
      "castingTime": "1 action",
      "range": "150 feet",
      "components": "V, S, M",
      "duration": "Instantaneous",
      "description": "A bright streak flashes..."
    }
  }]
}
```

### DM Push Document

```json
// WebSocket message from DM (forwarded by VTT server)
{
  "type": "doc:push:page",
  "data": {
    "sessionId": "session-123",
    "documentId": "mm-001",
    "page": 47
  }
}
```