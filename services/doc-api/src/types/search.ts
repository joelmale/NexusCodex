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

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type QuickSearchQuery = z.infer<typeof QuickSearchQuerySchema>;
