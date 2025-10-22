import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { documentRoutes } from './routes/documents';
import { processingRoutes } from './routes/processing';
import { searchRoutes } from './routes/search';
import { referenceRoutes } from './routes/references';
import { annotationRoutes } from './routes/annotations';
import { structuredDataRoutes } from './routes/structured-data';
import { adminDocumentRoutes } from './routes/admin/documents';
import { adminQueueRoutes } from './routes/admin/queue';
import { s3Service } from './services/s3.service';
import { prisma } from './services/database.service';

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
  },
});

// Register CORS
fastify.register(cors, {
  origin: true, // Allow all origins in development
  credentials: true,
});

// Health check endpoint
fastify.get('/', async () => {
  return {
    service: 'Nexus VTT Document API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
});

// Health check with database connection
fastify.get('/health', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(503).send({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// Register routes
fastify.register(documentRoutes);
fastify.register(processingRoutes);
fastify.register(searchRoutes);
fastify.register(referenceRoutes);
fastify.register(annotationRoutes);
fastify.register(structuredDataRoutes);
fastify.register(adminDocumentRoutes);
fastify.register(adminQueueRoutes);

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, closing server...`);
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

// Start server
const start = async () => {
  try {
    // Initialize S3 bucket
    fastify.log.info('Initializing S3 bucket...');
    await s3Service.initializeBucket();

    // Start server
    await fastify.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    fastify.log.info(`Server running on http://0.0.0.0:${env.PORT}`);
    fastify.log.info(`Environment: ${env.NODE_ENV}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
