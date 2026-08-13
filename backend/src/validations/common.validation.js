import { z } from 'zod';

export const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'ID do MongoDB inválido');

export const idParamsSchema = z.object({ id: mongoId }).strict();

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const positiveInteger = (maximum) =>
  z.coerce.number().int().positive().max(maximum);

export function sortField(fields) {
  return z.string().refine(
    (value) => fields.includes(value.replace(/^-/, '')),
    `Ordenação permitida apenas por: ${fields.join(', ')}`,
  );
}
