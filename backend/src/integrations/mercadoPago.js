import crypto from 'node:crypto';
import AppError from '../utils/AppError.js';
import { invalidResponse, moneyInCents, requestJson, required } from './http.js';

const statuses = { pending: 'pending', in_process: 'pending', authorized: 'pending',
  approved: 'paid', rejected: 'failed', cancelled: 'failed', refunded: 'refunded' };
const text = (v, max) => typeof v === 'string' && v.length <= max ? v : undefined;
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password
      && ['mercadopago.com.br', 'mercadopago.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url.href;
  } catch { /* Optional provider field. */ }
  return undefined;
}
export function normalizePayment(data) {
  if (!data || !/^\d+$/.test(String(data.id)) || typeof data.external_reference !== 'string'
    || typeof data.currency_id !== 'string' || typeof data.status !== 'string') throw invalidResponse();
  const status = statuses[data.status];
  const transaction = data.point_of_interaction?.transaction_data;
  const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value) : undefined;
  return { externalPaymentId: String(data.id), reference: data.external_reference,
    attemptId: data.metadata?.attempt_id, amountInCents: moneyInCents(data.transaction_amount),
    currency: data.currency_id, status,
    method: data.payment_method_id === 'pix' ? 'pix' : data.payment_type_id === 'ticket' ? 'boleto'
      : data.payment_type_id === 'credit_card' ? 'credit_card' : undefined,
    qrCode: text(transaction?.qr_code, 4096), qrCodeBase64: text(transaction?.qr_code_base64, 100000),
    ticketUrl: safeUrl(data.transaction_details?.external_resource_url ?? transaction?.ticket_url),
    expiresAt: date(data.date_of_expiration), paidAt: date(data.date_approved),
  };
}

export function createPaymentAdapter({ fetchImpl, env = process.env, timeoutMs } = {}) {
  const call = async (path, options = {}) => requestJson(`https://api.mercadopago.com/v1/payments${path}`, {
    fetchImpl, timeoutMs, ...options,
    headers: { Authorization: `Bearer ${required('MERCADO_PAGO_ACCESS_TOKEN', env)}`,
      Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers },
  });
  return {
    async create({ order, email, input, idempotencyKey }) {
      const address = order.shippingAddress;
      const payer = { email, first_name: input.payer.firstName, last_name: input.payer.lastName,
        identification: input.payer.identification,
        address: { zip_code: address.zipCode.replace('-', ''), street_name: address.street,
          street_number: address.number, neighborhood: address.neighborhood, city: address.city, federal_unit: address.state } };
      const card = input.card;
      const body = { transaction_amount: order.totalInCents / 100, description: `Pedido ${order.orderNumber}`,
        external_reference: order.orderNumber, metadata: { attempt_id: idempotencyKey }, payer,
        payment_method_id: order.paymentMethod === 'pix' ? 'pix' : order.paymentMethod === 'boleto' ? 'bolbradesco' : card.paymentMethodId,
        ...(card && { token: card.token, installments: card.installments, ...(card.issuerId && { issuer_id: card.issuerId }) }) };
      const payment = normalizePayment(await call('', { method: 'POST', headers: { 'X-Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }));
      if (!payment.status || (payment.status === 'pending' && (
        (order.paymentMethod === 'pix' && !payment.qrCode)
        || (order.paymentMethod === 'boleto' && !payment.ticketUrl)))) throw invalidResponse();
      return payment;
    },
    async get(id) { return normalizePayment(await call(`/${encodeURIComponent(id)}`)); },
  };
}

export function verifyWebhook(req, env = process.env) {
  const secret = required('MERCADO_PAGO_WEBHOOK_SECRET', env);
  const signature = req.get('x-signature');
  const requestId = req.get('x-request-id');
  const id = req.query['data.id'];
  const fail = () => { throw new AppError('Notificação inválida.', 401); };
  if (typeof signature !== 'string' || typeof requestId !== 'string' || !/^[\w-]{1,200}$/.test(requestId)
    || typeof id !== 'string' || !/^\d{1,30}$/.test(id)) return fail();
  const parts = signature.split(',').map((p) => p.trim().split('='));
  if (parts.length !== 2 || new Set(parts.map(([key]) => key)).size !== 2) return fail();
  const { ts, v1 } = Object.fromEntries(parts);
  if (!/^\d{10,13}$/.test(ts ?? '') || !/^[a-f\d]{64}$/i.test(v1 ?? '')) return fail();
  const time = ts.length === 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(Date.now() - time) > 5 * 60 * 1000) return fail();
  const expected = crypto.createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(v1, 'hex'))) return fail();
  if (req.body?.type !== 'payment' || String(req.body?.data?.id) !== id) return fail();
  return id;
}
