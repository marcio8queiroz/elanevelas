import { z } from 'zod';

const email = z.string().trim().email().max(254).toLowerCase();
const password = z.string().min(8).max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email,
  password,
  phone: z.string().trim().min(8).max(30).optional(),
}).strict();

export const loginSchema = z.object({ email, password }).strict();

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1).max(4096),
}).strict();

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(8).max(30).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo');
