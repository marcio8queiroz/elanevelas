import mongoose from 'mongoose';

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
export const PAYMENT_METHODS = ['pix', 'credit_card', 'boleto'];

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: String,
  quantity: { type: Number, required: true, min: 1 },
  unitPriceInCents: { type: Number, required: true, min: 0 },
  totalInCents: { type: Number, required: true, min: 0 },
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  recipientName: { type: String, required: true },
  zipCode: { type: String, required: true },
  street: { type: String, required: true },
  number: { type: String, required: true },
  complement: String,
  neighborhood: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  type: { type: String, enum: ['order', 'payment'], required: true },
  status: { type: String, required: true },
  description: String,
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: {
    type: [orderItemSchema], required: true,
    validate: [(items) => items.length > 0, 'O pedido deve possuir itens.'],
  },
  subtotalInCents: { type: Number, required: true, min: 0 },
  discountInCents: { type: Number, default: 0, min: 0 },
  shippingInCents: { type: Number, required: true, min: 0 },
  totalInCents: { type: Number, required: true, min: 0 },
  shippingAddress: { type: shippingAddressSchema, required: true },
  checkoutCompletedAt: Date,
  shipping: { provider: String, service: String, serviceId: String, serviceName: String, price: Number, estimatedDays: Number, trackingCode: String },
  status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
  payment: {
    provider: { type: String, enum: ['mercado_pago', 'pagarme'] },
    method: String,
    externalPaymentId: String,
    status: String,
    paidAt: Date,
    transactionAmountInCents: Number,
    idempotencyKey: String,
    inputHash: String,
    lease: String,
    leaseUntil: Date,
    qrCode: String,
    qrCodeBase64: String,
    ticketUrl: String,
    expiresAt: Date,
  },
  statusHistory: { type: [statusHistorySchema], default: [] },
  customerNotes: { type: String, maxlength: 500 },
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ 'payment.externalPaymentId': 1 }, { sparse: true });

export default mongoose.model('Order', orderSchema);
