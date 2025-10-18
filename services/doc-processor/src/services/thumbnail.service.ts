import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import { env } from '../config/env';

// Configure PDF.js worker
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

class ThumbnailService {
  /**
   * Generate thumbnail from first page of PDF
   */
  async generateThumbnail(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdfDocument = await loadingTask.promise;

      // Get first page
      const page = await pdfDocument.getPage(1);

      // Calculate scale to achieve desired thumbnail width
      const viewport = page.getViewport({ scale: 1.0 });
      const scale = env.THUMBNAIL_WIDTH / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      // Create canvas
      const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
      const context = canvas.getContext('2d');

      // Render PDF page to canvas
      await page.render({
        canvasContext: context as any,
        viewport: scaledViewport,
      }).promise;

      // Convert canvas to buffer
      const pngBuffer = canvas.toBuffer('image/png');

      // Compress to JPEG using sharp
      const jpegBuffer = await sharp(pngBuffer)
        .jpeg({ quality: env.THUMBNAIL_QUALITY })
        .toBuffer();

      // Cleanup
      await pdfDocument.destroy();

      return jpegBuffer;
    } catch (error: any) {
      throw new Error(`Failed to generate thumbnail: ${error.message}`);
    }
  }
}

export const thumbnailService = new ThumbnailService();
