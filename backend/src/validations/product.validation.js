import { z } from 'zod';
import { booleanQuery, mongoId, positiveInteger, sortField } from './common.validation.js';

const imageSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  publicId: z.string().trim().min(1).max(255).optional(),
  alt: z.string().trim().max(200).optional(),
  isMain: z.boolean().optional(),
}).strict();

const specificationsSchema = z.object({
  weight: z.number().nonnegative().optional(),
  burnTime: z.number().nonnegative().optional(),
  waxType: z.string().trim().max(100).optional(),
  wickType: z.string().trim().max(100).optional(),
  containerMaterial: z.string().trim().max(100).optional(),
}).strict();

const shippingSchema = z.object({
  weightKg: z.number().nonnegative(),
  heightCm: z.number().nonnegative(),
  widthCm: z.number().nonnegative(),
  lengthCm: z.number().nonnegative(),
}).strict();

const productFields = {
  name: z.string().trim().min(1).max(150),
  slug: z.string().trim().min(1).max(180).toLowerCase(),
  sku: z.string().trim().min(1).max(100).toUpperCase(),
  description: z.string().trim().min(1),
  shortDescription: z.string().trim().max(300).optional(),
  category: mongoId,
  fragrance: z.string().trim().min(1).max(150),
  price: z.number().nonnegative(),
  promotionalPrice: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  images: z.array(imageSchema).max(20).optional(),
  specifications: specificationsSchema.optional(),
  shipping: shippingSchema,
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
};

export const createProductSchema = z.object(productFields).strict();

export const updateProductSchema = z
  .object(productFields)
  .strict()
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo');

export const listProductsSchema = z
  .object({
    page: positiveInteger(Number.MAX_SAFE_INTEGER).default(1),
    limit: positiveInteger(100).default(10),
    sort: sortField(['name', 'price', 'stock', 'salesCount', 'createdAt', 'updatedAt']).default('-createdAt'),
    search: z.string().trim().min(1).max(100).optional(),
    category: mongoId.optional(),
    fragrance: z.string().trim().min(1).max(150).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    isFeatured: booleanQuery.optional(),
    isActive: booleanQuery.optional(),
    inStock: booleanQuery.optional(),
  })
  .strict()
  .refine(
    ({ minPrice, maxPrice }) => minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: 'minPrice não pode ser maior que maxPrice', path: ['minPrice'] },
  );
