import { z } from 'zod';
import { booleanQuery, positiveInteger, sortField } from './common.validation.js';

const imageSchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
    publicId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

const categoryFields = {
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(120).toLowerCase(),
  description: z.string().trim().max(500).optional(),
  image: imageSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
};

export const createCategorySchema = z.object(categoryFields).strict();

export const updateCategorySchema = z
  .object(categoryFields)
  .strict()
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo');

export const listCategoriesSchema = z
  .object({
    page: positiveInteger(Number.MAX_SAFE_INTEGER).default(1),
    limit: positiveInteger(100).default(10),
    sort: sortField(['name', 'slug', 'sortOrder', 'createdAt', 'updatedAt']).default('sortOrder'),
    search: z.string().trim().min(1).max(100).optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();
