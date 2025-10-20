import { createWorker } from 'tesseract.js';

class OcrService {
  /**
   * Extract text from an image buffer using OCR
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      const worker = await createWorker('eng');

      const { data } = await worker.recognize(imageBuffer);

      await worker.terminate();

      return data.text;
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from multiple pages (image buffers)
   */
  async extractTextFromImages(imageBuffers: Buffer[]): Promise<string[]> {
    const worker = await createWorker('eng');

    try {
      const results: string[] = [];

      for (const buffer of imageBuffers) {
        const { data } = await worker.recognize(buffer);
        results.push(data.text);
      }

      return results;
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Check if PDF page appears to be image-based (scanned)
   * This is a heuristic - checks if extracted text is very short
   */
  isImageBasedPage(extractedText: string): boolean {
    // If extracted text is very short or empty, likely an image-based PDF
    const trimmed = extractedText.trim();
    return trimmed.length < 50 || trimmed.split(/\s+/).length < 10;
  }
}

export const ocrService = new OcrService();
