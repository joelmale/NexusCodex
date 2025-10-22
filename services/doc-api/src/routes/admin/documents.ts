import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../services/database.service';
import { s3Service } from '../../services/s3.service';
import { elasticService } from '../../services/elastic.service';
import { enqueueDocumentProcessing, getQueueStats } from '../../services/queue.service';
import {
  AdminListDocumentsQuerySchema,
  AdminUpdateDocumentSchema,
  AdminListDocumentsQuery,
  AdminUpdateDocumentInput,
  AdminStats,
} from '../../types/admin';

export async function adminDocumentRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/documents - List all documents with enhanced filters
   */
  fastify.get<{ Querystring: AdminListDocumentsQuery }>(
    '/api/admin/documents',
    async (request: FastifyRequest<{ Querystring: AdminListDocumentsQuery }>, reply: FastifyReply) => {
      try {
        const query = AdminListDocumentsQuerySchema.parse(request.query);

        const where: any = {};

        if (query.status) {
          switch (query.status) {
            case 'processing':
              where.ocrStatus = { in: ['pending', 'processing'] };
              break;
            case 'completed':
              where.ocrStatus = 'completed';
              where.searchIndex = { not: null };
              break;
            case 'failed':
              where.ocrStatus = 'failed';
              break;
            case 'indexed':
              where.ocrStatus = 'completed';
              break;
          }
        }

        if (query.type) {
          where.type = query.type;
        }

        if (query.uploadedBy) {
          where.uploadedBy = query.uploadedBy;
        }

        if (query.createdAfter) {
          where.uploadedAt = { gte: query.createdAfter };
        }

        if (query.createdBefore) {
          where.uploadedAt = { lte: query.createdBefore };
        }

        if (query.tags && query.tags.length > 0) {
          where.tags = { hasSome: query.tags };
        }

        const skip = (query.page - 1) * query.limit;
        const orderBy: any = {};
        orderBy[query.sortBy] = 'desc';

        const [documents, total] = await Promise.all([
          prisma.document.findMany({
            where,
            skip,
            take: query.limit,
            orderBy,
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              format: true,
              fileSize: true,
              uploadedAt: true,
              lastModified: true,
              uploadedBy: true,
              tags: true,
              campaigns: true,
              ocrStatus: true,
              searchIndex: true,
              thumbnailKey: true,
            },
          }),
          prisma.document.count({ where }),
        ]);

        // Map to admin-friendly format
        const documentsWithStatus = documents.map((doc) => {
          let status = 'processing';
          if (doc.ocrStatus === 'completed' && doc.searchIndex) {
            status = 'completed';
          } else if (doc.ocrStatus === 'failed') {
            status = 'failed';
          } else if (doc.ocrStatus === 'completed') {
            status = 'indexed';
          }

          return {
            ...doc,
            status,
            thumbnailKey: doc.thumbnailKey,
          };
        });

        return reply.send({
          documents: documentsWithStatus,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(400).send({
          error: 'Invalid request',
          details: error.message,
        });
      }
    }
  );

  /**
   * PATCH /api/admin/documents/:id - Bulk update metadata
   */
  fastify.patch<{ Params: { id: string }; Body: AdminUpdateDocumentInput }>(
    '/api/admin/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string }; Body: AdminUpdateDocumentInput }>, reply: FastifyReply) => {
      try {
        const documentId = request.params.id;
        const data = AdminUpdateDocumentSchema.parse(request.body);

        // Verify document exists
        const existingDocument = await prisma.document.findUnique({
          where: { id: documentId },
        });

        if (!existingDocument) {
          return reply.status(404).send({ error: 'Document not found' });
        }

        // Update document
        const updatedDocument = await prisma.document.update({
          where: { id: documentId },
          data,
        });

        return reply.send(updatedDocument);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(400).send({
          error: 'Invalid request',
          details: error.message,
        });
      }
    }
  );

  /**
   * DELETE /api/admin/documents/:id - Delete document + S3 file + ElasticSearch entry
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const documentId = request.params.id;

        // Get document
        const document = await prisma.document.findUnique({
          where: { id: documentId },
        });

        if (!document) {
          return reply.status(404).send({ error: 'Document not found' });
        }

        // Delete from ElasticSearch if indexed
        if (document.searchIndex) {
          try {
            await elasticService.deleteDocument(document.searchIndex);
          } catch (error) {
            fastify.log.warn(`Failed to delete from ElasticSearch: ${error}`);
          }
        }

        // Delete from S3
        try {
          await s3Service.deleteObject(document.storageKey);
          if (document.thumbnailKey) {
            await s3Service.deleteObject(document.thumbnailKey);
          }
        } catch (error) {
          fastify.log.warn(`Failed to delete from S3: ${error}`);
        }

        // Delete from database (cascade deletes references and annotations)
        await prisma.document.delete({
          where: { id: documentId },
        });

        return reply.send({ message: 'Document deleted successfully' });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to delete document',
          details: error.message,
        });
      }
    }
  );

  /**
   * POST /api/admin/documents/:id/reprocess - Retry failed processing
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/documents/:id/reprocess',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const documentId = request.params.id;

        // Verify document exists
        const document = await prisma.document.findUnique({
          where: { id: documentId },
        });

        if (!document) {
          return reply.status(404).send({ error: 'Document not found' });
        }

        // Enqueue processing job
        const jobId = await enqueueDocumentProcessing(documentId);

        // Reset status
        await prisma.document.update({
          where: { id: documentId },
          data: { ocrStatus: 'pending' },
        });

        return reply.status(202).send({
          message: 'Document reprocessing queued',
          documentId,
          jobId,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to reprocess document',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/admin/stats - Get admin statistics
   */
  fastify.get(
    '/api/admin/stats',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get document counts
        const [
          totalDocuments,
          processingCount,
          failedCount,
          documentsByType,
          recentUploads,
          totalStorageBytes,
        ] = await Promise.all([
          prisma.document.count(),
          prisma.document.count({
            where: { ocrStatus: { in: ['pending', 'processing'] } },
          }),
          prisma.document.count({
            where: { ocrStatus: 'failed' },
          }),
          prisma.document.groupBy({
            by: ['type'],
            _count: { type: true },
          }),
          prisma.document.findMany({
            take: 10,
            orderBy: { uploadedAt: 'desc' },
            select: {
              id: true,
              title: true,
              uploadedAt: true,
              ocrStatus: true,
            },
          }),
          prisma.document.aggregate({
            _sum: { fileSize: true },
          }),
        ]);

        // Get queue stats
        const processingQueue = await getQueueStats();

        const stats: AdminStats = {
          totalDocuments,
          processingCount,
          failedCount,
          totalStorageBytes: totalStorageBytes._sum.fileSize || 0,
          documentsByType: documentsByType.reduce((acc, item) => {
            acc[item.type] = item._count.type;
            return acc;
          }, {} as Record<string, number>),
          recentUploads: recentUploads.map((doc) => ({
            id: doc.id,
            title: doc.title,
            createdAt: doc.uploadedAt,
            status: doc.ocrStatus,
          })),
          processingQueue,
        };

        return reply.send(stats);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get stats',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/admin/validation/orphaned - Find documents with missing S3 files
   */
  fastify.get(
    '/api/admin/validation/orphaned',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const documents = await prisma.document.findMany({
          select: {
            id: true,
            title: true,
            storageKey: true,
            uploadedAt: true,
          },
        });

        const orphanedDocuments = [];

        for (const doc of documents) {
          try {
            // Check if file exists in S3
            await s3Service.headObject(doc.storageKey);
          } catch (error) {
            // File doesn't exist in S3
            orphanedDocuments.push({
              id: doc.id,
              title: doc.title,
              storageKey: doc.storageKey,
              uploadedAt: doc.uploadedAt,
              issue: 'S3 file missing',
            });
          }
        }

        return reply.send({
          orphanedDocuments,
          total: orphanedDocuments.length,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to check orphaned documents',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/admin/validation/metadata - Find documents with inconsistent metadata
   */
  fastify.get(
    '/api/admin/validation/metadata',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const documents = await prisma.document.findMany({
          select: {
            id: true,
            title: true,
            type: true,
            format: true,
            fileSize: true,
            uploadedAt: true,
            lastModified: true,
            ocrStatus: true,
            searchIndex: true,
            thumbnailKey: true,
            metadata: true,
          },
        });

        const inconsistentDocuments = [];

        for (const doc of documents) {
          const issues = [];

          // Check if completed documents have search index
          if (doc.ocrStatus === 'completed' && !doc.searchIndex) {
            issues.push('Completed document missing search index');
          }

          // Check if failed documents have error metadata
          if (doc.ocrStatus === 'failed' && (!doc.metadata || !doc.metadata.error)) {
            issues.push('Failed document missing error details');
          }

          // Check if processing documents are stuck (older than 1 hour)
          if (doc.ocrStatus === 'processing') {
            const processingTime = Date.now() - new Date(doc.uploadedAt).getTime();
            if (processingTime > 60 * 60 * 1000) { // 1 hour
              issues.push('Document stuck in processing for over 1 hour');
            }
          }

          // Check for invalid file sizes
          if (doc.fileSize <= 0) {
            issues.push('Invalid file size');
          }

          if (issues.length > 0) {
            inconsistentDocuments.push({
              id: doc.id,
              title: doc.title,
              issues,
            });
          }
        }

        return reply.send({
          inconsistentDocuments,
          total: inconsistentDocuments.length,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to check metadata consistency',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/admin/validation/elastic - Find documents with ElasticSearch inconsistencies
   */
  fastify.get(
    '/api/admin/validation/elastic',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const documents = await prisma.document.findMany({
          where: { searchIndex: { not: null } },
          select: {
            id: true,
            title: true,
            searchIndex: true,
            ocrStatus: true,
          },
        });

        const elasticIssues = [];

        for (const doc of documents) {
          try {
            // Try to get the document from ElasticSearch
            // Note: This is a simplified check - in practice you'd want to query ES
            if (doc.searchIndex) {
              // For now, just check if the searchIndex looks valid
              if (!doc.searchIndex.match(/^[a-f0-9]{8,}$/i)) {
                elasticIssues.push({
                  id: doc.id,
                  title: doc.title,
                  issue: 'Invalid search index format',
                  searchIndex: doc.searchIndex,
                });
              }
            }
          } catch (error) {
            elasticIssues.push({
              id: doc.id,
              title: doc.title,
              issue: 'Failed to validate ElasticSearch entry',
              error: error.message,
            });
          }
        }

        return reply.send({
          elasticIssues,
          total: elasticIssues.length,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to check ElasticSearch consistency',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/admin/validation/comprehensive - Run all validation checks
   */
  fastify.get(
    '/api/admin/validation/comprehensive',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Run all validation checks in parallel
        const [orphaned, metadata, elastic] = await Promise.all([
          fastify.inject({ method: 'GET', url: '/api/admin/validation/orphaned' }),
          fastify.inject({ method: 'GET', url: '/api/admin/validation/metadata' }),
          fastify.inject({ method: 'GET', url: '/api/admin/validation/elastic' }),
        ]);

        const orphanedData = JSON.parse(orphaned.body);
        const metadataData = JSON.parse(metadata.body);
        const elasticData = JSON.parse(elastic.body);

        return reply.send({
          orphanedFiles: orphanedData,
          metadataInconsistencies: metadataData,
          elasticIssues: elasticData,
          summary: {
            totalOrphaned: orphanedData.total,
            totalMetadataIssues: metadataData.total,
            totalElasticIssues: elasticData.total,
            totalIssues: orphanedData.total + metadataData.total + elasticData.total,
          },
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Failed to run comprehensive validation',
          details: error.message,
        });
      }
    }
  );
}