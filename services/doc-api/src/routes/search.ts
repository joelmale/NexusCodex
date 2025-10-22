import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { elasticService } from '../services/elastic.service';
import { contentHashService } from '../services/content-hash.service';
import { SearchQuerySchema, QuickSearchQuerySchema, AdvancedSearchQuerySchema, SearchQuery, QuickSearchQuery, AdvancedSearchQuery } from '../types/search';

export async function searchRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/search - Full-text search across documents
   */
  fastify.get<{ Querystring: SearchQuery }>(
    '/api/search',
    async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
      try {
        const params = SearchQuerySchema.parse(request.query);

        const results = await elasticService.search({
          query: params.query,
          filters: {
            type: params.type,
            campaigns: params.campaigns,
            tags: params.tags,
          },
          from: params.from,
          size: params.size,
        });

        return reply.send({
          query: params.query,
          total: results.total,
          from: params.from,
          size: params.size,
          results: results.hits,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(400).send({
          error: 'Search failed',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/search/quick - Quick search for top results
   */
  fastify.get<{ Querystring: QuickSearchQuery }>(
    '/api/search/quick',
    async (request: FastifyRequest<{ Querystring: QuickSearchQuery }>, reply: FastifyReply) => {
      try {
        const params = QuickSearchQuerySchema.parse(request.query);

        const results = await elasticService.search({
          query: params.query,
          filters: params.campaign ? { campaigns: [params.campaign] } : undefined,
          from: 0,
          size: params.size,
        });

        // Format quick results with snippets
        const quickResults = results.hits.map((hit: any) => ({
          documentId: hit.documentId,
          title: hit.source.title,
          type: hit.source.type,
          score: hit.score,
          snippet: hit.highlights?.content?.[0] || hit.source.description || '',
        }));

        return reply.send({
          query: params.query,
          results: quickResults,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(400).send({
          error: 'Quick search failed',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/search/advanced - Advanced search with enhanced filters and sorting
   */
  fastify.get<{ Querystring: AdvancedSearchQuery }>(
    '/api/search/advanced',
    async (request: FastifyRequest<{ Querystring: AdvancedSearchQuery }>, reply: FastifyReply) => {
      try {
        const params = AdvancedSearchQuerySchema.parse(request.query);

        const results = await elasticService.advancedSearch({
          query: params.query,
          filters: {
            type: params.type,
            campaigns: params.campaigns,
            tags: params.tags,
            uploadedBy: params.uploadedBy,
            uploadedAfter: params.uploadedAfter,
            uploadedBefore: params.uploadedBefore,
          },
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          from: params.from,
          size: params.size,
        });

        return reply.send({
          query: params.query,
          total: results.total,
          from: params.from,
          size: params.size,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          results: results.hits,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(400).send({
          error: 'Advanced search failed',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/deduplication/duplicates - Find all duplicate documents
   */
  fastify.get('/api/deduplication/duplicates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const duplicates = await contentHashService.findAllDuplicates();

      return reply.send({
        duplicates,
        totalGroups: duplicates.length,
        totalDocuments: duplicates.reduce((sum, group) => sum + group.documents.length, 0),
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to find duplicates',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/deduplication/merge - Merge duplicate documents
   */
  fastify.post<{ Body: { primaryId: string; duplicateIds: string[] } }>(
    '/api/deduplication/merge',
    async (request: FastifyRequest<{ Body: { primaryId: string; duplicateIds: string[] } }>, reply: FastifyReply) => {
      try {
        const { primaryId, duplicateIds } = request.body;

        if (!primaryId || !duplicateIds || duplicateIds.length === 0) {
          return reply.status(400).send({
            error: 'Invalid request',
            details: 'primaryId and duplicateIds are required',
          });
        }

        await contentHashService.mergeDuplicates(primaryId, duplicateIds);

        return reply.send({
          message: 'Duplicates merged successfully',
          primaryId,
          mergedDuplicates: duplicateIds.length,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to merge duplicates',
          details: error.message,
        });
      }
    }
  );
}
