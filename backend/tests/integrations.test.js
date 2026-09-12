import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Product from '../src/models/Product.js';
import Order from '../src/models/Order.js';
import ShippingQuote from '../src/models/ShippingQuote.js';
import { createTokenPair } from '../src/services/token.service.js';
import AppError from '../src/utils/AppError.js';
import { createShippingAdapter } from '../src/integrations/melhorEnvio.js';
import { createPaymentAdapter } from '../src/integrations/mercadoPago.js';

const address = { recipientName: 'Cliente Teste', zipCode: '69000-000', street: 'Rua', number: '10', neighborhood: 'Centro', city: 'Manaus', state: 'AM' };
const payer = { firstName: 'Cliente', lastName: 'Teste', identification: { type: 'CPF', number: '00000000000' } };
const card = { token: 'fake-token-generated-by-sdk', paymentMethodId: 'visa', installments: 1 };
const shipping = [{ serviceId: '1', carrier: 'Correios', serviceName: 'PAC', price: 15.23, estimatedDays: 4 }];
let shippingAdapter;
let paymentAdapter;
let lastPayment;

beforeEach(() => {
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'fake-webhook-secret';
  shippingAdapter = { quote: vi.fn(async () => shipping) };
  paymentAdapter = {
    create: vi.fn(async ({ order, idempotencyKey }) => {
      lastPayment = { externalPaymentId: '123456', reference: order.orderNumber, amountInCents: order.totalInCents,
        currency: 'BRL', method: order.paymentMethod, attemptId: idempotencyKey, status: 'pending',
        qrCode: 'fake-qr-code', ticketUrl: 'https://www.mercadopago.com.br/ticket', expiresAt: new Date(Date.now() + 3600000) };
      return lastPayment;
    }),
    get: vi.fn(async () => lastPayment),
  };
  app.locals.shippingAdapter = shippingAdapter;
  app.locals.paymentAdapter = paymentAdapter;
});
afterEach(() => {
  delete app.locals.shippingAdapter;
  delete app.locals.paymentAdapter;
  vi.restoreAllMocks();
});

async function account(role = 'customer') {
  const user = await User.create({ name: 'Cliente Teste', email: `${new mongoose.Types.ObjectId()}@example.com`, passwordHash: 'unused', role });
  return { user, auth: `Bearer ${createTokenPair(user).accessToken}` };
}
async function fixture() {
  const credentials = await account();
  const id = new mongoose.Types.ObjectId();
  const product = await Product.create({ name: 'Vela', sku: `SKU-${id}`, slug: `vela-${id}`, description: 'Artesanal', fragrance: 'Lavanda',
    category: new mongoose.Types.ObjectId(), price: 20, stock: 10, shipping: { weightKg: 0.3, heightCm: 8, widthCm: 7, lengthCm: 9 } });
  await request(app).post('/api/v1/cart/items').set('Authorization', credentials.auth).send({ productId: product.id, quantity: 2 });
  return { ...credentials, product };
}
const quoteBody = (f) => ({ destinationZipCode: '69000000', items: [{ productId: f.product.id, quantity: 2 }] });
const quoteRequest = (f, body = quoteBody(f)) => request(app).post('/api/v1/shipping/quotes').set('Authorization', f.auth).send(body);
async function quoted() {
  const f = await fixture();
  const response = await quoteRequest(f);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return { ...f, quote: response.body.data };
}
const orderBody = (f, overrides = {}) => ({ shippingAddress: address, paymentMethod: 'pix', shippingQuoteId: f.quote.quoteId, shippingServiceId: '1', ...overrides });
const orderRequest = (f, body = orderBody(f)) => request(app).post('/api/v1/orders').set('Authorization', f.auth).send(body);
async function ordered(method = 'pix') {
  const f = await quoted();
  const response = await orderRequest(f, orderBody(f, { paymentMethod: method }));
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return { ...f, order: await Order.findById(response.body.data.id), response };
}
const paymentRequest = (f, input = { payer }) => request(app).post(`/api/v1/orders/${f.order.id}/payments`).set('Authorization', f.auth).send(input);
async function paying() {
  const f = await ordered();
  expect((await paymentRequest(f)).status).toBe(200);
  return f;
}
function webhook({ id = '123456', signature, ts = String(Date.now()), body = { type: 'payment', data: { id } } } = {}) {
  const requestId = 'request-123';
  const digest = crypto.createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return request(app).post(`/api/v1/webhooks/mercado-pago?data.id=${id}`)
    .set('x-request-id', requestId).set('x-signature', signature ?? `ts=${ts},v1=${digest}`).send(body);
}

describe('frete autenticado e estrito', () => {
  it('não expõe revisão interna do carrinho no perfil', async () => {
    const f = await fixture();
    const response = await request(app).get('/api/v1/users/me').set('Authorization', f.auth);
    expect(response.status).toBe(200);
    expect(response.body.data.cart).not.toHaveProperty('revision');
  });
  it.each([401, 429, 503])('adapter real traduz HTTP %s na rota sem vazar resposta ou logs', async (status) => {
    const f = await fixture();
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    app.locals.shippingAdapter = createShippingAdapter({ env: { MELHOR_ENVIO_TOKEN: 'secret-test-token', STORE_POSTAL_CODE: '69000000', STORE_NAME: 'Teste', STORE_EMAIL: 'test@example.com' },
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ secret: 'private-payload' }) }) });
    const response = await quoteRequest(f);
    expect(response.status).toBe(503);
    const outputs = JSON.stringify([response.body, warn.mock.calls, error.mock.calls]);
    expect(outputs).not.toContain('secret-test-token');
    expect(outputs).not.toContain('private-payload');
  });
  it('timeout e JSON inválido do adapter chegam sanitizados à rota', async () => {
    const f = await fixture();
    const env = { MELHOR_ENVIO_TOKEN: 'fake', STORE_POSTAL_CODE: '69000000', STORE_NAME: 'Teste', STORE_EMAIL: 'test@example.com' };
    app.locals.shippingAdapter = createShippingAdapter({ env, timeoutMs: 10, fetchImpl: () => new Promise(() => {}) });
    expect((await quoteRequest(f)).status).toBe(503);
    app.locals.shippingAdapter = createShippingAdapter({ env, fetchImpl: async () => ({ ok: true, json: async () => ({ bad: true }) }) });
    expect((await quoteRequest(f)).status).toBe(502);
  });
  it('exige autenticação', async () => {
    expect((await request(app).post('/api/v1/shipping/quotes').send({})).status).toBe(401);
  });
  it.each([
    { destinationZipCode: '123' }, { destinationZipCode: 69000000 }, { weight: 3 }, { price: 1 }, { from: '01001000' },
    { items: [] }, { items: [{ productId: 'invalid', quantity: 1 }] },
  ])('valida body %j', async (override) => {
    const f = await fixture();
    expect((await quoteRequest(f, { ...quoteBody(f), ...override })).status).toBe(400);
    expect(shippingAdapter.quote).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, '2', null])('rejeita quantidade %s', async (quantity) => {
    const f = await fixture();
    expect((await quoteRequest(f, { ...quoteBody(f), items: [{ productId: f.product.id, quantity }] })).status).toBe(400);
  });
  it('rejeita duplicatas inclusive ObjectIds em caixa diferente', async () => {
    const f = await fixture();
    expect((await quoteRequest(f, { ...quoteBody(f), items: [{ productId: f.product.id, quantity: 1 }, { productId: f.product.id.toUpperCase(), quantity: 1 }] })).status).toBe(400);
  });
  it.each([['inexistente', true, 404], ['inativo', false, 400]])('rejeita produto %s', async (label, remove, status) => {
    const f = await fixture();
    if (remove) await Product.deleteOne({ _id: f.product._id });
    else await Product.updateOne({ _id: f.product._id }, { isActive: false });
    expect((await quoteRequest(f)).status).toBe(status);
  });
  it('usa peso, dimensões e preço persistidos; devolve somente contrato público', async () => {
    const f = await quoted();
    expect(shippingAdapter.quote.mock.calls[0][0]).toEqual({ destinationZipCode: '69000000', products: [{ id: f.product.id, weightKg: 0.3, heightCm: 8, widthCm: 7, lengthCm: 9, price: 20, quantity: 2 }] });
    expect(Object.keys(f.quote).sort()).toEqual(['expiresAt', 'options', 'quoteId']);
    expect(f.quote.options).toEqual(shipping);
    const stored = await ShippingQuote.findOne();
    expect(stored.tokenHash).not.toBe(f.quote.quoteId);
  });
  it('rejeita itens diferentes do carrinho', async () => {
    const f = await fixture();
    expect((await quoteRequest(f, { ...quoteBody(f), items: [{ productId: f.product.id, quantity: 1 }] })).status).toBe(400);
  });
  it('rejeita dimensão zero', async () => {
    const f = await fixture();
    await Product.updateOne({ _id: f.product._id }, { 'shipping.weightKg': 0 });
    expect((await quoteRequest(f)).status).toBe(400);
  });
  it('propaga falha normalizada sem persistir cotação', async () => {
    const f = await fixture();
    shippingAdapter.quote.mockRejectedValueOnce(new AppError('Provedor externo indisponível.', 503));
    expect((await quoteRequest(f)).status).toBe(503);
    expect(await ShippingQuote.countDocuments()).toBe(0);
  });
});

describe('pedido com seleção segura de frete', () => {
  it('restaura carrinho e estoque se a conclusão persistida falhar', async () => {
    const f = await quoted();
    const original = Order.prototype.save;
    vi.spyOn(Order.prototype, 'save').mockImplementation(function (...args) {
      if (!this.isNew) return Promise.reject(new Error('simulated completion failure'));
      return original.apply(this, args);
    });
    expect((await orderRequest(f)).status).toBe(500);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(f.product.id)).stock).toBe(10);
    expect((await User.findById(f.user.id)).cart.items).toHaveLength(1);
  });
  it('persiste snapshot, centavos e total; limpa carrinho e baixa estoque uma vez', async () => {
    const f = await ordered();
    expect(f.order).toMatchObject({ shippingInCents: 1523, subtotalInCents: 4000, totalInCents: 5523 });
    expect(f.response.body.data).toMatchObject({ shippingAmount: 15.23, total: 55.23,
      shipping: { provider: 'melhor_envio', serviceId: '1', serviceName: 'PAC', price: 15.23, estimatedDays: 4 } });
    expect((await User.findById(f.user._id)).cart.items).toHaveLength(0);
    expect((await Product.findById(f.product._id)).stock).toBe(8);
    expect(paymentAdapter.create).not.toHaveBeenCalled();
  });
  it.each([{ shippingAmount: 0 }, { total: 1 }, { shipping: { price: 0 } }, { shippingServiceId: '999' }])('rejeita seleção ou campos internos %j', async (override) => {
    const f = await quoted();
    expect((await orderRequest(f, orderBody(f, override))).status).toBe(400);
    expect((await Product.findById(f.product._id)).stock).toBe(10);
  });
  it('rejeita cotação vencida antes de reservar estoque', async () => {
    const f = await quoted();
    await ShippingQuote.updateMany({}, { expiresAt: new Date(Date.now() - 1) });
    expect((await orderRequest(f)).status).toBe(400);
    expect((await Product.findById(f.product._id)).stock).toBe(10);
    expect((await User.findById(f.user._id)).cart.items).toHaveLength(1);
  });
  it('rejeita cotação de outro usuário e CEP divergente', async () => {
    const f = await quoted();
    const outsider = await account();
    await User.updateOne({ _id: outsider.user._id }, { 'cart.items': [{ product: f.product._id, quantity: 2 }] });
    expect((await orderRequest({ ...f, ...outsider })).status).toBe(400);
    expect((await orderRequest(f, orderBody(f, { shippingAddress: { ...address, zipCode: '01001000' } }))).status).toBe(400);
  });
  it('invalida cotação mesmo quando carrinho volta às quantidades originais', async () => {
    const f = await quoted();
    for (const quantity of [3, 2]) await request(app).patch(`/api/v1/cart/items/${f.product.id}`).set('Authorization', f.auth).send({ quantity });
    expect((await orderRequest(f)).status).toBe(400);
  });
  it('compensa reservas e preserva carrinho quando persistência falha', async () => {
    const f = await quoted();
    vi.spyOn(Order, 'create').mockRejectedValueOnce(new Error('simulated'));
    expect((await orderRequest(f)).status).toBe(500);
    expect((await Product.findById(f.product._id)).stock).toBe(10);
    expect((await User.findById(f.user._id)).cart.items).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(0);
  });
  it('compensa reservas e remove pedido quando limpeza condicional falha', async () => {
    const f = await quoted();
    vi.spyOn(User, 'updateOne').mockResolvedValueOnce({ modifiedCount: 0 });
    expect((await orderRequest(f)).status).toBe(409);
    expect((await Product.findById(f.product._id)).stock).toBe(10);
    expect((await User.findById(f.user._id)).cart.items).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(0);
  });
});

describe('pagamentos do dono do pedido', () => {
  it('não inicia cobrança enquanto pedido pode ser compensado', async () => {
    const f = await ordered();
    await Order.updateOne({ _id: f.order.id }, { $unset: { checkoutCompletedAt: 1 } });
    expect((await paymentRequest(f)).status).toBe(409);
    expect(paymentAdapter.create).not.toHaveBeenCalled();
  });
  it('adapter real normaliza timeout e resposta incompleta mantendo pedido', async () => {
    const f = await ordered();
    const env = { MERCADO_PAGO_ACCESS_TOKEN: 'fake-secret' };
    app.locals.paymentAdapter = createPaymentAdapter({ env, timeoutMs: 10, fetchImpl: () => new Promise(() => {}) });
    expect((await paymentRequest(f)).status).toBe(503);
    app.locals.paymentAdapter = createPaymentAdapter({ env, fetchImpl: async () => ({ ok: true, json: async () => ({ id: 1 }) }) });
    expect((await paymentRequest(f)).status).toBe(502);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('pending');
    expect((await Product.findById(f.product.id)).stock).toBe(8);
  });
  it('ausência de configuração afeta somente a integração utilizada', async () => {
    const f = await ordered();
    app.locals.paymentAdapter = createPaymentAdapter({ env: {} });
    expect((await paymentRequest(f)).status).toBe(503);
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
  it('consulta pagamento próprio sanitizado', async () => {
    const f = await paying();
    const response = await request(app).get(`/api/v1/orders/${f.order.id}/payments`).set('Authorization', f.auth);
    expect(response.status).toBe(200);
    expect(response.body.data.qrCode).toBe('fake-qr-code');
    expect(response.body.data).not.toHaveProperty('externalPaymentId');
  });
  it.each(['pix', 'boleto', 'credit_card'])('cria %s sem vazar campos internos', async (method) => {
    const f = await ordered(method);
    const response = await paymentRequest(f, { payer, ...(method === 'credit_card' && { card }) });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ paymentStatus: 'pending', paymentMethod: method });
    for (const key of ['idempotencyKey', 'inputHash', 'externalPaymentId', 'payer', 'token', 'attemptId']) expect(response.body.data).not.toHaveProperty(key);
    expect(JSON.stringify(await Order.findById(f.order.id))).not.toContain(card.token);
    expect(paymentAdapter.create.mock.calls[0][0].order.totalInCents).toBe(5523);
    expect(paymentAdapter.create.mock.calls[0][0].order.orderNumber).toBe(f.order.orderNumber);
  });
  it('exige autenticação para criar e consultar', async () => {
    const f = await ordered();
    const path = `/api/v1/orders/${f.order.id}/payments`;
    expect((await request(app).post(path).send({ payer })).status).toBe(401);
    expect((await request(app).get(path)).status).toBe(401);
  });
  it.each(['customer', 'admin'])('isola pedidos para %s', async (role) => {
    const f = await ordered();
    const outsider = await account(role);
    expect((await paymentRequest({ ...f, ...outsider })).status).toBe(404);
    expect((await request(app).get(`/api/v1/orders/${f.order.id}/payments`).set('Authorization', outsider.auth)).status).toBe(404);
  });
  it('retorna 404 para pedido ausente e 400 para ID inválido', async () => {
    const f = await account();
    expect((await paymentRequest({ ...f, order: { id: new mongoose.Types.ObjectId() } })).status).toBe(404);
    expect((await paymentRequest({ ...f, order: { id: 'invalid' } })).status).toBe(400);
  });
  it.each([{ cardNumber: '4111111111111111' }, { cvv: '123' }, { expiration: '12/30' }, { transactionAmount: 1 }, { token: 'bad' }, { card: { ...card, cvv: '123' } }])('rejeita dados de cartão e campos desconhecidos %j', async (extra) => {
    const f = await ordered();
    expect((await paymentRequest(f, { payer, ...extra })).status).toBe(400);
    expect(paymentAdapter.create).not.toHaveBeenCalled();
  });
  it.each(['cancelled', 'shipped', 'delivered'])('rejeita pedido %s', async (status) => {
    const f = await ordered();
    await Order.updateOne({ _id: f.order.id }, { status });
    expect((await paymentRequest(f)).status).toBe(400);
  });
  it('retry de indisponibilidade preserva chave, pedido e estoque', async () => {
    const f = await ordered();
    paymentAdapter.create.mockRejectedValueOnce(new AppError('Provedor externo indisponível.', 503));
    expect((await paymentRequest(f)).status).toBe(503);
    expect((await paymentRequest(f)).status).toBe(200);
    expect((await paymentRequest(f)).status).toBe(200);
    expect(paymentAdapter.create).toHaveBeenCalledTimes(2);
    expect(paymentAdapter.create.mock.calls[0][0].idempotencyKey).toBe(paymentAdapter.create.mock.calls[1][0].idempotencyKey);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(f.product.id)).stock).toBe(8);
    expect((await User.findById(f.user.id)).cart.items).toHaveLength(0);
  });
  it('impede alterar dados de tentativa ambígua', async () => {
    const f = await ordered('credit_card');
    paymentAdapter.create.mockRejectedValueOnce(new AppError('Timeout.', 503));
    expect((await paymentRequest(f, { payer, card })).status).toBe(503);
    expect((await paymentRequest(f, { payer, card: { ...card, token: 'another-token-generated-sdk' } })).status).toBe(409);
  });
  it('serializa solicitações concorrentes com lease no banco', async () => {
    const f = await ordered();
    const original = paymentAdapter.create.getMockImplementation();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    paymentAdapter.create.mockImplementation(async (input) => { await gate; return original(input); });
    const first = paymentRequest(f).then((r) => r);
    await vi.waitFor(() => expect(paymentAdapter.create).toHaveBeenCalledTimes(1));
    expect((await paymentRequest(f)).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
  it('bloqueia alteração financeira administrativa de pagamento integrado', async () => {
    const f = await paying();
    const admin = await account('admin');
    expect((await request(app).patch(`/api/v1/admin/orders/${f.order.id}/payment-status`).set('Authorization', admin.auth).send({ paymentStatus: 'paid' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/admin/orders/${f.order.id}/status`).set('Authorization', admin.auth).send({ status: 'cancelled' })).status).toBe(400);
  });
});

describe('webhook autenticado e idempotente', () => {
  it('recupera pagamento criado no provedor cuja resposta HTTP foi perdida', async () => {
    const f = await ordered();
    const original = paymentAdapter.create.getMockImplementation();
    paymentAdapter.create.mockImplementationOnce(async (input) => {
      await original(input);
      throw new AppError('Timeout.', 503);
    });
    expect((await paymentRequest(f)).status).toBe(503);
    expect((await Order.findById(f.order.id)).payment.externalPaymentId).toBeUndefined();
    lastPayment.status = 'paid';
    expect((await webhook()).status).toBe(200);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('paid');
    expect(paymentAdapter.create).toHaveBeenCalledTimes(1);
  });
  it('consulta provedor, aprova atomicamente e não duplica histórico nem estoque', async () => {
    const f = await paying();
    lastPayment.status = 'paid';
    expect((await webhook()).status).toBe(200);
    expect((await webhook()).status).toBe(200);
    expect(paymentAdapter.get).toHaveBeenCalledWith('123456');
    const order = await Order.findById(f.order.id);
    expect(order.paymentStatus).toBe('paid');
    expect(order.payment.paidAt).toBeInstanceOf(Date);
    expect(order.status).toBe('pending');
    expect(order.statusHistory.filter((h) => h.status === 'paid')).toHaveLength(1);
    expect((await Product.findById(f.product.id)).stock).toBe(8);
  });
  it('não confia no status recebido no body', async () => {
    const f = await paying();
    expect((await webhook({ body: { type: 'payment', data: { id: '123456' }, status: 'approved' } })).status).toBe(200);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('pending');
  });
  it.each(['ts=1,v1=bad', `ts=${Date.now()},v1=${'0'.repeat(64)}`])('rejeita assinatura inválida', async (signature) => {
    expect((await webhook({ signature })).status).toBe(401);
    expect(paymentAdapter.get).not.toHaveBeenCalled();
  });
  it('rejeita assinatura vencida e body com ID diferente', async () => {
    expect((await webhook({ ts: String(Date.now() - 600000) })).status).toBe(401);
    expect((await webhook({ body: { type: 'payment', data: { id: '999' } } })).status).toBe(401);
  });
  it.each([{ amountInCents: 1 }, { currency: 'USD' }, { attemptId: 'other' }, { method: 'credit_card' }, { externalPaymentId: '999' }])('rejeita divergência %j', async (change) => {
    const f = await paying();
    Object.assign(lastPayment, change, { status: 'paid' });
    expect((await webhook()).status).toBe(400);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('pending');
  });
  it('ignora referência desconhecida com sucesso', async () => {
    const f = await paying();
    lastPayment.reference = 'EV-UNKNOWN';
    lastPayment.status = 'paid';
    expect((await webhook()).status).toBe(200);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('pending');
  });
  it('falha confirmatória não altera pedido', async () => {
    const f = await paying();
    paymentAdapter.get.mockRejectedValueOnce(new AppError('Solicitação recusada pelo provedor externo.', 502));
    expect((await webhook()).status).toBe(502);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('pending');
  });
  it('registra rejeição sem restaurar estoque', async () => {
    const f = await paying();
    lastPayment.status = 'failed';
    expect((await webhook()).status).toBe(200);
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('failed');
    expect((await Product.findById(f.product.id)).stock).toBe(8);
  });
  it('reembolsa após aprovação e ignora eventos antigos', async () => {
    const f = await paying();
    for (const status of ['paid', 'pending', 'failed', 'refunded', 'paid']) {
      lastPayment.status = status;
      expect((await webhook()).status).toBe(200);
    }
    const order = await Order.findById(f.order.id);
    expect(order.paymentStatus).toBe('refunded');
    expect(order.statusHistory.filter((h) => h.type === 'payment').map((h) => h.status)).toEqual(['pending', 'paid', 'refunded']);
  });
  it('ignora estado desconhecido e transição inválida', async () => {
    const f = await paying();
    for (const status of [undefined, 'refunded']) {
      lastPayment.status = status;
      expect((await webhook()).status).toBe(200);
    }
    expect((await Order.findById(f.order.id)).paymentStatus).toBe('pending');
  });
  it('eventos simultâneos não duplicam histórico', async () => {
    const f = await paying();
    lastPayment.status = 'paid';
    const responses = await Promise.all([webhook(), webhook(), webhook()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await Order.findById(f.order.id)).statusHistory.filter((h) => h.status === 'paid')).toHaveLength(1);
  });
});
