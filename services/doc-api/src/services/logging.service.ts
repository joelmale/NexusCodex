import Redis from 'ioredis';
import { env } from '../config/env';

// Create Redis connection
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export interface ProcessingLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  step?: string;
  details?: any;
}

class LoggingService {
  private getLogKey(jobId: string): string {
    return `job:logs:${jobId}`;
  }

  /**
   * Get all logs for a job
   */
  async getLogs(jobId: string): Promise<ProcessingLog[]> {
    const key = this.getLogKey(jobId);
    const logs = await redis.lrange(key, 0, -1);

    return logs
      .map(log => {
        try {
          return JSON.parse(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // Return in chronological order
  }
}

export const loggingService = new LoggingService();