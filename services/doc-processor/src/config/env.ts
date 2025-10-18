import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // ElasticSearch
  ELASTICSEARCH_URL: z.string(),
  ELASTICSEARCH_INDEX: z.string().default('documents'),

  // S3/MinIO
  S3_ENDPOINT: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string().default('documents'),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform(val => val === 'true'),

  // Processing Configuration
  QUEUE_NAME: z.string().default('document-processing'),
  WORKER_CONCURRENCY: z.string().default('2').transform(Number),
  THUMBNAIL_WIDTH: z.string().default('300').transform(Number),
  THUMBNAIL_QUALITY: z.string().default('80').transform(Number),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
