import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env';

// Create Redis connection
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export interface ProcessDocumentJob {
  documentId: string;
}

// Create queue instance for adding jobs
export const documentQueue = new Queue<ProcessDocumentJob>(env.QUEUE_NAME, {
  connection,
});

// Add a document to the processing queue
export async function enqueueDocumentProcessing(documentId: string): Promise<string> {
  const job = await documentQueue.add('process-document', { documentId });
  return job.id || '';
}

// Get job status
export async function getJobStatus(jobId: string) {
  const job = await documentQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const failedReason = job.failedReason;

  return {
    id: job.id,
    state,
    progress,
    failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await documentQueue.close();
  connection.disconnect();
});
