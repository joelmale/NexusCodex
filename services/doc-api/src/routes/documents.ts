import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { prisma } from '../services/database.service';
import { s3Service } from '../services/s3.service';
import {
  CreateDocumentSchema,
  UpdateDocumentSchema,
  ListDocumentsQuerySchema,
  CreateDocumentInput,
  UpdateDocumentInput,
  ListDocumentsQuery,
} from '../types/document';

export async function documentRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/documents - Create document and get signed upload URL
   */
  fastify.post<{ Body: CreateDocumentInput }>(
    '/api/documents',
    async (request: FastifyRequest<{ Body: CreateDocumentInput }>, reply: FastifyReply) => {
      try {
        const data = CreateDocumentSchema.parse(request.body);

        // Generate unique storage key
        const fileExtension = data.fileName.split('.').pop() || data.format;
        const storageKey = `documents/${randomUUID()}.${fileExtension}`;

        // Create database record
        const document = await prisma.document.create({
          data: {
            title: data.title,
            description: data.description,
            type: data.type,
            format: data.format,
            storageKey,
            fileSize: data.fileSize,
            author: data.author,
            uploadedBy: data.uploadedBy,
            tags: data.tags,
            collections: data.collections,
            campaigns: data.campaigns,
            isPublic: data.isPublic,
            metadata: data.metadata,
          },
        });

        // Generate signed upload URL
        const contentType = getContentType(data.format);
        const uploadUrl = await s3Service.getUploadUrl(storageKey, contentType);

        return reply.status(201).send({
          document,
          uploadUrl,
          expiresIn: 3600,
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
   * GET /api/documents - List documents with filtering
   */
  fastify.get<{ Querystring: ListDocumentsQuery }>(
    '/api/documents',
    async (request: FastifyRequest<{ Querystring: ListDocumentsQuery }>, reply: FastifyReply) => {
      try {
        const query = ListDocumentsQuerySchema.parse(request.query);

        const where: any = {};

        if (query.type) {
          where.type = query.type;
        }

        if (query.campaign) {
          where.campaigns = {
            has: query.campaign,
          };
        }

        if (query.tag) {
          where.tags = {
            has: query.tag,
          };
        }

        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [documents, total] = await Promise.all([
          prisma.document.findMany({
            where,
            skip: query.skip,
            take: query.limit,
            orderBy: { uploadedAt: 'desc' },
          }),
          prisma.document.count({ where }),
        ]);

        return reply.send({
          documents,
          pagination: {
            total,
            skip: query.skip,
            limit: query.limit,
          },
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(400).send({
          error: 'Invalid query parameters',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/documents/:id - Get document metadata
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const document = await prisma.document.findUnique({
          where: { id: request.params.id },
        });

        if (!document) {
          return reply.status(404).send({ error: 'Document not found' });
        }

        return reply.send(document);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * GET /api/documents/:id/content - Stream document content with Range support
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/documents/:id/content',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const document = await prisma.document.findUnique({
          where: { id: request.params.id },
        });

        if (!document) {
          return reply.status(404).send({ error: 'Document not found' });
        }

        const range = request.headers.range;

        // Get object from S3 with optional Range header
        const s3Object = await s3Service.getObject(document.storageKey, range);

        // Set content type
        const contentType = getContentType(document.format);
        reply.header('Content-Type', contentType);
        reply.header('Accept-Ranges', 'bytes');

        // Handle Range requests
        if (range && s3Object.ContentRange) {
          reply.status(206);
          reply.header('Content-Range', s3Object.ContentRange);
          reply.header('Content-Length', s3Object.ContentLength?.toString() || '0');
        } else {
          reply.header('Content-Length', document.fileSize.toString());
        }

        // Stream the response
        if (s3Object.Body) {
          return reply.send(s3Object.Body as Readable);
        }

        return reply.status(500).send({ error: 'Failed to retrieve document content' });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * PUT /api/documents/:id - Update document metadata
   */
  fastify.put<{ Params: { id: string }; Body: UpdateDocumentInput }>(
    '/api/documents/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateDocumentInput }>,
      reply: FastifyReply
    ) => {
      try {
        const data = UpdateDocumentSchema.parse(request.body);

        const document = await prisma.document.update({
          where: { id: request.params.id },
          data,
        });

        return reply.send(document);
      } catch (error: any) {
        fastify.log.error(error);

        if (error.code === 'P2025') {
          return reply.status(404).send({ error: 'Document not found' });
        }

        return reply.status(400).send({
          error: 'Invalid request',
          details: error.message,
        });
      }
    }
  );

  /**
   * DELETE /api/documents/:id - Delete document
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const document = await prisma.document.findUnique({
          where: { id: request.params.id },
        });

        if (!document) {
          return reply.status(404).send({ error: 'Document not found' });
        }

        // Delete from S3
        await s3Service.deleteObject(document.storageKey);

        // Delete thumbnail if exists
        if (document.thumbnailKey) {
          await s3Service.deleteObject(document.thumbnailKey);
        }

        // Delete from database
        await prisma.document.delete({
          where: { id: request.params.id },
        });

        return reply.status(204).send();
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}

/**
 * Helper function to get content type from document format
 */
function getContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    markdown: 'text/markdown',
    html: 'text/html',
  };

  return contentTypes[format] || 'application/octet-stream';
}
