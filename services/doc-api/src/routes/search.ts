import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { elasticService } from '../services/elastic.service';
import { SearchQuerySchema, QuickSearchQuerySchema, SearchQuery, QuickSearchQuery } from '../types/search';

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
}
