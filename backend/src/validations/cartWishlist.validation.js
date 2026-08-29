import { z } from 'zod';
import { mongoId } from './common.validation.js';

const quantity = z.number().int().positive();

export const emptyObjectSchema = z.object({}).strict().default({});

export const addCartItemSchema = z.object({
  productId: mongoId,
  quantity,
}).strict();

export const updateCartItemSchema = z.object({ quantity }).strict();

export const productIdParamsSchema = z.object({ productId: mongoId }).strict();

export const addWishlistItemSchema = z.object({ productId: mongoId }).strict();
