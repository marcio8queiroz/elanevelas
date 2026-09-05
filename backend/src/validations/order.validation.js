import { z } from 'zod';
import { mongoId, positiveInteger, sortField } from './common.validation.js';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../models/Order.js';

const requiredText = (max) => z.string().trim().min(1).max(max);
const shippingAddress = z.object({
  recipientName: requiredText(150),
  zipCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  street: requiredText(200),
  number: requiredText(30),
  complement: z.string().trim().max(150).optional(),
  neighborhood: requiredText(120),
  city: requiredText(120),
  state: z.string().trim().length(2).toUpperCase(),
}).strict();

export const createOrderSchema = z.object({
  shippingAddress,
  paymentMethod: z.enum(PAYMENT_METHODS),
}).strict();

const listBase = {
  page: positiveInteger(Number.MAX_SAFE_INTEGER).default(1),
  limit: positiveInteger(100).default(10),
  sort: sortField(['createdAt', 'total']).default('-createdAt'),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
};

export const listOrdersSchema = z.object(listBase).strict();
export const adminListOrdersSchema = z.object({
  ...listBase,
  user: mongoId.optional(),
  orderNumber: z.string().trim().min(1).max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict().refine(
  ({ from, to }) => !from || !to || from <= to,
  { message: 'from não pode ser posterior a to', path: ['from'] },
);

export const orderIdParamsSchema = z.object({ orderId: mongoId }).strict();
export const updateOrderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) }).strict();
export const updatePaymentStatusSchema = z.object({ paymentStatus: z.enum(PAYMENT_STATUSES) }).strict();
