import { createWorker } from './services/queue.service';
import { elasticService } from './services/elastic.service';
import { processDocumentWorker } from './workers/process-document.worker';

async function start() {
  console.log('Starting document processor worker...');

  try {
    // Initialize ElasticSearch index
    console.log('Initializing ElasticSearch index...');
    await elasticService.initializeIndex();

    // Create and start worker
    const worker = createWorker(processDocumentWorker);

    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    console.log('Document processor worker started successfully');
    console.log('Waiting for jobs...');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

start();
