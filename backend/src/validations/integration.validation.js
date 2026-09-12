import { z } from 'zod';
import { mongoId } from './common.validation.js';

export const quoteSchema = z.object({
  destinationZipCode: z.string().regex(/^\d{5}-?\d{3}$/).transform((v) => v.replace('-', '')),
  items: z.array(z.object({ productId: mongoId, quantity: z.number().int().positive().max(10000) }).strict()).min(1).max(100),
}).strict();

const payer = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  identification: z.object({ type: z.literal('CPF'), number: z.string().regex(/^\d{11}$/) }).strict(),
}).strict();
export const paymentSchema = z.object({
  payer,
  card: z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{20,256}$/),
    paymentMethodId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    installments: z.number().int().min(1).max(12), issuerId: z.string().regex(/^\d{1,20}$/).optional(),
  }).strict().optional(),
}).strict();
