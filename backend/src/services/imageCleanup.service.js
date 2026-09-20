import { randomUUID } from 'node:crypto';
import ImageAsset from '../models/ImageAsset.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Order from '../models/Order.js';
import cloudinary, { managedPublicId } from '../integrations/cloudinary.js';

export const UPLOAD_RECOVERY_DELAY = 24 * 60 * 60 * 1000;
export const MAX_CLEANUP_ATTEMPTS = 5;

export async function isReferenced(asset) {
  const productRefs = [{ 'images.publicId': asset.publicId }];
  const categoryRefs = [{ 'image.publicId': asset.publicId }];
  if (asset.url) {
    productRefs.push({ 'images.url': asset.url });
    categoryRefs.push({ 'image.url': asset.url });
  }
  const refs = await Promise.all([
    Product.exists({ $or: productRefs }), Category.exists({ $or: categoryRefs }),
    asset.url ? Order.exists({ 'items.imageUrl': asset.url }) : false,
  ]);
  return refs.some(Boolean);
}

export async function cleanImageAsset(id, adapter = cloudinary, now = new Date()) {
  const lease = randomUUID();
  // Claiming stale uploads also prevents the original request from publishing later.
  const asset = await ImageAsset.findOneAndUpdate({ _id: id,
    state: { $in: ['cleanup', 'uploading'] }, nextAttemptAt: { $lte: now },
    attempts: { $lt: MAX_CLEANUP_ATTEMPTS },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
  }, { $set: { state: 'cleanup', lease, leaseUntil: new Date(now.getTime() + 60_000) }, $inc: { attempts: 1 } },
  { returnDocument: 'after' });
  if (!asset) return 'skipped';
  try {
    if (!managedPublicId.test(asset.publicId)) throw new Error('Invalid ledger identifier');
    if (await isReferenced(asset)) {
      const result = await ImageAsset.updateOne({ _id: id, lease }, { $set: { state: 'retained' }, $unset: { lease: 1, leaseUntil: 1 } });
      return result.modifiedCount === 1 ? 'retained' : 'skipped';
    }
    await adapter.remove({ publicId: asset.publicId });
    const result = await ImageAsset.updateOne({ _id: id, lease }, { $set: { state: 'deleted' }, $unset: { lease: 1, leaseUntil: 1 } });
    return result.modifiedCount === 1 ? 'deleted' : 'skipped';
  } catch {
    // Keep the record, including after the retry budget is exhausted; never log raw errors.
    await ImageAsset.updateOne({ _id: id, lease }, {
      $set: { state: asset.attempts >= MAX_CLEANUP_ATTEMPTS ? 'failed' : 'cleanup',
        nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** asset.attempts) },
      $unset: { lease: 1, leaseUntil: 1 },
    });
    return 'pending';
  }
}

export async function processImageCleanup({ adapter = cloudinary, limit = 100, now } = {}) {
  const queryTime = now ?? new Date();
  // A crashed final attempt must remain visible as failed instead of silently becoming ineligible.
  await ImageAsset.updateMany({ state: 'cleanup', attempts: { $gte: MAX_CLEANUP_ATTEMPTS }, leaseUntil: { $lte: queryTime } },
    { $set: { state: 'failed' }, $unset: { lease: 1, leaseUntil: 1 } });
  const assets = await ImageAsset.find({ state: { $in: ['cleanup', 'uploading'] }, nextAttemptAt: { $lte: queryTime },
    attempts: { $lt: MAX_CLEANUP_ATTEMPTS } }).sort({ nextAttemptAt: 1 }).limit(Math.min(Math.max(limit, 1), 100));
  const counts = { deleted: 0, retained: 0, pending: 0, skipped: 0 };
  for (const asset of assets) counts[await cleanImageAsset(asset._id, adapter, now ?? new Date())] += 1;
  return counts;
}
