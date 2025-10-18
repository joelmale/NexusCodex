import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),
  SESSION_TTL: z.string().default('86400').transform(Number), // 24 hours in seconds
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
