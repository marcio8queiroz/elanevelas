import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  fingerprint: { type: String, required: true },
  destinationZipCode: { type: String, required: true },
  options: [{ _id: false, serviceId: String, carrier: String, serviceName: String, price: Number, estimatedDays: Number }],
  expiresAt: { type: Date, required: true, expires: 0 },
});
export default mongoose.model('ShippingQuote', schema);
