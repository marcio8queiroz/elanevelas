import { randomUUID } from 'node:crypto';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import ImageAsset from '../models/ImageAsset.js';
import AppError from '../utils/AppError.js';
import cloudinary from '../integrations/cloudinary.js';
import { processImage } from './imageProcessing.service.js';
import { cleanImageAsset, UPLOAD_RECOVERY_DELAY } from './imageCleanup.service.js';

export const MAX_PRODUCT_IMAGES = 20;
export const imageModel = (kind) => kind === 'product' ? Product : Category;
const conflict = () => new AppError('As imagens mudaram. Consulte novamente e repita a operação.', 409);

export async function loadImageResource(kind, id, mutation = true) {
  const resource = await imageModel(kind).findById(id);
  if (!resource) throw new AppError('Recurso não encontrado.', 404);
  if (mutation && kind === 'product' && resource.images.some((image) => !image.id)) {
    throw new AppError('Execute a migração de IDs das imagens antigas antes de gerenciá-las.', 409);
  }
  return resource;
}

export async function persistImages(kind, resource, value) {
  const updated = await imageModel(kind).findOneAndUpdate({ _id: resource._id,
    $expr: { $eq: [{ $ifNull: ['$imageRevision', 0] }, resource.imageRevision ?? 0] },
  }, { $set: { [kind === 'product' ? 'images' : 'image']: value }, $inc: { imageRevision: 1 } },
  { returnDocument: 'after', runValidators: true });
  if (!updated) throw conflict();
  return updated;
}

function normalizeMain(images) {
  const mainId = (images.find((image) => image.isMain) ?? images[0])?.id;
  return images.map((image) => ({ ...image, isMain: image.id === mainId }));
}

export async function uploadImage(kind, resource, file, alt = '', adapter = cloudinary) {
  if (kind === 'product' && resource.images.length >= MAX_PRODUCT_IMAGES) {
    throw new AppError('Limite de 20 imagens por produto.', 409);
  }
  const processed = await processImage(file);
  const id = randomUUID();
  // Persist the cleanup identity BEFORE any network request, including ambiguous timeouts.
  const asset = await ImageAsset.create({ publicId: `elanevelas/${randomUUID()}`, state: 'uploading',
    nextAttemptAt: new Date(Date.now() + UPLOAD_RECOVERY_DELAY) });
  let stored;
  let persistenceAttempted = false;
  try {
    stored = await adapter.store({ publicId: asset.publicId, buffer: processed.buffer });
  } catch (error) {
    // Rearm quarantine if this request resumed after a stale-upload worker already ran.
    try {
      await ImageAsset.updateOne({ _id: asset._id, state: { $ne: 'retained' } }, {
        $set: { state: 'uploading', attempts: 0, nextAttemptAt: new Date(Date.now() + UPLOAD_RECOVERY_DELAY) },
        $unset: { lease: 1, leaseUntil: 1 },
      });
    } catch { /* Original durable identity remains available for recovery. */ }
    throw new AppError('Não foi possível armazenar a imagem.', error instanceof AppError && error.statusCode === 502 ? 502 : 503);
  }
  try {
    const url = new URL(stored.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid storage URL');
    // Irreversible retention fence BEFORE exposing the URL: order snapshot races are safe.
    const retained = await ImageAsset.updateOne({ _id: asset._id, state: 'uploading', lease: { $exists: false } },
      { $set: { state: 'retained', url: stored.url } });
    if (retained.modifiedCount !== 1) throw conflict();
    const { buffer, ...metadata } = processed;
    void buffer;
    const image = { id, url: stored.url, publicId: asset.publicId, alt, ...metadata };
    const value = kind === 'product' ? normalizeMain([
      ...resource.images.map((item) => item.toObject()), image,
    ]) : image;
    persistenceAttempted = true;
    return await persistImages(kind, resource, value);
  } catch (error) {
    // Absence NOW does not prove the URL was never published (concurrent deletes/orders).
    // Ambiguous write failures retain forever, even if a reference query would return empty.
    const definitelyRejected = error instanceof AppError && error.statusCode === 409 ||
      error.name === 'ValidationError' || [121, 11000].includes(error.code);
    try {
      asset.url = stored.url;
      if (!persistenceAttempted || definitelyRejected) {
        // A successful late upload may follow an earlier destroy. Reopen even a tombstone,
        // invalidating the old lease so its acknowledgment cannot hide this cleanup.
        await ImageAsset.updateOne({ _id: asset._id },
          { $set: { state: 'cleanup', url: stored.url, attempts: 0, nextAttemptAt: new Date() },
            $unset: { lease: 1, leaseUntil: 1 } });
        await cleanImageAsset(asset._id, adapter);
      }
    } catch { /* The pre-upload ledger survives even when MongoDB is unavailable. */ }
    if (error instanceof AppError) throw error;
    throw new AppError('Não foi possível persistir a imagem.', 503);
  }
}

export async function editProductImage(resource, imageId, patch) {
  const images = resource.images.map((image) => image.toObject());
  const image = images.find((item) => item.id === imageId);
  if (!image) throw new AppError('Imagem não encontrada.', 404);
  if (patch.alt !== undefined) image.alt = patch.alt;
  if (patch.isMain) images.forEach((item) => { item.isMain = item.id === imageId; });
  return persistImages('product', resource, normalizeMain(images));
}

export async function orderProductImages(resource, ids) {
  if (ids.length !== resource.images.length || new Set(ids).size !== ids.length ||
      ids.some((id) => !resource.images.some((image) => image.id === id))) {
    throw new AppError('Informe todos os IDs do produto, exatamente uma vez.', 400);
  }
  return persistImages('product', resource,
    normalizeMain(ids.map((id) => resource.images.find((image) => image.id === id).toObject())));
}

export async function removeProductImage(resource, imageId) {
  if (!resource.images.some((image) => image.id === imageId)) throw new AppError('Imagem não encontrada.', 404);
  return persistImages('product', resource,
    normalizeMain(resource.images.filter((image) => image.id !== imageId).map((image) => image.toObject())));
}

export const removeCategoryImage = (resource) => persistImages('category', resource, null);
