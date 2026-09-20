import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { imageResponse } from '../utils/imageResponse.js';
import { loadImageResource, uploadImage, editProductImage, orderProductImages,
  removeProductImage, removeCategoryImage, MAX_PRODUCT_IMAGES } from '../services/image.service.js';

export const imageResource = (kind, mutation = true, uploading = false) => asyncHandler(async (req, res, next) => {
  req.imageResource = await loadImageResource(kind, req.validated.params.id, mutation);
  if (uploading && kind === 'product' && req.imageResource.images.length >= MAX_PRODUCT_IMAGES) {
    throw new AppError('Limite de 20 imagens por produto.', 409);
  }
  next();
});

const respondProduct = (res, product, status = 200) =>
  res.status(status).json({ success: true, data: product.images.map(imageResponse) });

export const listImages = asyncHandler(async (req, res) => respondProduct(res, req.imageResource));
export const addImage = (kind) => asyncHandler(async (req, res) => {
  req.imageProcessing = true;
  try {
    const resource = await uploadImage(kind, req.imageResource, req.file, req.validated.body.alt, req.app.locals.imageAdapter);
    if (kind === 'product') respondProduct(res, resource, 201);
    else res.json({ success: true, data: imageResponse(resource.image) });
  } finally {
    req.imageProcessing = false;
    req.file = undefined;
    req.releaseImageUpload();
  }
});
export const patchImage = asyncHandler(async (req, res) => respondProduct(res,
  await editProductImage(req.imageResource, req.validated.params.imageId, req.validated.body)));
export const reorderImages = asyncHandler(async (req, res) => respondProduct(res,
  await orderProductImages(req.imageResource, req.validated.body.imageIds)));
export const deleteImage = (kind) => asyncHandler(async (req, res) => {
  if (kind === 'product') await removeProductImage(req.imageResource, req.validated.params.imageId);
  else await removeCategoryImage(req.imageResource);
  res.status(204).end();
});
