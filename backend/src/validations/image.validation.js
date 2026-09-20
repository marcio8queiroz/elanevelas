import { z } from 'zod';
import { mongoId } from './common.validation.js';

export const imageResourceParams = z.object({ id: mongoId }).strict();
export const imageParams = z.object({ id: mongoId, imageId: z.uuid() }).strict();
export const uploadImageBody = z.object({ alt: z.string().trim().max(200).optional() }).strict();
export const editImageBody = z.object({ alt: z.string().trim().max(200).optional(), isMain: z.literal(true).optional() })
  .strict().refine((value) => Object.keys(value).length > 0, 'Informe alt ou isMain');
export const orderImagesBody = z.object({ imageIds: z.array(z.uuid()).max(20) }).strict();
export const emptyImageQuery = z.object({}).strict();
