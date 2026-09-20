import { randomUUID } from 'node:crypto';
import Product from '../models/Product.js';

// Raw documents preserve every legacy field; no external identifiers are inferred.
export async function migrateImageIds({ dryRun = true } = {}) {
  const counts = { scanned: 0, candidates: 0, updated: 0, conflicts: 0 };
  for await (const product of Product.collection.find({ 'images.0': { $exists: true } })) {
    counts.scanned += 1;
    const seen = new Set();
    const mainIndex = Math.max(0, product.images.findIndex((image) => image.isMain));
    const images = product.images.map((image, index) => {
      const id = image.id && !seen.has(image.id) ? image.id : randomUUID();
      seen.add(id);
      return { ...image, id, isMain: index === mainIndex };
    });
    if (JSON.stringify(images) === JSON.stringify(product.images)) continue;
    counts.candidates += 1;
    if (dryRun) continue;
    const result = await Product.collection.updateOne({ _id: product._id, images: product.images },
      { $set: { images }, $inc: { imageRevision: 1 } });
    if (result.modifiedCount) counts.updated += 1;
    else counts.conflicts += 1;
  }
  return counts;
}
