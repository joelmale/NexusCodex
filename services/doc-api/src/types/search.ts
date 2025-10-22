import { z } from 'zod';
import { DocumentTypeEnum } from './document';

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  type: DocumentTypeEnum.optional(),
  campaigns: z.string().optional().transform(val => val ? val.split(',') : undefined),
  tags: z.string().optional().transform(val => val ? val.split(',') : undefined),
  from: z.string().optional().default('0').transform(Number),
  size: z.string().optional().default('20').transform(Number),
});

export const QuickSearchQuerySchema = z.object({
  query: z.string().min(1),
  campaign: z.string().optional(),
  size: z.string().optional().default('5').transform(Number),
});

// Advanced search schema with enhanced filtering
export const AdvancedSearchQuerySchema = z.object({
  query: z.string().min(1),
  type: DocumentTypeEnum.optional(),
  campaigns: z.string().optional().transform(val => val ? val.split(',') : undefined),
  tags: z.string().optional().transform(val => val ? val.split(',') : undefined),
  uploadedBy: z.string().optional(),
  uploadedAfter: z.string().optional().transform(val => val ? new Date(val) : undefined),
  uploadedBefore: z.string().optional().transform(val => val ? new Date(val) : undefined),
  sortBy: z.enum(['relevance', 'uploadedAt', 'title', 'fileSize']).optional().default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  from: z.string().optional().default('0').transform(Number),
  size: z.string().optional().default('20').transform(Number),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type QuickSearchQuery = z.infer<typeof QuickSearchQuerySchema>;
export type AdvancedSearchQuery = z.infer<typeof AdvancedSearchQuerySchema>;
