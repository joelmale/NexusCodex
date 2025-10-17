import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { S3 } from 'aws-sdk';
import crypto from 'crypto';

interface CreateDocumentBody {
  title: string;
  description: string;
  type: DocumentType;
  format: DocumentFormat;
  fileSize: number;
  author: string;
  uploadedBy: string;
  tags: string[];
  collections: string[];
  campaigns: string[];
  isPublic: boolean;
  metadata: any;
}

const fastify = Fastify({
  logger: true,
});

const prisma = new PrismaClient();
const s3 = new S3({
  endpoint: process.env.S3_ENDPOINT,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

// Health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

fastify.post('/api/documents', async (request, reply) => {
  const { title, description, type, format, fileSize, author, uploadedBy, tags, collections, campaigns, isPublic, metadata } = request.body as CreateDocumentBody;

  const id = crypto.randomUUID();
  const storageKey = `${id}-${title}`;

  const params = {
    Bucket: 'documents',
    Key: storageKey,
    Expires: 60 * 5, // 5 minutes
    ContentType: 'application/pdf', // Or get from request
  };

  try {
    const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
    const document = await prisma.document.create({
      data: {
        id,
        title,
        description,
        type,
        format,
        storageKey,
        fileSize,
        pageCount: 0, // Will be updated by processor
        author,
        uploadedBy,
        tags,
        collections,
        campaigns,
        isPublic,
        metadata,
        ocrStatus: 'pending',
      },
    });
    reply.send({ uploadUrl, document });
  } catch (error) {
    fastify.log.error(error);
    reply.status(500).send({ error: 'Failed to generate upload URL' });
  }
});

fastify.get('/api/documents', async (request, reply) => {
  const documents = await prisma.document.findMany();
  reply.send(documents);
});

interface DocumentParams {
  id: string;
}

fastify.get('/api/documents/:id', async (request, reply) => {
  const { id } = request.params as DocumentParams;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return reply.status(404).send({ error: 'Document not found' });
  }
  reply.send(document);
});

fastify.delete('/api/documents/:id', async (request, reply) => {
  const { id } = request.params as DocumentParams;
  try {
    const document = await prisma.document.delete({ where: { id } });

    const params = {
      Bucket: 'documents',
      Key: document.storageKey,
    };
    await s3.deleteObject(params).promise();

    reply.status(204).send();
  } catch (error) {
    reply.status(404).send({ error: 'Document not found' });
  }
});

fastify.get('/api/documents/:id/content', async (request, reply) => {
  const { id } = request.params as DocumentParams;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return reply.status(404).send({ error: 'Document not found' });
  }

  const params = {
    Bucket: 'documents',
    Key: document.storageKey,
  };
  try {
    const document = await prisma.document.delete({ where: { id } });

    const params = {
      Bucket: 'documents',
      Key: document.storageKey,
    };
    await s3.deleteObject(params).promise();

    reply.status(204).send();
  } catch (error) {
    reply.status(404).send({ error: 'Document not found' });
  }
});

fastify.get('/api/documents/:id/content', async (request, reply) => {
  const { id } = request.params as DocumentParams;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return reply.status(404).send({ error: 'Document not found' });
  }

  const params = {
    Bucket: 'documents',
    Key: document.storageKey,
    Range: request.headers.range,
  };

  const stream = s3.getObject(params).createReadStream();
  reply.send(stream);
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
