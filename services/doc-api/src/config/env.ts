import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // S3/MinIO
  S3_ENDPOINT: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string().default('documents'),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform(val => val === 'true'),

  // API Configuration
  UPLOAD_URL_EXPIRY: z.string().default('3600').transform(Number), // 1 hour
  DOWNLOAD_URL_EXPIRY: z.string().default('3600').transform(Number), // 1 hour
  MAX_FILE_SIZE: z.string().default('104857600').transform(Number), // 100MB
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
