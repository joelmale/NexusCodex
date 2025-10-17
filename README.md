# Nexus VTT - Document Library Microservice

A comprehensive document management system for the Nexus Virtual Tabletop, providing document upload, storage, search, and real-time collaboration features.

## Phase 1: Basic PDF Viewer & CRUD

### Features

- **Document Upload**: Generate pre-signed S3 URLs for secure client-side uploads
- **Document Management**: Full CRUD operations for document metadata
- **Document Streaming**: HTTP Range request support for efficient PDF rendering
- **Storage**: S3-compatible storage (MinIO for development, S3/R2 for production)
- **Database**: PostgreSQL with Prisma ORM for type-safe queries
- **Filtering**: Search by document type, campaign, tags, and text

### Tech Stack

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Storage**: MinIO (S3-compatible)
- **Cache**: Redis 7
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

3. **Access the API**
   - API: http://localhost:3000
   - MinIO Console: http://localhost:9001 (admin/password)
   - PostgreSQL: localhost:5432 (user/pass)

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

#### Health Checks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Basic service info |
| `GET` | `/health` | Health check with database status |

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

Create a `.env` file in `services/doc-api/`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/doclib
REDIS_URL=redis://localhost:6379
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

## Project Structure

```
NexusCodex/
├── services/
│   └── doc-api/                # Document API service
│       ├── src/
│       │   ├── config/         # Environment configuration
│       │   │   └── env.ts      # Zod-validated env vars
│       │   ├── routes/         # API endpoints
│       │   │   └── documents.ts
│       │   ├── services/       # Business logic
│       │   │   ├── s3.service.ts
│       │   │   └── database.service.ts
│       │   ├── types/          # TypeScript types & schemas
│       │   │   └── document.ts
│       │   └── server.ts       # Fastify app entry point
│       ├── prisma/
│       │   └── schema.prisma   # Database schema
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
└── README.md
```

## Document Model

The full document model includes:

- **Core Fields**: id, title, description, type, format
- **Storage**: storageKey, fileSize, pageCount, thumbnailKey
- **Metadata**: author, uploadedBy, uploadedAt, lastModified
- **Organization**: tags[], collections[], campaigns[]
- **Search**: searchIndex (ElasticSearch ID), ocrStatus
- **Access**: isPublic, metadata (flexible JSON)

### Document Types

- `rulebook` - Game rule books
- `campaign_note` - Campaign notes and documents
- `handout` - Player handouts
- `map` - Battle maps and world maps
- `character_sheet` - Character sheets
- `homebrew` - Custom homebrew content

## Next Phases

### Phase 2: Processing, Search & Organization
- ElasticSearch integration
- PDF text extraction
- Thumbnail generation
- Full-text search endpoints
- Document references/bookmarks

### Phase 3: Real-time Collaboration
- WebSocket service
- Document viewing sessions
- DM push features
- Navigation sync

### Phase 4: Annotations & Enhancements
- Persistent annotations
- Collaborative highlighting
- Real-time annotation sync

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.
