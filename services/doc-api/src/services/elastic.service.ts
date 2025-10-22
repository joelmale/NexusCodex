import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';

class ElasticSearchService {
  private client: Client;
  private index: string;

  constructor() {
    this.client = new Client({
      node: env.ELASTICSEARCH_URL,
    });
    this.index = env.ELASTICSEARCH_INDEX;
  }

  /**
   * Delete a document from the index
   */
  async deleteDocument(documentId: string) {
    try {
      await this.client.delete({
        index: this.index,
        id: documentId,
      });
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Document not found in index, ignore
        return;
      }
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Advanced search with enhanced filtering and sorting
   */
  async advancedSearch(params: {
    query: string;
    filters?: {
      type?: string;
      campaigns?: string[];
      tags?: string[];
      uploadedBy?: string;
      uploadedAfter?: Date;
      uploadedBefore?: Date;
    };
    sortBy?: 'relevance' | 'uploadedAt' | 'title' | 'fileSize';
    sortOrder?: 'asc' | 'desc';
    from?: number;
    size?: number;
  }) {
    const must: any[] = [];

    // Add text search query
    if (params.query) {
      must.push({
        multi_match: {
          query: params.query,
          fields: ['title^3', 'description^2', 'content'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Add filters
    const filter: any[] = [];

    if (params.filters?.type) {
      filter.push({ term: { type: params.filters.type } });
    }

    if (params.filters?.campaigns && params.filters.campaigns.length > 0) {
      filter.push({ terms: { campaigns: params.filters.campaigns } });
    }

    if (params.filters?.tags && params.filters.tags.length > 0) {
      filter.push({ terms: { tags: params.filters.tags } });
    }

    if (params.filters?.uploadedBy) {
      filter.push({ term: { uploadedBy: params.filters.uploadedBy } });
    }

    if (params.filters?.uploadedAfter || params.filters?.uploadedBefore) {
      const range: any = {};
      if (params.filters.uploadedAfter) {
        range.gte = params.filters.uploadedAfter.toISOString();
      }
      if (params.filters.uploadedBefore) {
        range.lte = params.filters.uploadedBefore.toISOString();
      }
      filter.push({ range: { uploadedAt: range } });
    }

    // Build sort configuration
    let sort: any[] = [];
    if (params.sortBy === 'relevance') {
      sort = [
        { _score: { order: params.sortOrder || 'desc' } },
        { uploadedAt: { order: 'desc' } },
      ];
    } else {
      const sortField = params.sortBy === 'uploadedAt' ? 'uploadedAt' :
                       params.sortBy === 'title' ? 'title' :
                       params.sortBy === 'fileSize' ? 'fileSize' : 'uploadedAt';
      sort = [{ [sortField]: { order: params.sortOrder || 'desc' } }];
    }

    try {
      const response = await this.client.search({
        index: this.index,
        from: params.from || 0,
        size: params.size || 20,
        body: {
          query: {
            bool: {
              must: must.length > 0 ? must : [{ match_all: {} }],
              filter: filter.length > 0 ? filter : undefined,
            },
          },
          highlight: {
            fields: {
              title: {},
              description: {},
              content: {
                fragment_size: 150,
                number_of_fragments: 3,
              },
            },
          },
          sort,
        },
      });

      return {
        total: typeof response.hits.total === 'object' ? response.hits.total.value : response.hits.total,
        hits: response.hits.hits.map((hit: any) => ({
          documentId: hit._id,
          score: hit._score,
          source: hit._source,
          highlights: hit.highlight,
        })),
      };
    } catch (error: any) {
      throw new Error(`Advanced search failed: ${error.message}`);
    }
  }

  /**
   * Search documents (legacy method)
   */
  async search(params: {
    query: string;
    filters?: {
      type?: string;
      campaigns?: string[];
      tags?: string[];
    };
    from?: number;
    size?: number;
  }) {
    const must: any[] = [];

    // Add text search query
    if (params.query) {
      must.push({
        multi_match: {
          query: params.query,
          fields: ['title^3', 'description^2', 'content'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Add filters
    const filter: any[] = [];

    if (params.filters?.type) {
      filter.push({ term: { type: params.filters.type } });
    }

    if (params.filters?.campaigns && params.filters.campaigns.length > 0) {
      filter.push({ terms: { campaigns: params.filters.campaigns } });
    }

    if (params.filters?.tags && params.filters.tags.length > 0) {
      filter.push({ terms: { tags: params.filters.tags } });
    }

    try {
      const response = await this.client.search({
        index: this.index,
        from: params.from || 0,
        size: params.size || 20,
        body: {
          query: {
            bool: {
              must: must.length > 0 ? must : [{ match_all: {} }],
              filter: filter.length > 0 ? filter : undefined,
            },
          },
          highlight: {
            fields: {
              title: {},
              description: {},
              content: {
                fragment_size: 150,
                number_of_fragments: 3,
              },
            },
          },
          sort: [
            { _score: { order: 'desc' as const } },
            { uploadedAt: { order: 'desc' as const } },
          ],
        },
      });

      return {
        total: typeof response.hits.total === 'object' ? response.hits.total.value : response.hits.total,
        hits: response.hits.hits.map((hit: any) => ({
          documentId: hit._id,
          score: hit._score,
          source: hit._source,
          highlights: hit.highlight,
        })),
      };
    } catch (error: any) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }
}

export const elasticService = new ElasticSearchService();
