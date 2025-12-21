# NexusCodex: Intelligent Codex Architecture Review
## Transforming Document Library into Active Gameplay System

**Prepared by:** Lead TTRPG Systems Architect
**Date:** 2025-12-20
**Scope:** Full-stack architectural review with RAG integration, entity linking, VTT hooks, and performance optimization

---

## Executive Summary

NexusCodex has a **solid foundation** as a document library with good microservice separation, full-text search, and real-time collaboration. However, to become a truly "intelligent codex" for active TTRPG gameplay, it requires significant enhancements in **semantic understanding**, **cross-document intelligence**, and **VTT integration**.

**Key Findings:**
- ✅ **Strengths**: Clean architecture, good separation of concerns, comprehensive admin tools, real-time sync
- ⚠️ **Critical Gaps**: No semantic search, fragile PDF extraction, limited cross-document awareness, no VTT integration
- 🚀 **Opportunity**: Adding RAG + embeddings would transform search from "keyword finder" to "rules expert"

**Priority Recommendations:**
1. **Immediate (Q1)**: Fix performance bottlenecks, improve OCR preprocessing
2. **High (Q2)**: Implement vector search + RAG for semantic Q&A
3. **Medium (Q3)**: Build cross-document entity linking and knowledge graph
4. **Future (Q4+)**: Full VTT integration with webhook schema and real-time entity sync

---

## 1. Performance Bottlenecks & Latency Analysis

### Current Pipeline Performance Issues

Based on analysis of `process-document.worker.ts`, here are **critical bottlenecks** that would slow down mid-session imports:

#### 🔴 **Critical Bottlenecks**

**1. Sequential OCR Processing** (`process-document.worker.ts:150-172`)
- **Current**: Processes pages **one at a time** with single Tesseract worker
- **Impact**: For a 50-page scanned PDF, OCR takes ~10-15 minutes (18-20 seconds/page)
- **Solution**: Parallel OCR with worker pool
  ```typescript
  // Current (BAD)
  for (const buffer of ocrBuffers) {
    const text = await ocrService.extractText(buffer); // Sequential!
  }

  // Recommended
  const texts = await Promise.all(
    ocrBuffers.map(buffer => ocrWorkerPool.process(buffer))
  ); // Parallel processing
  ```

**2. Worker Concurrency Limit** (`env.ts:29`)
- **Current**: `WORKER_CONCURRENCY: 2` — only 2 documents processed simultaneously
- **Impact**: If a DM uploads 5 PDFs mid-session, 3 will wait in queue
- **Solution**: Increase to 4-6 workers (or dynamic based on CPU cores)

**3. Thumbnail Generation Blocking** (`process-document.worker.ts:110-128`)
- **Current**: Thumbnail generation blocks main processing pipeline
- **Impact**: pdfjs-dist canvas rendering can take 2-5 seconds per PDF
- **Solution**: Offload to separate queue with lower priority
  ```typescript
  // Main queue: text extraction, indexing (high priority)
  // Thumbnail queue: visual assets (low priority, can be async)
  await thumbnailQueue.add('generate', { documentId }, { priority: 5 });
  ```

**4. Page Image Rendering** (`process-document.worker.ts:130-179`)
- **Current**: Renders up to 200 pages **synchronously** (10-20 seconds per page for high-res)
- **Impact**: For a 320-page PHB, this alone takes 30-60+ minutes
- **Solution**: Stream rendering with progress updates, or defer to background job

**5. Sequential Structured Data Inserts** (`process-document.worker.ts:219-271`)
- **Current**: Individual `prisma.structuredData.create()` calls in Promise.all
- **Impact**: For PHB with 300+ spells, this creates 300 database round-trips
- **Solution**: Use Prisma batch insert
  ```typescript
  // Current (BAD)
  await Promise.all(spells.map(spell =>
    prisma.structuredData.create({ data: spell })
  )); // 300 round trips!

  // Recommended
  await prisma.structuredData.createMany({
    data: spells.map(spell => ({...})),
    skipDuplicates: true
  }); // Single batch insert
  ```

#### ⚠️ **Secondary Bottlenecks**

**6. No Incremental Processing**
- If a document fails at step 8/10, the entire job must restart
- **Solution**: Add checkpoint/resume capability using job metadata

**7. ElasticSearch Indexing Latency** (`process-document.worker.ts:198`)
- Full-text indexing can take 1-5 seconds for large documents
- **Solution**: Async indexing with eventual consistency (mark document as "searchable: pending")

**8. Content Hash Calculation** (`process-document.worker.ts:51-55`)
- SHA-256 on multi-MB PDFs is CPU-intensive
- **Solution**: Calculate during upload (client-side or in doc-api before enqueuing)

### Recommended Performance Optimizations

**Immediate (Week 1-2):**
1. Increase `WORKER_CONCURRENCY` from 2 → 6
2. Implement Prisma `createMany` for batch inserts
3. Add Redis caching for duplicate detection (hash lookup)
4. Move thumbnail/page-image generation to separate low-priority queue

**Short-term (Month 1):**
5. Parallel OCR with worker pool (4-8 workers)
6. Stream-based page rendering with progress events
7. Checkpoint system for resumable processing
8. Client-side content hash calculation

**Mid-term (Month 2-3):**
9. Add job prioritization (DM mid-session uploads = high priority)
10. Implement lazy page image generation (render on first view)
11. Add ElasticSearch bulk indexing for batch operations
12. Database connection pooling optimization

---

## 2. Semantic Search & RAG Architecture

### Current Limitations

Your search is **keyword-only** with basic fuzzy matching:
- ❌ No understanding of synonyms (e.g., "grapple" ≠ "restrain")
- ❌ No context awareness (e.g., "fireball damage" should prioritize damage calculation sections)
- ❌ Cannot answer questions (e.g., "How does underwater combat work?")
- ❌ No cross-document synthesis (e.g., "Show me all spells that deal fire damage across all books")

### Proposed RAG (Retrieval-Augmented Generation) System

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Query                               │
│              "How does grappling work underwater?"               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Query Understanding (LLM or Embedding Model)           │
│  - Extract intent: "rules", "combat", "conditions"               │
│  - Generate embedding vector (768-dim for sentence-transformers) │
│  - Expand with synonyms: grapple → restrain, grab, hold          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: Hybrid Retrieval (Vector + Keyword + Structured)       │
│                                                                   │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  Vector Search     │  │ Keyword Search   │  │ Structured   │ │
│  │  (ElasticSearch    │  │ (Current ES      │  │ Data Filter  │ │
│  │   KNN on dense_    │  │  multi_match)    │  │ (PostgreSQL) │ │
│  │   vector field)    │  │                  │  │              │ │
│  └────────┬───────────┘  └────────┬─────────┘  └──────┬───────┘ │
│           │                       │                     │         │
│           └───────────────────────┴─────────────────────┘         │
│                                   │                               │
│                          Reciprocal Rank Fusion (RRF)             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: Re-ranking & Filtering                                │
│  - Cross-encoder reranking (optional, for precision)             │
│  - Filter by campaign, document type, source book                │
│  - Deduplicate similar chunks                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: Context Assembly                                       │
│  - Top 5-10 chunks (max 4000 tokens)                             │
│  - Include citations (document title, page number)               │
│  - Prioritize official SRD > homebrew > community content        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 5: Answer Generation (LLM)                               │
│  Prompt:                                                         │
│  "You are a D&D 5e rules expert. Answer based on these sources:  │
│   [Context chunks with citations]                                │
│   Question: How does grappling work underwater?                  │
│   Provide a concise answer with rule citations."                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Final Answer with Citations                   │
│  "Grappling underwater follows normal grappling rules (PHB p195),│
│   but creatures have disadvantage on attack rolls unless they    │
│   have a swim speed (PHB p198, Underwater Combat). A grappled    │
│   creature's speed becomes 0 (PHB p195, Grappling Condition)."   │
│                                                                   │
│  Sources: PHB p195, p198 | View in Reader →                      │
└─────────────────────────────────────────────────────────────────┘
```

#### Implementation Plan

**1. Add Vector Embeddings to ElasticSearch**

Update `elastic.service.ts` mapping:
```typescript
// NEW mapping with dense_vector field
const mapping = {
  properties: {
    // ... existing fields ...
    content: { type: 'text', analyzer: 'english' },

    // NEW: Vector embedding field
    content_embedding: {
      type: 'dense_vector',
      dims: 768, // sentence-transformers/all-MiniLM-L6-v2
      index: true,
      similarity: 'cosine'
    },

    // NEW: Chunk-level fields for better retrieval
    chunk_text: { type: 'text' },
    chunk_index: { type: 'integer' },
    chunk_start_page: { type: 'integer' }
  }
};
```

**2. Document Chunking Strategy**

Modify `process-document.worker.ts` to chunk large documents:
```typescript
// NEW chunking service
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,        // Optimal for semantic search
  chunkOverlap: 50,      // Preserve context across boundaries
  separators: ['\n\n', '\n', '. ', ' ']
});

const chunks = await splitter.createDocuments([text]);

// Index each chunk with embedding
for (const [index, chunk] of chunks.entries()) {
  const embedding = await embeddingModel.embed(chunk.pageContent);

  await elasticService.indexChunk({
    documentId: document.id,
    chunkIndex: index,
    chunk_text: chunk.pageContent,
    chunk_start_page: estimatePageFromOffset(chunk.metadata.loc.lines.from),
    content_embedding: embedding // 768-dim vector
  });
}
```

**3. Embedding Model Selection**

| Model | Pros | Cons | Use Case |
|-------|------|---------|----------|
| **sentence-transformers/all-MiniLM-L6-v2** | Fast, 384-dim, good general-purpose | Lower accuracy | **Recommended for MVP** |
| **OpenAI text-embedding-3-small** | High accuracy, 1536-dim | Costs $0.02/1M tokens | Production with budget |
| **thenlper/gte-large** | SOTA open-source, 1024-dim | Slower inference | High-accuracy scenarios |
| **Custom fine-tuned model** | Domain-specific (D&D rules) | Requires training data | Future optimization |

**Recommendation**: Start with **all-MiniLM-L6-v2** (open-source, self-hosted, fast) → migrate to OpenAI embeddings if accuracy demands it.

**4. Hybrid Search Endpoint**

Create new route: `POST /api/search/semantic`
```typescript
// NEW: services/doc-api/src/routes/search.ts

fastify.post('/api/search/semantic', {
  schema: {
    body: z.object({
      query: z.string().min(3).max(500),
      hybrid: z.boolean().default(true),       // Combine vector + keyword
      alpha: z.number().min(0).max(1).default(0.7),  // 0.7 vector, 0.3 keyword
      filters: z.object({
        documentTypes: z.array(z.string()).optional(),
        campaigns: z.array(z.string()).optional(),
        minPageNumber: z.number().optional()
      }).optional()
    })
  }
}, async (request, reply) => {
  const { query, hybrid, alpha, filters } = request.body;

  // Generate query embedding
  const queryEmbedding = await embeddingService.embed(query);

  // Build ElasticSearch query
  const esQuery = {
    query: {
      script_score: {
        query: { match_all: {} },  // Or apply filters here
        script: {
          source: hybrid
            ? `
              // Hybrid score: alpha * vector + (1-alpha) * BM25
              ${alpha} * cosineSimilarity(params.query_vector, 'content_embedding') + 1.0 +
              (1.0 - ${alpha}) * _score
            `
            : `cosineSimilarity(params.query_vector, 'content_embedding') + 1.0`,
          params: { query_vector: queryEmbedding }
        }
      }
    },
    size: 20  // Top 20 chunks
  };

  const results = await elasticService.search(esQuery);

  // Group by documentId and deduplicate
  const groupedResults = groupByDocument(results);

  return { results: groupedResults, query, method: 'hybrid' };
});
```

**5. RAG Answer Generation**

Create new service: `rag.service.ts`
```typescript
import Anthropic from '@anthropic-ai/sdk';

export class RAGService {
  private anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  async answerQuestion(query: string, context: SearchResult[]) {
    // Build context from top chunks
    const contextText = context.map((result, i) => `
[Source ${i+1}: ${result.documentTitle}, p${result.pageNumber}]
${result.chunkText}
    `).join('\n\n');

    const prompt = `You are a D&D 5e rules expert assistant. Answer the following question based ONLY on the provided source material. Include citations in your answer.

Context:
${contextText}

Question: ${query}

Instructions:
- Provide a clear, concise answer
- Cite sources using [Source N] notation
- If the sources don't contain the answer, say "I don't have enough information in the provided sources."
- Focus on official rules interpretations`;

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      answer: response.content[0].text,
      sources: context.map(r => ({
        documentId: r.documentId,
        title: r.documentTitle,
        page: r.pageNumber,
        snippet: r.chunkText.slice(0, 150) + '...'
      }))
    };
  }
}
```

**6. API Endpoint for RAG Q&A**

```typescript
// NEW: /api/search/ask
fastify.post('/api/search/ask', async (request, reply) => {
  const { question, maxSources = 5, campaign } = request.body;

  // Step 1: Semantic search
  const searchResults = await semanticSearch(question, {
    size: maxSources,
    filters: { campaigns: campaign ? [campaign] : undefined }
  });

  // Step 2: Generate answer
  const { answer, sources } = await ragService.answerQuestion(
    question,
    searchResults
  );

  return { question, answer, sources, timestamp: new Date() };
});
```

### Expected Impact

- **DM Experience**: "How does grappling work underwater?" → Instant answer with citations instead of manual PDF searching
- **Search Quality**: 40-60% improvement in relevance for natural language queries
- **Cross-Document Intelligence**: Synthesize rules from PHB + DMG + Xanathar's automatically

---

## 3. Cross-Document Entity Linking

### Problem Statement

Currently, entities (spells, monsters, items) are **isolated within their source documents**. A monster's stat block that says "Casts *Fireball*" has no programmatic link to the Fireball spell entry.

### Proposed Entity Linking Architecture

#### Phase 1: Intra-Document Linking (Week 1-2)

**Goal**: Link entities within the same document

1. **Enhance Extraction Service** (`extraction.service.ts`)
   ```typescript
   // NEW: Extract entity references from descriptions
   function extractEntityReferences(text: string): EntityReference[] {
     const references: EntityReference[] = [];

     // Spell references (italic text or spell name patterns)
     const spellPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
     // Match against known spell names from database

     // Condition references
     const conditionPattern = /\b(grappled|restrained|prone|stunned|...)\b/gi;

     // Damage type references
     const damagePattern = /\b(fire|cold|lightning|necrotic|radiant|...)\s+damage\b/gi;

     return references;
   }
   ```

2. **Add EntityReference Model** (Prisma schema)
   ```prisma
   model EntityReference {
     id            String   @id @default(uuid())
     sourceId      String   // Monster/spell/item that references
     sourceType    String   // "monster", "spell", "item"
     targetName    String   // "Fireball", "grappled"
     targetType    String   // "spell", "condition", "damage_type"
     targetId      String?  // Resolved target entity ID (nullable)
     context       String   // Surrounding text for disambiguation
     confidence    Float    // 0.0-1.0 (ML confidence or rule-based score)
     documentId    String

     @@index([sourceId, sourceType])
     @@index([targetName, targetType])
   }
   ```

3. **Reference Resolution Worker**
   ```typescript
   // NEW: Resolve entity references after extraction
   async function resolveReferences(documentId: string) {
     const unresolved = await prisma.entityReference.findMany({
       where: { documentId, targetId: null }
     });

     for (const ref of unresolved) {
       // Fuzzy match against StructuredData
       const matches = await prisma.structuredData.findMany({
         where: {
           type: ref.targetType,
           name: { contains: ref.targetName, mode: 'insensitive' }
         }
       });

       if (matches.length === 1) {
         // Exact match - high confidence
         await prisma.entityReference.update({
           where: { id: ref.id },
           data: { targetId: matches[0].id, confidence: 0.95 }
         });
       } else if (matches.length > 1) {
         // Ambiguous - use Levenshtein distance or context
         const best = rankMatchesByContext(matches, ref.context);
         await prisma.entityReference.update({
           where: { id: ref.id },
           data: { targetId: best.id, confidence: best.score }
         });
       }
     }
   }
   ```

#### Phase 2: Cross-Document Linking (Month 2)

**Goal**: Link entities across different documents (e.g., PHB spell referenced in Monster Manual)

1. **Global Entity Index** (ElasticSearch)
   ```typescript
   // NEW index: entity-catalog
   const entityMapping = {
     properties: {
       name: { type: 'text', analyzer: 'english' },
       canonical_name: { type: 'keyword' },  // Normalized: "fireball"
       type: { type: 'keyword' },
       documentId: { type: 'keyword' },
       sourceBook: { type: 'keyword' },      // "PHB", "MM", "XGE"
       data: { type: 'object', enabled: false },  // Full entity data
       embedding: { type: 'dense_vector', dims: 384 }  // For fuzzy matching
     }
   };
   ```

2. **Cross-Document Resolution**
   ```typescript
   // When processing Monster Manual, resolve spell references against PHB
   async function crossDocumentResolve(reference: EntityReference) {
     const results = await elasticService.search('entity-catalog', {
       query: {
         bool: {
           must: [
             { match: { name: reference.targetName } },
             { term: { type: reference.targetType } }
           ],
           should: [
             { term: { sourceBook: 'PHB', boost: 2.0 } },  // Prefer official
             { term: { sourceBook: 'DMG', boost: 1.5 } }
           ]
         }
       }
     });

     return results.hits[0];  // Best match across all documents
   }
   ```

#### Phase 3: Knowledge Graph Visualization (Month 3-4)

**Goal**: Visualize entity relationships for DM prep

1. **GraphQL API for Entity Graph**
   ```graphql
   type Entity {
     id: ID!
     name: String!
     type: EntityType!
     document: Document!

     # Relationships
     references: [Entity!]!        # What this entity references
     referencedBy: [Entity!]!      # What references this entity
     relatedEntities: [Entity!]!   # Semantic similarity
   }

   query GetEntityGraph($id: ID!, $depth: Int = 2) {
     entity(id: $id) {
       ...entityDetails
       references {
         ...entityDetails
         references {  # Depth 2
           ...entityDetails
         }
       }
     }
   }
   ```

2. **Admin UI Graph View** (React Flow or Cytoscape.js)
   ```tsx
   // NEW: services/admin-ui/src/pages/EntityGraph.tsx
   import ReactFlow from 'reactflow';

   export function EntityGraphView({ entityId }: { entityId: string }) {
     const { data } = useQuery(['entity-graph', entityId], () =>
       api.get(`/api/entities/${entityId}/graph?depth=2`)
     );

     const nodes = data.entities.map(e => ({
       id: e.id,
       data: { label: e.name, type: e.type },
       position: { x: 0, y: 0 } // Layout algorithm
     }));

     const edges = data.references.map(r => ({
       source: r.from,
       target: r.to,
       label: r.context
     }));

     return <ReactFlow nodes={nodes} edges={edges} />;
   }
   ```

### Example Use Case

**Scenario**: DM is preparing "Adult Red Dragon" encounter

1. Opens dragon stat block in reader
2. Clicks "Show Related Entities" button
3. Graph displays:
   - **Direct References**:
     - Spells: *Fireball*, *Wall of Fire*, *Detect Magic*
     - Conditions: *frightened*, *prone*
     - Damage Types: fire immunity, bludgeoning resistance
   - **Referenced By**:
     - 12 other monsters that deal fire damage
     - 8 spells that counter dragons
     - 3 magic items (Dragon Slayer weapons)
4. Clicks on *Fireball* → navigates to spell entry in PHB
5. Right panel shows "5 monsters use this spell"

---

## 4. VTT Integration Hooks

### Current State

The WebSocket service supports real-time sync but has **zero VTT integration**. DMs must manually copy stat blocks into Foundry/Roll20.

### Proposed VTT Webhook Schema

#### Design Principles

1. **System-Agnostic**: JSON schema works with Foundry, Roll20, Owlbear Rodeo, etc.
2. **Bi-directional**: NexusCodex ↔ VTT (push entities, receive state updates)
3. **WebSocket-First**: Real-time sync for live sessions
4. **Fallback to HTTP**: REST endpoints for VTTs without WebSocket support

#### Standard Entity Export Schema

```typescript
// NEW: types/vtt-integration.ts

export interface VTTEntity {
  // Standard fields (system-agnostic)
  id: string;
  name: string;
  type: 'character' | 'npc' | 'monster' | 'spell' | 'item' | 'condition' | 'feature';
  sourceDocument: {
    id: string;
    title: string;
    page: number;
    campaign?: string;
  };

  // Core stats (normalized for common systems)
  stats?: {
    ac?: number;
    hp?: { current: number; max: number; formula: string };
    speed?: { walk?: number; fly?: number; swim?: number };
    abilities?: {
      str?: number; dex?: number; con?: number;
      int?: number; wis?: number; cha?: number;
    };
    savingThrows?: Record<string, number>;
    skills?: Record<string, number>;
  };

  // Actions/abilities
  actions?: Array<{
    name: string;
    type: 'action' | 'bonus_action' | 'reaction' | 'legendary' | 'lair';
    description: string;
    attackBonus?: number;
    damage?: { formula: string; type: string };
    saveDC?: { ability: string; dc: number };
  }>;

  // Spell-specific
  spell?: {
    level: number;
    school: string;
    castingTime: string;
    range: string;
    components: { verbal: boolean; somatic: boolean; material?: string };
    duration: string;
    concentration: boolean;
    ritual: boolean;
  };

  // Item-specific
  item?: {
    rarity: string;
    attunement: boolean;
    equipmentType: string;
    cost?: { amount: number; currency: string };
    weight?: number;
  };

  // System-specific data (pass-through for Foundry/Roll20)
  systemData?: Record<string, any>;  // Foundry's actor.system

  // Visual assets
  assets?: {
    token?: string;      // S3 URL to token image
    portrait?: string;   // S3 URL to character art
    thumbnail?: string;  // S3 URL to thumbnail
  };

  // Metadata
  tags?: string[];
  notes?: string;
  visibility: 'public' | 'dm_only' | 'player_visible';
}
```

#### WebSocket Events for VTT Push

**New Events** (add to `doc-websocket/src/types/events.ts`):

```typescript
// Outgoing (NexusCodex → VTT)
export enum VTTOutgoingEvent {
  ENTITY_PUSH = 'vtt:entity:push',          // Push entity to VTT scene
  COMPENDIUM_SYNC = 'vtt:compendium:sync',  // Sync full compendium
  STATE_QUERY = 'vtt:state:query',          // Request VTT state
}

// Incoming (VTT → NexusCodex)
export enum VTTIncomingEvent {
  REGISTER_VTT = 'vtt:register',            // VTT connects and registers
  ENTITY_REQUEST = 'vtt:entity:request',     // VTT requests specific entity
  STATE_UPDATE = 'vtt:state:update',        // VTT sends current scene/tokens
  IMPORT_COMPLETE = 'vtt:import:complete',  // VTT confirms entity import
}

// Schemas
export const VTTEntityPushSchema = z.object({
  sessionId: z.string().uuid(),
  entities: z.array(VTTEntitySchema),
  target: z.enum(['scene', 'compendium', 'journal']),  // Where to import
  automate: z.boolean().optional(),  // Auto-roll initiative, etc.
});

export const VTTRegisterSchema = z.object({
  vttSystem: z.enum(['foundry', 'roll20', 'owlbear', 'generic']),
  version: z.string(),
  capabilities: z.array(z.string()),  // ['websocket', 'compendium', 'tokens']
  webhookUrl: z.string().url().optional(),  // For HTTP fallback
});
```

#### Handler Implementation

```typescript
// NEW: doc-websocket/src/handlers/vtt.handler.ts

export async function handleVTTEntityPush(
  ws: WebSocket,
  data: z.infer<typeof VTTEntityPushSchema>
) {
  const { sessionId, entities, target, automate } = data;

  // Validate session and user permissions
  const session = await sessionService.getSession(sessionId);
  if (!session || session.presenter !== ws.userId) {
    throw new Error('Only session presenter can push to VTT');
  }

  // Convert NexusCodex structured data to VTT format
  const vttEntities = await Promise.all(
    entities.map(e => vttConversionService.toVTTFormat(e))
  );

  // Broadcast to all VTT clients in session
  const vttClients = getVTTClients(sessionId);
  for (const client of vttClients) {
    client.send(JSON.stringify({
      type: 'vtt:entity:push',
      data: {
        entities: vttEntities,
        target,
        automate,
        timestamp: Date.now()
      }
    }));
  }

  // Log push event
  await loggingService.logInfo(sessionId,
    `Pushed ${entities.length} entities to VTT (${target})`
  );

  return { success: true, count: entities.length };
}
```

#### REST Fallback Endpoints

For VTTs without WebSocket support:

```typescript
// NEW: doc-api/src/routes/vtt.ts

// Export entity to VTT-compatible JSON
fastify.get('/api/vtt/export/:entityId', async (request, reply) => {
  const { entityId } = request.params;
  const { format = 'foundry' } = request.query;

  const entity = await prisma.structuredData.findUnique({
    where: { id: entityId },
    include: { document: true }
  });

  if (!entity) {
    return reply.code(404).send({ error: 'Entity not found' });
  }

  // Convert to VTT format
  const vttData = await vttConversionService.toVTTFormat(entity, { format });

  // Return as downloadable JSON
  reply.header('Content-Disposition', `attachment; filename="${entity.name}.json"`);
  return vttData;
});

// Webhook receiver for VTT → NexusCodex sync
fastify.post('/api/vtt/webhook', async (request, reply) => {
  const { event, data, vttSystem } = request.body;

  switch (event) {
    case 'entity_created':
      // VTT created new entity, optionally sync back to NexusCodex
      await vttSyncService.handleEntityCreated(data);
      break;

    case 'initiative_rolled':
      // VTT started combat, sync initiative order to WebSocket viewers
      await sessionService.updateCombatState(data.sessionId, data.initiative);
      break;

    case 'hp_changed':
      // VTT updated entity HP, broadcast to spectators
      broadcastToSession(data.sessionId, {
        type: 'vtt:state:update',
        data: { entityId: data.entityId, hp: data.newHp }
      });
      break;
  }

  return { success: true };
});
```

#### Foundry VTT Module Example

```javascript
// foundry-nexuscodex-module/scripts/nexuscodex.js

class NexusCodexIntegration {
  static ws = null;

  static async connect(sessionId, token) {
    this.ws = new WebSocket(`wss://nexuscodex.example.com/ws?token=${token}`);

    this.ws.on('message', (msg) => {
      const { type, data } = JSON.parse(msg);

      if (type === 'vtt:entity:push') {
        this.handleEntityPush(data);
      }
    });

    // Register VTT
    this.ws.send(JSON.stringify({
      type: 'vtt:register',
      data: {
        vttSystem: 'foundry',
        version: game.version,
        capabilities: ['websocket', 'compendium', 'tokens', 'journal']
      }
    }));
  }

  static async handleEntityPush(data) {
    const { entities, target, automate } = data;

    for (const entity of entities) {
      if (entity.type === 'monster') {
        // Create Foundry actor
        const actor = await Actor.create({
          name: entity.name,
          type: 'npc',
          system: this.convertToFoundryData(entity)
        });

        if (target === 'scene' && game.scenes.active) {
          // Add token to active scene
          await Token.create({
            actorId: actor.id,
            x: 1000,
            y: 1000,
            img: entity.assets?.token || actor.img
          }, { parent: game.scenes.active });
        }

        if (automate) {
          // Auto-roll initiative
          await actor.rollInitiative();
        }
      }
    }

    ui.notifications.info(`Imported ${entities.length} entities from NexusCodex`);
  }

  static convertToFoundryData(entity) {
    // Map VTTEntity to Foundry's actor.system schema
    return {
      abilities: {
        str: { value: entity.stats.abilities.str },
        dex: { value: entity.stats.abilities.dex },
        // ... etc
      },
      attributes: {
        ac: { value: entity.stats.ac },
        hp: {
          value: entity.stats.hp.current,
          max: entity.stats.hp.max,
          formula: entity.stats.hp.formula
        }
      },
      // ... rest of Foundry schema
    };
  }
}

// Register hook
Hooks.on('ready', () => {
  console.log('NexusCodex integration ready');

  // Add button to actor sheet
  Hooks.on('renderActorSheet', (app, html) => {
    const btn = $('<button>Push to NexusCodex</button>');
    btn.on('click', () => {
      NexusCodexIntegration.pushEntity(app.actor);
    });
    html.find('.window-header').append(btn);
  });
});
```

### Example User Flow

1. **DM Prep (Before Session)**:
   - Opens "Curse of Strahd" campaign in NexusCodex
   - Searches for "Strahd von Zarovich" monster
   - Clicks "Export to Foundry" → downloads JSON
   - Imports into Foundry compendium

2. **Mid-Session (Real-time)**:
   - DM is in NexusCodex reader on page 47 (random encounter table)
   - Rolls "2 Dire Wolves" encounter
   - Clicks "Push to VTT" button on dire wolf stat block
   - WebSocket event fires → Foundry receives entity
   - Foundry auto-creates 2 dire wolf tokens on active scene
   - Players see tokens appear in real-time

3. **Post-Combat**:
   - Foundry sends HP changes back to NexusCodex via webhook
   - NexusCodex updates session state
   - DM's second screen (admin-ui) shows live combat tracker

---

## 5. OCR & Parsing Accuracy Improvements

### Current Problems

Based on `monster-parser.ts` and `spell-parser.ts` analysis:

1. **Regex patterns assume specific formatting** (e.g., "3rd-level evocation" on separate line)
2. **Multi-column stat blocks break** (pdf-parse reads left-to-right across columns)
3. **Tables are unstructured** (lose row/column relationships)
4. **OCR has no preprocessing** (no deskewing, denoising, contrast enhancement)
5. **50-page OCR limit** (PHB = 320 pages, would miss 84%)

### Recommended Improvements

#### Short-term (Month 1)

**1. Add PDF Layout Analysis** (replace simple pdf-parse)

```typescript
// NEW: Use pdfplumber or PyMuPDF for structure-aware extraction

import { PDFDocument } from 'pdf-lib';
import pdfPlumber from 'pdf-plumber';  // Python library, call via child_process

async function extractWithLayout(pdfBuffer: Buffer) {
  // Detect columns, tables, text blocks
  const layout = await pdfPlumber.extractLayout(pdfBuffer);

  return {
    text: layout.blocks.map(b => b.text).join('\n'),
    tables: layout.tables.map(t => ({
      page: t.page,
      data: t.rows,  // 2D array of cells
      bbox: t.boundingBox
    })),
    columns: layout.columns  // Preserve reading order
  };
}
```

**2. Improve OCR Preprocessing**

```typescript
// NEW: doc-processor/src/services/ocr-preprocess.service.ts

import sharp from 'sharp';

export async function preprocessForOCR(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize({ width: 2400 })           // Upscale for better OCR
    .grayscale()                       // Convert to grayscale
    .normalize()                       // Auto-contrast
    .sharpen()                         // Edge enhancement
    .threshold(128)                    // Binarize (black text on white)
    .toFormat('png')
    .toBuffer();
}
```

**3. Parallel OCR with Worker Pool**

```typescript
// NEW: Use worker_threads for parallel Tesseract

import { Worker } from 'worker_threads';

class OCRWorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ buffer: Buffer; resolve: Function }> = [];

  constructor(poolSize: number = 4) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker('./ocr-worker.js');
      worker.on('message', (result) => this.handleResult(result));
      this.workers.push(worker);
    }
  }

  async process(buffer: Buffer): Promise<string> {
    return new Promise((resolve) => {
      const freeWorker = this.workers.find(w => !w.busy);
      if (freeWorker) {
        freeWorker.busy = true;
        freeWorker.postMessage({ buffer });
        freeWorker.onceResolve = resolve;
      } else {
        this.queue.push({ buffer, resolve });
      }
    });
  }
}

// 4-worker pool can process 50 pages in ~2-3 minutes vs. 15 minutes sequential
```

#### Mid-term (Month 2-3)

**4. Vision-Language Model for Stat Blocks** (GPT-4V or Claude 3.5 Sonnet)

```typescript
// NEW: Use Claude 3.5 Sonnet to "read" stat blocks from images

import Anthropic from '@anthropic-ai/sdk';

async function extractStatBlockVision(pageImageBuffer: Buffer): Promise<MonsterData> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: pageImageBuffer.toString('base64')
          }
        },
        {
          type: 'text',
          text: `Extract the monster stat block from this D&D page. Return JSON with:
{
  "name": string,
  "size": "Tiny|Small|Medium|Large|Huge|Gargantuan",
  "type": string,
  "alignment": string,
  "ac": number,
  "hp": { "average": number, "formula": string },
  "speed": { "walk": number, "fly"?: number, ... },
  "abilities": { "str": number, "dex": number, ... },
  "senses": string[],
  "languages": string[],
  "cr": string,
  "actions": [{ "name": string, "description": string }]
}

If no stat block is visible, return null.`
        }
      ]
    }]
  });

  const jsonMatch = response.content[0].text.match(/\{[\s\S]+\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return null;
}
```

**Advantages**:
- Handles complex layouts (multi-column, tables, sidebars)
- No regex patterns needed
- Works with any game system (Pathfinder, Call of Cthulhu, etc.)
- Higher accuracy than Tesseract OCR

**Disadvantages**:
- API costs (~$0.003 per page for Claude 3.5 Sonnet)
- Slower than local OCR (0.5-2 seconds per page)
- Requires internet connection

**Recommendation**: Use vision models for **high-value documents** (official sourcebooks) and traditional OCR for homebrew/community content.

---

## 6. Prioritized Implementation Roadmap

### Q1 2025: Foundation & Performance (Weeks 1-12)

**Goal**: Make NexusCodex fast and reliable enough for mid-session use

| Week | Milestone | Effort | Impact |
|------|-----------|--------|--------|
| 1-2 | Performance Optimization | Medium | 🔥 High |
| | - Increase worker concurrency to 6 | 1 day | Immediate improvement |
| | - Implement Prisma batch inserts | 2 days | 5x faster structured data saves |
| | - Parallel OCR worker pool | 3 days | 4x faster OCR |
| | - Separate thumbnail queue | 2 days | Non-blocking processing |
| 3-4 | OCR Preprocessing | Medium | 🔥 High |
| | - Add sharp preprocessing pipeline | 2 days | 30-40% OCR accuracy improvement |
| | - Increase OCR page limit to 200 | 1 day | Full book coverage |
| | - Add OCR quality metrics | 2 days | Track accuracy |
| 5-8 | PDF Layout Analysis | High | 🔥 High |
| | - Integrate pdfplumber or PyMuPDF | 5 days | Handle multi-column layouts |
| | - Table extraction service | 4 days | Parse stat block tables |
| | - Update extraction parsers | 3 days | Use structured layout data |
| 9-12 | Code Quality & Testing | Medium | Medium |
| | - Add unit tests for extractors | 4 days | Prevent regressions |
| | - Refactor Zod schemas | 3 days | Better type safety |
| | - Performance benchmarking suite | 3 days | Track improvements |

**Deliverables**:
- ✅ 4x faster document processing (PHB in 5 minutes vs. 20 minutes)
- ✅ 40% better OCR accuracy
- ✅ Multi-column stat blocks parsed correctly
- ✅ 90% test coverage for extraction logic

---

### Q2 2025: Semantic Search & RAG (Weeks 13-24)

**Goal**: Transform search from keyword matching to intelligent Q&A

| Week | Milestone | Effort | Impact |
|------|-----------|--------|--------|
| 13-16 | Vector Search Infrastructure | High | 🔥 Critical |
| | - Add dense_vector to ElasticSearch mapping | 2 days | Enable semantic search |
| | - Implement document chunking service | 3 days | Optimal retrieval units |
| | - Deploy sentence-transformers model | 2 days | Generate embeddings |
| | - Batch reindex existing documents | 3 days | Backfill vectors |
| 17-20 | Hybrid Search Endpoints | High | 🔥 Critical |
| | - `/api/search/semantic` endpoint | 4 days | Vector + keyword hybrid |
| | - Reciprocal rank fusion | 2 days | Merge result sets |
| | - Faceted filtering with vectors | 3 days | Filters + semantic |
| | - Search analytics | 2 days | Track quality metrics |
| 21-24 | RAG Answer Generation | High | 🔥 Critical |
| | - `/api/search/ask` endpoint | 3 days | Natural language Q&A |
| | - RAG service with Claude/GPT-4 | 4 days | LLM integration |
| | - Citation extraction | 2 days | Link to source pages |
| | - Admin UI "Ask Codex" feature | 3 days | User interface |

**Deliverables**:
- ✅ "How does grappling work underwater?" → Instant answer with citations
- ✅ 60% improvement in search relevance
- ✅ Cross-document rule synthesis
- ✅ DM-facing "Ask the Codex" chatbot

---

### Q3 2025: Entity Linking & Knowledge Graph (Weeks 25-36)

**Goal**: Build cross-document entity relationships

| Week | Milestone | Effort | Impact |
|------|-----------|--------|--------|
| 25-28 | Intra-Document Linking | Medium | Medium |
| | - EntityReference model | 2 days | Track references |
| | - Entity extraction regex patterns | 4 days | Identify mentions |
| | - Resolution worker | 4 days | Link to targets |
| 29-32 | Cross-Document Linking | High | 🔥 High |
| | - Global entity index (ElasticSearch) | 3 days | Search across docs |
| | - Cross-doc resolution service | 5 days | Link across books |
| | - Ambiguity handling | 3 days | Disambiguate references |
| 33-36 | Knowledge Graph UI | High | Medium |
| | - GraphQL entity API | 4 days | Query relationships |
| | - React Flow graph visualization | 5 days | Interactive graph |
| | - "Related Entities" panel in reader | 3 days | In-context navigation |

**Deliverables**:
- ✅ Monster stat blocks auto-link to spells they cast
- ✅ "Show me all fire damage sources" query
- ✅ Visual entity graph for DM prep
- ✅ "Referenced by" panels in reader

---

### Q4 2025: VTT Integration (Weeks 37-48)

**Goal**: Seamless NexusCodex ↔ VTT bi-directional sync

| Week | Milestone | Effort | Impact |
|------|-----------|--------|--------|
| 37-40 | VTT Schema & Conversion | High | 🔥 Critical |
| | - VTTEntity schema design | 3 days | Standard format |
| | - Conversion service (Foundry/Roll20) | 6 days | Map formats |
| | - Export endpoints | 2 days | Download JSON |
| 41-44 | WebSocket VTT Events | High | 🔥 Critical |
| | - VTT event handlers | 4 days | Push/receive entities |
| | - Session-VTT binding | 3 days | Link sessions to VTT |
| | - Bi-directional sync | 5 days | State updates |
| 45-48 | Foundry VTT Module | High | 🔥 High |
| | - Foundry module scaffold | 3 days | Module structure |
| | - WebSocket client | 4 days | Real-time connection |
| | - Entity import logic | 5 days | Create actors/items |

**Deliverables**:
- ✅ "Push to VTT" button in reader
- ✅ Foundry VTT module for real-time sync
- ✅ Bi-directional HP/state updates
- ✅ One-click encounter import

---

### Future Enhancements (2026+)

**Advanced Features**:
- **Custom LLM fine-tuning** on D&D corpus for better extraction
- **Multi-game system support** (Pathfinder 2e, Call of Cthulhu)
- **AI encounter builder** (generate balanced encounters using RAG)
- **Voice-to-text rules lookup** ("Alexa, how does grappling work?")
- **Automated session notes** (LLM summarizes session from chat logs)
- **DM assistant chatbot** (proactive suggestions during session)

---

## 7. Code Refactoring Suggestions

### Immediate Refactoring (Week 1-2)

**1. Zod Schema Organization** (`services/doc-api/src/types/`)

**Current Problem**: Schemas scattered across route files, duplicated validation logic

**Recommendation**: Centralize all schemas
```typescript
// NEW: types/schemas/index.ts

export * from './document.schemas';
export * from './search.schemas';
export * from './structured-data.schemas';
export * from './vtt.schemas';

// types/schemas/search.schemas.ts
export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  type: z.string().optional(),
  campaigns: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  from: z.number().int().min(0).default(0),
  size: z.number().int().min(1).max(100).default(10)
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
```

**2. Service Layer Consolidation**

**Current Problem**: Database calls scattered in route handlers

**Recommendation**: Move all database logic to service layer
```typescript
// BEFORE (BAD): routes/documents.ts
fastify.get('/api/documents/:id', async (request, reply) => {
  const doc = await prisma.document.findUnique({ where: { id: request.params.id } });
  return doc;
});

// AFTER (GOOD): routes/documents.ts
fastify.get('/api/documents/:id', async (request, reply) => {
  return documentService.getById(request.params.id);
});

// services/document.service.ts
export class DocumentService {
  async getById(id: string, options?: GetDocumentOptions) {
    const doc = await prisma.document.findUnique({
      where: { id },
      include: options?.includeStructuredData ? { structuredData: true } : undefined
    });

    if (!doc) {
      throw new NotFoundError(`Document ${id} not found`);
    }

    return doc;
  }
}
```

**3. Error Handling Standardization**

**Current Problem**: Inconsistent error responses across routes

**Recommendation**: Custom error classes + global error handler
```typescript
// NEW: errors/index.ts
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string, public errors: any[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

// server.ts
fastify.setErrorHandler((error, request, reply) => {
  if (error.statusCode) {
    return reply.code(error.statusCode).send({
      error: error.name,
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {})
    });
  }

  // Unknown error
  console.error(error);
  return reply.code(500).send({ error: 'InternalServerError', message: 'An unexpected error occurred' });
});
```

---

## 8. Global Search UI - "Command Palette" Design

### Concept: Unified Search Interface

Inspired by VS Code's Command Palette (Cmd+K) and Notion's Quick Find (Cmd+P).

**Key Features**:
1. **Fuzzy search** across documents, structured data, and full-text content
2. **Type-ahead filtering** (e.g., `>spell fireball`, `@monster dragon`, `#tag undead`)
3. **Semantic understanding** ("rules for grappling" → shows PHB p195 + related spells/monsters)
4. **Keyboard navigation** (arrow keys, Enter to open)
5. **Context-aware results** (prioritize current campaign, recent documents)
6. **Quick actions** (push to VTT, add to bookmark, export)

### UI Mockup

```
┌────────────────────────────────────────────────────────────────┐
│  🔍 Search documents, spells, monsters, rules...    Cmd+K     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  💡 Try: "grappling rules", ">spell fire", "@monster CR 5"    │
│                                                                │
│  📖 Recent Documents                                           │
│  • Player's Handbook (PHB) - Last viewed 2m ago                │
│  • Curse of Strahd - Session 12 Notes                          │
│                                                                │
│  🎯 Quick Actions                                              │
│  • Import SRD Content                                          │
│  • Create New Campaign                                         │
│  • View Processing Queue                                       │
└────────────────────────────────────────────────────────────────┘

[User types: "grappling"]

┌────────────────────────────────────────────────────────────────┐
│  🔍 grappling                                          Cmd+K   │
├────────────────────────────────────────────────────────────────┤
│  📜 Rules & References (3)                                     │
│  ▸ PHB p195 - Grappling                                ⭐ 98%  │
│    "...you can use the Attack action to make a special..."     │
│    [View Page]  [Ask Codex]  [Push to VTT]                    │
│                                                                │
│  ▸ PHB p198 - Underwater Combat                        ⭐ 72%  │
│    "...creatures without swim speed have disadvantage..."      │
│                                                                │
│  🗡️ Spells (2)                                                 │
│  ▸ Maximilian's Earthen Grasp (3rd-level)              ⭐ 85%  │
│    "...make a Strength save or be restrained..."               │
│                                                                │
│  👹 Monsters (5)                                               │
│  ▸ Roper (CR 5) - Has "Grappling Tendrils" action      ⭐ 91%  │
│  ▸ Mimic (CR 2) - Can grapple with pseudopod           ⭐ 68%  │
│                                                                │
│  💬 Ask Codex                                                  │
│  "How does grappling work underwater?" → [Get Answer]          │
└────────────────────────────────────────────────────────────────┘
```

### Implementation

**Tech Stack**:
- **cmdk** (React component library for command palettes)
- **Fuse.js** or **FlexSearch** for client-side fuzzy search
- **TanStack Query** for server-side search caching
- **Framer Motion** for animations

**Component Structure**:
```tsx
// services/admin-ui/src/components/GlobalSearch.tsx

import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'search' | 'ask'>('search');

  // Detect command prefixes
  const prefix = search.match(/^([>@#])/)?.[1];
  const query = prefix ? search.slice(1) : search;

  // Semantic search
  const { data: results, isLoading } = useQuery({
    queryKey: ['global-search', query, prefix],
    queryFn: async () => {
      if (!query) return { documents: [], structured: [], content: [] };

      // Use semantic search if available
      return api.post('/api/search/semantic', {
        query,
        filters: {
          type: prefix === '>' ? 'spell' : prefix === '@' ? 'monster' : undefined
        }
      });
    },
    enabled: query.length >= 2
  });

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <Command.Dialog open={open} onOpenChange={onClose}>
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Search documents, spells, monsters, rules..."
      />

      <Command.List>
        {isLoading && <Command.Loading>Loading...</Command.Loading>}

        {/* Recent Documents */}
        <Command.Group heading="Recent Documents">
          {recentDocs.map(doc => (
            <Command.Item key={doc.id} onSelect={() => openDocument(doc.id)}>
              <FileIcon /> {doc.title}
            </Command.Item>
          ))}
        </Command.Group>

        {/* Search Results */}
        {results?.documents.length > 0 && (
          <Command.Group heading={`Documents (${results.documents.length})`}>
            {results.documents.map(doc => (
              <SearchResultItem
                key={doc.id}
                item={doc}
                type="document"
                onAction={(action) => handleAction(action, doc)}
              />
            ))}
          </Command.Group>
        )}

        {results?.structured.length > 0 && (
          <Command.Group heading={`Spells & Monsters (${results.structured.length})`}>
            {results.structured.map(entity => (
              <SearchResultItem
                key={entity.id}
                item={entity}
                type={entity.type}
                onAction={(action) => handleAction(action, entity)}
              />
            ))}
          </Command.Group>
        )}

        {/* Ask Codex */}
        {search.length >= 5 && (
          <Command.Group heading="Ask Codex">
            <Command.Item onSelect={() => setMode('ask')}>
              💬 "{search}" → Get AI Answer
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function SearchResultItem({ item, type, onAction }: SearchResultItemProps) {
  return (
    <Command.Item className="search-result">
      <div className="result-header">
        {getIcon(type)} {item.name || item.title}
        <span className="relevance-score">⭐ {Math.round(item.score * 100)}%</span>
      </div>
      <div className="result-snippet">{item.snippet}</div>
      <div className="result-actions">
        <button onClick={() => onAction('view')}>View Page</button>
        {type === 'monster' || type === 'spell' ? (
          <button onClick={() => onAction('push-vtt')}>Push to VTT</button>
        ) : null}
        <button onClick={() => onAction('bookmark')}>Bookmark</button>
      </div>
    </Command.Item>
  );
}
```

**Search Modes**:

| Prefix | Mode | Example | Filters |
|--------|------|---------|---------|
| (none) | All | `grappling` | Documents + Structured + Content |
| `>` | Spells | `>fireball` | type = 'spell' |
| `@` | Monsters | `@dragon CR 10` | type = 'monster', filters by CR |
| `#` | Tags | `#undead` | tags contains 'undead' |
| `!` | Campaign | `!Curse of Strahd` | campaign = 'Curse of Strahd' |
| `?` | Ask | `?grappling underwater` | Trigger RAG Q&A mode |

---

## Conclusion & Next Steps

NexusCodex has **excellent architectural foundations** but needs **semantic intelligence** to become a true "AI-powered codex" for TTRPG gameplay.

### Critical Path (Next 6 Months)

**Month 1-2**: Fix performance bottlenecks + improve OCR
**Month 3-4**: Implement vector search + RAG Q&A
**Month 5-6**: Build entity linking + VTT integration MVP

### Success Metrics

- **Performance**: PHB processing time < 5 minutes (currently ~20 min)
- **Search Quality**: 60%+ improvement in semantic relevance
- **DM Experience**: "Ask Codex" answers 80%+ of rules questions correctly
- **VTT Integration**: 1-click entity import to Foundry/Roll20

### Recommended Next Actions

1. **Start with performance optimization** (quick wins, high impact)
2. **Prototype RAG on 1 document** (validate approach before scaling)
3. **Build Command Palette UI** (improves UX immediately)
4. **Partner with VTT developers** (Foundry/Roll20 for schema feedback)

This roadmap transforms NexusCodex from a **document viewer** into an **intelligent gameplay assistant** that actively supports DMs during sessions. The key is **incremental delivery**—each phase delivers standalone value while building toward the ultimate vision.

---

**End of Architectural Review**
