import { Job } from 'bullmq';
import { ProcessDocumentJob } from '../services/queue.service';
import { prisma } from '../services/database.service';
import { s3Service } from '../services/s3.service';
import { pdfService } from '../services/pdf.service';
import { thumbnailService } from '../services/thumbnail.service';
import { pageImageService } from '../services/page-image.service';
import { elasticService } from '../services/elastic.service';
import { ocrService } from '../services/ocr.service';
import { markdownService } from '../services/markdown.service';
import { extractionService } from '../services/extraction.service';
import { contentHashService } from '../services/content-hash.service';
import { loggingService } from '../services/logging.service';
import { env } from '../config/env';
import { canvasBackend } from '../utils/canvas';

const MAX_TEXT_SAMPLE_LENGTH = 500;

export async function processDocumentWorker(job: Job<ProcessDocumentJob>): Promise<void> {
  const { documentId } = job.data;
  const jobId = job.id || 'unknown';

  console.log(`[Worker] Processing document: ${documentId}`);
  await loggingService.logInfo(jobId, `Started processing document: ${documentId}`);

  try {
    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { ocrStatus: 'processing' },
    });
    await loggingService.logInfo(jobId, 'Updated document status to processing');

    // Fetch document metadata from database
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    console.log(`[Worker] Downloading document from S3: ${document.storageKey}`);
    await loggingService.logInfo(jobId, `Downloading document from S3: ${document.storageKey}`);

    // Download file from S3
    const fileBuffer = await s3Service.downloadFile(document.storageKey);
    await loggingService.logInfo(jobId, `Downloaded file, size: ${fileBuffer.length} bytes`);

    // Calculate content hash for deduplication
    console.log(`[Worker] Calculating content hash`);
    await loggingService.logInfo(jobId, 'Calculating content hash');
    const contentHash = contentHashService.calculateHash(fileBuffer);
    await contentHashService.storeHash(documentId, contentHash);
    await loggingService.logInfo(jobId, `Content hash calculated: ${contentHash}`);

    // Check for duplicates
    console.log(`[Worker] Checking for duplicate content`);
    await loggingService.logInfo(jobId, 'Checking for duplicate content');
    const duplicateId = await contentHashService.findDuplicate(contentHash, documentId);

    if (duplicateId) {
      console.log(`[Worker] Found duplicate document: ${duplicateId}`);
      await loggingService.logWarn(jobId, `Found duplicate document: ${duplicateId}`);

      // Mark this document as a duplicate
      await prisma.document.update({
        where: { id: documentId },
        data: {
          ocrStatus: 'completed', // Mark as completed since no processing needed
          metadata: {
            duplicateOf: duplicateId,
            detectedAt: new Date().toISOString(),
          },
        },
      });

      await loggingService.logInfo(jobId, `Document marked as duplicate of ${duplicateId}`);
      return; // Skip further processing
    }

    let text = '';
    let pageCount = 0;
    let thumbnailKey: string | undefined;
    let needsOCR = false;
    const pageImageKeys: string[] = [];
    let pageImagesTotalBytes = 0;
    let ocrText = '';
    let ocrStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'not_required' = 'not_required';

    // Process based on document format
    if (document.format === 'pdf') {
      // Extract text content and page count
      console.log(`[Worker] Extracting text from PDF`);
      await loggingService.logInfo(jobId, 'Extracting text from PDF');
      const extracted = await pdfService.extractText(fileBuffer);
      text = extracted.text;
      pageCount = extracted.pageCount;
      await loggingService.logInfo(jobId, `Extracted text: ${text.length} characters, ${pageCount} pages`);

      // Check if OCR is needed (image-based PDF)
      needsOCR = ocrService.isImageBasedPage(text);
      if (needsOCR) {
        console.log(`[Worker] PDF appears to be image-based, OCR will be performed`);
        await loggingService.logWarn(jobId, 'PDF appears to be image-based, OCR will be performed');
        ocrStatus = 'processing';
      }

      // Generate thumbnail
      console.log(`[Worker] Generating thumbnail`);
      await loggingService.logInfo(jobId, 'Generating thumbnail', undefined, { canvasBackend });
      try {
        const thumbnailBuffer = await thumbnailService.generateThumbnail(fileBuffer);

        // Upload thumbnail to S3
        thumbnailKey = `thumbnails/${documentId}.jpg`;
        console.log(`[Worker] Uploading thumbnail to S3: ${thumbnailKey}`);
        await loggingService.logInfo(jobId, `Uploading thumbnail to S3: ${thumbnailKey}`);
        await s3Service.uploadFile(thumbnailKey, thumbnailBuffer, 'image/jpeg');
        await loggingService.logInfo(jobId, 'Thumbnail uploaded successfully');
      } catch (thumbError: any) {
        thumbnailKey = undefined;
        console.warn(`[Worker] Thumbnail generation failed, continuing without thumbnail: ${thumbError.message}`);
        await loggingService.logWarn(jobId, `Thumbnail generation failed, continuing: ${thumbError.message}`, 'thumbnail', {
          error: thumbError?.stack || String(thumbError),
          canvasBackend,
        });
      }

      // Generate per-page WebP images for reader (and OCR buffers if needed)
      console.log(`[Worker] Rendering page images`);
      await loggingService.logInfo(jobId, 'Rendering page images', undefined, { canvasBackend });
      try {
        const pageImages = await pageImageService.renderPageImages(fileBuffer, {
          includeOcrBuffer: needsOCR,
          onProgress: ({ pageNumber, maxPages }) => {
            if (pageNumber % 10 === 0 || pageNumber === maxPages) {
              loggingService.logInfo(jobId, `Rendered ${pageNumber}/${maxPages} pages`, 'page_images').catch(() => {});
            }
          },
        });
        for (const image of pageImages) {
          const pageKey = `page-images/${documentId}/page-${image.pageNumber}.webp`;
          pageImagesTotalBytes += image.buffer.length;
          await s3Service.uploadFile(pageKey, image.buffer, 'image/webp');
          pageImageKeys.push(pageKey);
        }
        await loggingService.logInfo(jobId, `Uploaded ${pageImageKeys.length} page images`);

        if (needsOCR) {
          const ocrBuffers = pageImages
            .map((image) => image.ocrBuffer)
            .filter((buffer): buffer is Buffer => !!buffer)
            .slice(0, env.OCR_MAX_PAGES);

          if (ocrBuffers.length > 0) {
            await loggingService.logInfo(jobId, `Running OCR on ${ocrBuffers.length} pages`);
            try {
              const ocrResults = await ocrService.extractTextFromImages(ocrBuffers);
              ocrText = ocrResults.join('\n');
              text = ocrText;
              ocrStatus = 'completed';
              await loggingService.logInfo(jobId, `OCR completed, extracted ${ocrText.length} characters`);
            } catch (ocrError: any) {
              ocrStatus = 'failed';
              await loggingService.logError(jobId, `OCR failed: ${ocrError.message}`);
            }
          } else {
            ocrStatus = 'failed';
            await loggingService.logWarn(jobId, 'OCR skipped: no buffers available');
          }
        }
      } catch (pageError: any) {
        console.warn(`[Worker] Page image rendering failed, continuing without page images: ${pageError.message}`);
        await loggingService.logWarn(jobId, `Page image rendering failed, continuing: ${pageError.message}`, 'page_images', {
          error: pageError?.stack || String(pageError),
          canvasBackend,
        });
      }

    } else if (document.format === 'markdown') {
      // Extract text from Markdown
      console.log(`[Worker] Extracting text from Markdown`);
      await loggingService.logInfo(jobId, 'Extracting text from Markdown');
      const markdownContent = fileBuffer.toString('utf-8');
      text = await markdownService.extractText(markdownContent);

      // Markdown doesn't have pages, but we can count sections/headings
      const headings = await markdownService.extractHeadings(markdownContent);
      pageCount = Math.max(1, headings.length);
      await loggingService.logInfo(jobId, `Extracted text: ${text.length} characters, ${pageCount} sections`);
    }

    // Index content in ElasticSearch
    console.log(`[Worker] Indexing document in ElasticSearch`);
    await loggingService.logInfo(jobId, 'Indexing document in ElasticSearch');
    const indexStart = Date.now();
    const searchIndex = await elasticService.indexDocument({
      documentId: document.id,
      title: document.title,
      description: document.description,
      content: text,
      tags: document.tags,
      type: document.type,
      campaigns: document.campaigns,
      collections: document.collections,
      uploadedAt: document.uploadedAt,
    });
    const indexDurationMs = Date.now() - indexStart;
    await loggingService.logInfo(jobId, `Document indexed with ID: ${searchIndex} in ${indexDurationMs}ms`);

    // Extract structured data (spells, monsters, items)
    console.log(`[Worker] Extracting structured data`);
    await loggingService.logInfo(jobId, 'Extracting structured data');
    const extracted = extractionService.extractAll(text);
    await loggingService.logInfo(jobId, `Extracted ${extracted.spells.length} spells, ${extracted.monsters.length} monsters, ${extracted.items.length} items`);

    // Store structured data in database
    const structuredDataPromises: Promise<any>[] = [];

    // Store spells
    for (const spell of extracted.spells) {
      structuredDataPromises.push(
        prisma.structuredData.create({
          data: {
            documentId: document.id,
            type: 'spell',
            name: spell.name,
            data: spell as any,
            searchText: `${spell.name} ${spell.level} ${spell.school} ${spell.description || ''}`.toLowerCase(),
          },
        })
      );
    }

    // Store monsters
    for (const monster of extracted.monsters) {
      structuredDataPromises.push(
        prisma.structuredData.create({
          data: {
            documentId: document.id,
            type: 'monster',
            name: monster.name,
            data: monster as any,
            searchText: `${monster.name} ${monster.type || ''} ${monster.size || ''}`.toLowerCase(),
          },
        })
      );
    }

    // Store items
    for (const item of extracted.items) {
      structuredDataPromises.push(
        prisma.structuredData.create({
          data: {
            documentId: document.id,
            type: 'item',
            name: item.name,
            data: item as any,
            searchText: `${item.name} ${item.type || ''} ${item.rarity || ''}`.toLowerCase(),
          },
        })
      );
    }

    if (structuredDataPromises.length > 0) {
      console.log(`[Worker] Saving ${structuredDataPromises.length} structured data entries`);
      await loggingService.logInfo(jobId, `Saving ${structuredDataPromises.length} structured data entries`);
      await Promise.all(structuredDataPromises);
      await loggingService.logInfo(jobId, 'Structured data saved successfully');
    }

    const textLength = text.length;
    const textSample = text.trim().slice(0, MAX_TEXT_SAMPLE_LENGTH);
    const textCharsPerPage = pageCount > 0 ? Math.round(textLength / pageCount) : 0;

    const processingMetadata = {
      format: document.format,
      textLength,
      textSample: textSample || undefined,
      textCharsPerPage,
      ocr: {
        detected: needsOCR,
        performed: needsOCR && ocrStatus === 'completed',
        status: ocrStatus,
        reason: needsOCR ? 'Image-based PDF detected' : 'Text-based document',
      },
      extraction: {
        spells: extracted.spells.length,
        monsters: extracted.monsters.length,
        items: extracted.items.length,
      },
      search: {
        indexed: !!searchIndex,
        indexId: searchIndex,
        indexedAt: new Date().toISOString(),
        indexDurationMs,
      },
      pageImages: {
        count: pageImageKeys.length,
        totalBytes: pageImagesTotalBytes,
      },
    };

    // Update document record with processing results
    console.log(`[Worker] Updating document record`);
    await loggingService.logInfo(jobId, 'Updating document record with processing results');
    await prisma.document.update({
      where: { id: documentId },
      data: {
        pageCount,
        thumbnailKey,
        searchIndex,
        ocrStatus: needsOCR ? ocrStatus : 'completed',
        metadata: {
          ...(document.metadata as any),
          pageImages: pageImageKeys,
          processing: processingMetadata,
        },
      },
    });

    const textSource = document.format === 'markdown' ? 'markdown' : (needsOCR ? 'ocr' : 'pdf_extraction');
    const contentToStore = text || '';
    if (contentToStore.trim().length > 0) {
      await prisma.documentText.upsert({
        where: {
          documentId_source: {
            documentId,
            source: textSource,
          },
        },
        update: { content: contentToStore },
        create: {
          documentId,
          source: textSource,
          content: contentToStore,
        },
      });
      await loggingService.logInfo(jobId, `Stored document text (${textSource})`);
    }

    console.log(`[Worker] Successfully processed document: ${documentId}`);
    await loggingService.logInfo(jobId, `Successfully processed document: ${documentId}`);
  } catch (error: any) {
    console.error(`[Worker] Failed to process document ${documentId}:`, error.message);
    await loggingService.logError(jobId, `Failed to process document: ${error.message}`, 'error', {
      error: error.message,
      stack: error.stack,
    });

    // Update status to failed
    await prisma.document.update({
      where: { id: documentId },
      data: {
        ocrStatus: 'failed',
        metadata: {
          error: error.message,
          failedAt: new Date().toISOString(),
        },
      },
    });
    await loggingService.logInfo(jobId, 'Updated document status to failed');

    throw error;
  }
}
