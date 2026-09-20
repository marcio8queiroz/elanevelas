import mongoose from 'mongoose';

// Only server-generated uploads enter this ledger. Published assets are retained forever.
const schema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true },
  url: String,
  state: { type: String, enum: ['uploading', 'retained', 'cleanup', 'deleted', 'failed'], required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, required: true },
  lease: String,
  leaseUntil: Date,
}, { timestamps: true });
schema.index({ state: 1, nextAttemptAt: 1 });
export default mongoose.model('ImageAsset', schema);
