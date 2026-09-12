import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import Category from '../src/models/Category.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';

// Legacy order regression tests isolate the shipping service boundary.
vi.mock('../src/services/shipping.service.js', async (importOriginal) => ({
  ...await importOriginal(),
  selectShipping: vi.fn(async () => ({ provider: 'melhor_envio', serviceId: '1', serviceName: 'Teste', price: 0, estimatedDays: 3 })),
}));

const address = {
  recipientName: 'Cliente Teste', zipCode: '69000-000', street: 'Rua das Velas',
  number: '10', complement: 'Casa', neighborhood: 'Centro', city: 'Manaus', state: 'AM',
};
const body = (overrides = {}) => ({ shippingQuoteId: 'a'.repeat(48), shippingServiceId: '1', shippingAddress: address, paymentMethod: 'pix', ...overrides });

async function account(email = 'cliente@example.com', role = 'customer') {
  const response = await request(app).post('/api/v1/auth/register').send({
    name: role === 'admin' ? 'Administrador' : 'Cliente Teste', email, password: 'senha-segura-123',
  });
  if (role === 'admin') await User.updateOne({ email }, { role: 'admin' });
  return { authorization: `Bearer ${response.body.data.accessToken}`, user: await User.findOne({ email }) };
}

async function product(overrides = {}) {
  const id = new mongoose.Types.ObjectId();
  const category = await Category.create({ name: `Categoria ${id}`, slug: `categoria-${id}` });
  return Product.create({
    name: 'Vela Lavanda', slug: `vela-${id}`, sku: `SKU-${id}`, description: 'Vela artesanal',
    category: category._id, fragrance: 'Lavanda', price: 49.9, promotionalPrice: null,
    stock: 10, images: [{ url: 'https://example.com/vela.jpg', isMain: true }],
    shipping: { weightKg: 0.3, heightCm: 8, widthCm: 7, lengthCm: 7 }, ...overrides,
  });
}

async function add(authorization, item, quantity = 1) {
  return request(app).post('/api/v1/cart/items').set('Authorization', authorization)
    .send({ productId: item.id, quantity });
}

async function createReadyOrder(email = 'cliente@example.com', productOverrides = {}, quantity = 2) {
  const credentials = await account(email);
  const item = await product(productOverrides);
  await add(credentials.authorization, item, quantity);
  const response = await request(app).post('/api/v1/orders').set('Authorization', credentials.authorization).send(body());
  return { ...credentials, item, response, order: await Order.findOne({ user: credentials.user._id }) };
}

const forbiddenFields = ['__v', 'passwordHash', 'refreshTokenHash', 'cpf', 'payment.externalPaymentId'];

describe('criação de pedidos', () => {
  it('exige autenticação e rejeita carrinho vazio', async () => {
    expect((await request(app).post('/api/v1/orders').send(body())).status).toBe(401);
    const { authorization } = await account();
    expect((await request(app).post('/api/v1/orders').set('Authorization', authorization).send(body())).status).toBe(400);
  });

  it('cria snapshots, calcula valores, baixa estoque e limpa o carrinho', async () => {
    const { response, item, user } = await createReadyOrder('snapshot@example.com', { price: 25.5, promotionalPrice: 20 }, 2);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: 'pending', paymentStatus: 'pending', paymentMethod: 'pix', distinctItemCount: 1,
      totalQuantity: 2, subtotal: 40, shippingAmount: 0, discountAmount: 0, total: 40,
      shippingAddress: address,
    });
    expect(response.body.data.items[0]).toMatchObject({
      productId: item.id, name: item.name, sku: item.sku, quantity: 2,
      unitPrice: 20, lineTotal: 40, imageUrl: 'https://example.com/vela.jpg',
    });
    expect(response.body.data.orderNumber).toMatch(/^EV-[A-F0-9]{18}$/);
    expect((await Product.findById(item._id)).stock).toBe(8);
    const storedUser = await User.findById(user._id);
    expect(storedUser.cart.items).toHaveLength(0);
    expect(storedUser.cart.updatedAt).toBeInstanceOf(Date);
    for (const field of forbiddenFields) expect(JSON.stringify(response.body)).not.toContain(`\"${field}\"`);
  });

  it('gera números públicos únicos', async () => {
    const first = await createReadyOrder('numero1@example.com');
    const second = await createReadyOrder('numero2@example.com');
    expect(first.response.body.data.orderNumber).not.toBe(second.response.body.data.orderNumber);
  });

  it('valida endereço, método e rejeita campos calculados ou protegidos', async () => {
    const { authorization } = await account();
    const item = await product();
    await add(authorization, item);
    const requests = [
      body({ shippingAddress: { ...address, state: 'Amazonas' } }),
      body({ paymentMethod: 'card' }), body({ total: 1 }), body({ userId: new mongoose.Types.ObjectId().toString() }),
    ];
    for (const payload of requests) {
      expect((await request(app).post('/api/v1/orders').set('Authorization', authorization).send(payload)).status).toBe(400);
    }
  });

  it.each([
    ['removido', { remove: true }, 404], ['inativo', { isActive: false }, 400],
    ['sem estoque', { stock: 0 }, 400], ['estoque insuficiente', { stock: 1, quantity: 2 }, 400],
  ])('rejeita produto %s', async (label, options, expected) => {
    void label;
    const { authorization, user } = await account(`${new mongoose.Types.ObjectId()}@example.com`);
    const item = await product({ stock: options.stock ?? 10, isActive: options.isActive ?? true });
    await User.updateOne({ _id: user._id }, { $set: { 'cart.items': [{ product: item._id, quantity: options.quantity ?? 1 }] } });
    if (options.remove) await Product.deleteOne({ _id: item._id });
    expect((await request(app).post('/api/v1/orders').set('Authorization', authorization).send(body())).status).toBe(expected);
  });

  it('compensa todas as reservas se a criação falhar', async () => {
    const { authorization } = await account();
    const first = await product({ stock: 3 });
    const second = await product({ name: 'Vela Baunilha', stock: 4 });
    await add(authorization, first, 2);
    await add(authorization, second, 3);
    const spy = vi.spyOn(Order, 'create').mockRejectedValueOnce(new Error('falha simulada'));
    const response = await request(app).post('/api/v1/orders').set('Authorization', authorization).send(body());
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect((await Product.findById(first._id)).stock).toBe(3);
    expect((await Product.findById(second._id)).stock).toBe(4);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('permite somente uma de duas criações concorrentes disputando estoque', async () => {
    const first = await account('concorrente1@example.com');
    const second = await account('concorrente2@example.com');
    const item = await product({ stock: 1 });
    await Promise.all([add(first.authorization, item), add(second.authorization, item)]);
    // Both requests must read available stock before either starts reserving it.
    const originalFind = Product.find.bind(Product);
    let readers = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const findSpy = vi.spyOn(Product, 'find').mockImplementation(async (...args) => {
      const products = await originalFind(...args);
      readers += 1;
      if (readers === 2) release();
      await gate;
      return products;
    });
    const responses = await Promise.all([
      request(app).post('/api/v1/orders').set('Authorization', first.authorization).send(body()),
      request(app).post('/api/v1/orders').set('Authorization', second.authorization).send(body()),
    ]);
    findSpy.mockRestore();
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await Product.findById(item._id)).stock).toBe(0);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('rejeita usuário inativo', async () => {
    const { authorization, user } = await account();
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await request(app).post('/api/v1/orders').set('Authorization', authorization).send(body())).status).toBe(401);
  });
});

describe('consulta de pedidos do cliente', () => {
  it('lista vazio, pagina, filtra e valida query', async () => {
    const { authorization } = await account();
    expect((await request(app).get('/api/v1/orders').set('Authorization', authorization)).body.data).toEqual([]);
    await createReadyOrder('lista1@example.com');
    const second = await createReadyOrder('lista2@example.com');
    const page = await request(app).get('/api/v1/orders?page=1&limit=1&status=pending&paymentStatus=pending&sort=total')
      .set('Authorization', second.authorization);
    expect(page.status).toBe(200);
    expect(page.body.pagination).toMatchObject({ page: 1, limit: 1, totalItems: 1 });
    expect((await request(app).get('/api/v1/orders?role=admin').set('Authorization', authorization)).status).toBe(400);
    expect((await request(app).get('/api/v1/orders?status=unknown').set('Authorization', authorization)).status).toBe(400);
  });

  it('consulta apenas o próprio pedido e preserva snapshots após remoção do produto', async () => {
    const first = await createReadyOrder('dono@example.com');
    const outsider = await account('outro@example.com');
    await Product.deleteOne({ _id: first.item._id });
    const own = await request(app).get(`/api/v1/orders/${first.order.id}`).set('Authorization', first.authorization);
    expect(own.status).toBe(200);
    expect(own.body.data.items[0].name).toBe('Vela Lavanda');
    expect((await request(app).get(`/api/v1/orders/${first.order.id}`).set('Authorization', outsider.authorization)).status).toBe(404);
    expect((await request(app).get(`/api/v1/orders/${new mongoose.Types.ObjectId()}`).set('Authorization', first.authorization)).status).toBe(404);
    expect((await request(app).get('/api/v1/orders/invalido').set('Authorization', first.authorization)).status).toBe(400);
  });
});

describe('administração de pedidos', () => {
  it('exige autenticação e papel de administrador', async () => {
    expect((await request(app).get('/api/v1/admin/orders')).status).toBe(401);
    const { authorization } = await account();
    expect((await request(app).get('/api/v1/admin/orders').set('Authorization', authorization)).status).toBe(403);
  });

  it('lista, filtra e consulta todos com resumo seguro do cliente', async () => {
    const created = await createReadyOrder('comprador@example.com');
    const admin = await account('admin@example.com', 'admin');
    const list = await request(app).get(`/api/v1/admin/orders?user=${created.user.id}&orderNumber=${created.order.orderNumber}&from=2020-01-01&sort=-total`)
      .set('Authorization', admin.authorization);
    expect(list.status).toBe(200);
    expect(list.body.data[0].customer).toEqual({ id: created.user.id, name: 'Cliente Teste', email: 'comprador@example.com' });
    const detail = await request(app).get(`/api/v1/admin/orders/${created.order.id}`).set('Authorization', admin.authorization);
    expect(detail.status).toBe(200);
    for (const field of forbiddenFields) expect(JSON.stringify(detail.body)).not.toContain(`\"${field}\"`);
  });

  it('atualiza estados, registra histórico e trata repetição como idempotente', async () => {
    const created = await createReadyOrder();
    const admin = await account('admin@example.com', 'admin');
    const endpoint = `/api/v1/admin/orders/${created.order.id}`;
    const confirmed = await request(app).patch(`${endpoint}/status`).set('Authorization', admin.authorization).send({ status: 'confirmed' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.statusHistory.at(-1)).toMatchObject({ type: 'order', status: 'confirmed' });
    const repeated = await request(app).patch(`${endpoint}/status`).set('Authorization', admin.authorization).send({ status: 'confirmed' });
    expect(repeated.status).toBe(200);
    const paid = await request(app).patch(`${endpoint}/payment-status`).set('Authorization', admin.authorization).send({ paymentStatus: 'paid' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('paid');
  });

  it('rejeita transição, estado, campos desconhecidos e IDs inválidos', async () => {
    const created = await createReadyOrder();
    const admin = await account('admin@example.com', 'admin');
    const endpoint = `/api/v1/admin/orders/${created.order.id}/status`;
    expect((await request(app).patch(endpoint).set('Authorization', admin.authorization).send({ status: 'delivered' })).status).toBe(400);
    expect((await request(app).patch(endpoint).set('Authorization', admin.authorization).send({ status: 'unknown' })).status).toBe(400);
    expect((await request(app).patch(endpoint).set('Authorization', admin.authorization).send({ status: 'confirmed', user: 'x' })).status).toBe(400);
    expect((await request(app).get('/api/v1/admin/orders/invalido').set('Authorization', admin.authorization)).status).toBe(400);
    expect((await request(app).get('/api/v1/admin/orders?user=invalido').set('Authorization', admin.authorization)).status).toBe(400);
  });
});
