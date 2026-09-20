import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { imageUpload } from '../middlewares/imageUpload.middleware.js';
import { imageResource, listImages, addImage, patchImage, reorderImages, deleteImage } from '../controllers/image.controller.js';
import { imageResourceParams, imageParams, uploadImageBody, editImageBody, orderImagesBody, emptyImageQuery } from '../validations/image.validation.js';

export function imageRoutes(kind) {
  const router = Router();
  const base = kind === 'product' ? '/:id/images' : '/:id/image';
  const admin = [authenticate, authorize('admin')];
  const params = validate({ params: imageResourceParams, query: emptyImageQuery });
  if (kind === 'product') {
    router.get(base, params, imageResource(kind, false), listImages);
    router.patch(`${base}/order`, ...admin, params, validate({ body: orderImagesBody }), imageResource(kind), reorderImages);
    router.patch(`${base}/:imageId`, ...admin, validate({ params: imageParams, query: emptyImageQuery, body: editImageBody }),
      imageResource(kind), patchImage);
  }
  router[kind === 'product' ? 'post' : 'put'](base, ...admin, params, imageResource(kind, true, true),
    imageUpload, validate({ body: uploadImageBody }), addImage(kind));
  router.delete(kind === 'product' ? `${base}/:imageId` : base, ...admin,
    validate({ params: kind === 'product' ? imageParams : imageResourceParams, query: emptyImageQuery }),
    imageResource(kind), deleteImage(kind));
  return router;
}
