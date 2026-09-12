import crypto from 'node:crypto';
import Order from '../models/Order.js';
import AppError from '../utils/AppError.js';
import { createPaymentAdapter } from '../integrations/mercadoPago.js';

export async function ownOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError('Pedido não encontrado.', 404);
  return order;
}

// A single provider attempt per order. Ambiguous failures reuse the same key and input.
export async function initiatePayment(user, orderId, input, adapter = createPaymentAdapter()) {
  let order = await ownOrder(user._id, orderId);
  if (order.shipping?.serviceId && !order.checkoutCompletedAt) throw new AppError('Pedido ainda em criação.', 409);
  if (order.status === 'cancelled' || ['failed', 'refunded'].includes(order.paymentStatus)) throw new AppError('Pedido incompatível com pagamento.', 400);
  if (order.payment.externalPaymentId || order.paymentStatus === 'paid') return order;
  if (order.status !== 'pending') throw new AppError('Pedido incompatível com pagamento.', 400);
  if ((order.paymentMethod === 'credit_card') !== Boolean(input.card)
    || ['pix', 'bolbradesco'].includes(input.card?.paymentMethodId)) throw new AppError('Dados incompatíveis com o método de pagamento.', 400);
  const idempotencyKey = order.payment.idempotencyKey ?? crypto.randomUUID();
  const fingerprint = crypto.createHmac('sha256', idempotencyKey).update(JSON.stringify([user.email, input])).digest('hex');
  if (!order.payment.idempotencyKey) {
    await Order.updateOne({ _id: order._id, 'payment.idempotencyKey': { $exists: false }, paymentStatus: 'pending', status: 'pending' },
      { $set: { 'payment.provider': 'mercado_pago', 'payment.idempotencyKey': idempotencyKey, 'payment.inputHash': fingerprint } });
    order = await ownOrder(user._id, orderId);
  }
  if (!order.payment.idempotencyKey || order.status !== 'pending' || order.paymentStatus !== 'pending') {
    throw new AppError('Pedido atualizado simultaneamente.', 409);
  }
  const expectedHash = crypto.createHmac('sha256', order.payment.idempotencyKey).update(JSON.stringify([user.email, input])).digest('hex');
  if (order.payment.inputHash !== expectedHash) throw new AppError('Repita os mesmos dados da tentativa original.', 409);
  // Database lease prevents concurrent HTTP submissions across server instances.
  const lease = crypto.randomUUID();
  const acquired = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: 'pending', status: 'pending',
    'payment.externalPaymentId': { $exists: false },
    $or: [{ 'payment.leaseUntil': { $exists: false } }, { 'payment.leaseUntil': { $lt: new Date() } }] },
  { $set: { 'payment.lease': lease, 'payment.leaseUntil': new Date(Date.now() + 30000) } }, { returnDocument: 'after' });
  if (!acquired) throw new AppError('Pagamento em processamento. Consulte o pedido.', 409);
  try {
    const payment = await adapter.create({ order: acquired, email: user.email, input, idempotencyKey: acquired.payment.idempotencyKey });
    await applyPayment(acquired, payment);
    return await ownOrder(user._id, orderId);
  } finally {
    await Order.updateOne({ _id: order._id, 'payment.lease': lease }, { $unset: { 'payment.lease': 1, 'payment.leaseUntil': 1 } });
  }
}

const transitions = { pending: ['paid', 'failed'], paid: ['refunded'], failed: [], refunded: [] };
export async function applyPayment(order, payment) {
  if (payment.reference !== order.orderNumber || payment.currency !== 'BRL' || payment.amountInCents !== order.totalInCents
    || payment.attemptId !== order.payment.idempotencyKey || payment.method !== order.paymentMethod
    || (order.payment.externalPaymentId && order.payment.externalPaymentId !== payment.externalPaymentId)) throw new AppError('Pagamento não corresponde ao pedido.', 400);
  if (!payment.status) return;
  for (let retry = 0; retry < 3; retry += 1) {
    const current = await Order.findById(order._id);
    if (!current || (current.payment.externalPaymentId && current.payment.externalPaymentId !== payment.externalPaymentId)) return;
    if (current.paymentStatus !== payment.status && !transitions[current.paymentStatus]?.includes(payment.status)) return;
    const set = { 'payment.externalPaymentId': payment.externalPaymentId };
    for (const key of ['qrCode', 'qrCodeBase64', 'ticketUrl', 'expiresAt']) if (payment[key] !== undefined) set[`payment.${key}`] = payment[key];
    const update = { $set: set };
    if (current.paymentStatus !== payment.status) {
      set.paymentStatus = payment.status;
      if (payment.status === 'paid') set['payment.paidAt'] = payment.paidAt ?? new Date();
      update.$push = { statusHistory: { type: 'payment', status: payment.status, changedAt: new Date() } };
    }
    const result = await Order.updateOne({ _id: current._id, paymentStatus: current.paymentStatus,
      'payment.externalPaymentId': current.payment.externalPaymentId ?? { $exists: false } }, update);
    if (result.matchedCount) return;
  }
  throw new AppError('Pagamento atualizado simultaneamente. Repita a consulta.', 503);
}

export async function processWebhook(id, adapter = createPaymentAdapter()) {
  const payment = await adapter.get(id);
  if (payment.externalPaymentId !== id) throw new AppError('Notificação inválida.', 400);
  const order = await Order.findOne({ orderNumber: payment.reference, 'payment.provider': 'mercado_pago' });
  if (!order) return;
  await applyPayment(order, payment);
}
