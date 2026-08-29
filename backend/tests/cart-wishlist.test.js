import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';

async function authorization(email = 'cliente@example.com') {
  const response = await request(app).post('/api/v1/auth/register').send({
    name: 'Cliente Teste', email, password: 'senha-segura-123',
  });
  return `Bearer ${response.body.data.accessToken}`;
}

async function product(overrides = {}) {
  const category = await Category.create({
    name: `Categoria ${new mongoose.Types.ObjectId()}`,
    slug: `categoria-${new mongoose.Types.ObjectId()}`,
  });
  return Product.create({
    name: 'Vela Lavanda',
    slug: `vela-${new mongoose.Types.ObjectId()}`,
    sku: `SKU-${new mongoose.Types.ObjectId()}`,
    description: 'Vela artesanal',
    category: category._id,
    fragrance: 'Lavanda',
    price: 50,
    stock: 10,
    shipping: { weightKg: 0.3, heightCm: 8, widthCm: 7, lengthCm: 7 },
    ...overrides,
  });
}

const sensitiveFields = ['passwordHash', 'refreshTokenHash', 'cpf', 'role', 'salesCount', 'sku', 'shipping'];

describe('carrinho', () => {
  it('exige autenticação e retorna carrinho vazio', async () => {
    expect((await request(app).get('/api/v1/cart')).status).toBe(401);
    const response = await request(app).get('/api/v1/cart').set('Authorization', await authorization());
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      items: [], distinctItemCount: 0, totalQuantity: 0, subtotal: 0,
    });
  });

  it('adiciona, soma repetição e atualiza a quantidade absoluta', async () => {
    const auth = await authorization();
    const item = await product();
    const first = await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity: 2 });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ distinctItemCount: 1, totalQuantity: 2, subtotal: 100 });

    const repeated = await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity: 3 });
    expect(repeated.body.data).toMatchObject({ distinctItemCount: 1, totalQuantity: 5, subtotal: 250 });

    const updated = await request(app).patch(`/api/v1/cart/items/${item.id}`)
      .set('Authorization', auth).send({ quantity: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ totalQuantity: 1, subtotal: 50 });
    expect(updated.body.data.updatedAt).toBeTruthy();
  });

  it('remove um item e esvazia o carrinho de forma idempotente', async () => {
    const auth = await authorization();
    const [first, second] = await Promise.all([product(), product({ name: 'Vela Dois' })]);
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: first.id, quantity: 1 });
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: second.id, quantity: 1 });
    expect((await request(app).delete(`/api/v1/cart/items/${first.id}`).set('Authorization', auth)).status).toBe(204);
    expect((await request(app).get('/api/v1/cart').set('Authorization', auth)).body.data.items).toHaveLength(1);
    expect((await request(app).delete('/api/v1/cart').set('Authorization', auth)).status).toBe(204);
    expect((await request(app).delete('/api/v1/cart').set('Authorization', auth)).status).toBe(204);
    expect((await request(app).get('/api/v1/cart').set('Authorization', auth)).body.data.items).toHaveLength(0);
  });

  it('rejeita produto inexistente ou inativo', async () => {
    const auth = await authorization();
    const inactive = await product({ isActive: false });
    expect((await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 })).status).toBe(404);
    expect((await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: inactive.id, quantity: 1 })).status).toBe(404);
  });

  it.each([0, -1, 1.5, '2', null])('rejeita quantidade inválida: %s', async (quantity) => {
    const auth = await authorization();
    const item = await product();
    expect((await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity })).status).toBe(400);
  });

  it('rejeita estoque excedido na adição, soma e atualização', async () => {
    const auth = await authorization();
    const item = await product({ stock: 3 });
    expect((await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity: 4 })).status).toBe(400);
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: item.id, quantity: 2 });
    expect((await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity: 2 })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/cart/items/${item.id}`).set('Authorization', auth)
      .send({ quantity: 4 })).status).toBe(400);
  });

  it('preserva somas em adições concorrentes sem duplicar o produto', async () => {
    const auth = await authorization();
    const item = await product({ stock: 10 });
    await Promise.all([
      request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: item.id, quantity: 1 }),
      request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: item.id, quantity: 1 }),
    ]);
    const response = await request(app).get('/api/v1/cart').set('Authorization', auth);
    expect(response.body.data).toMatchObject({ distinctItemCount: 1, totalQuantity: 2 });
  });

  it('usa preço promocional e não expõe campos sensíveis ou internos', async () => {
    const auth = await authorization();
    const item = await product({ price: 50, promotionalPrice: 35 });
    const response = await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity: 2 });
    expect(response.body.data.subtotal).toBe(70);
    expect(response.body.data.items[0]).toMatchObject({ unitPrice: 35, lineTotal: 70 });
    for (const field of sensitiveFields) expect(JSON.stringify(response.body)).not.toContain(`\"${field}\"`);
  });

  it('marca itens indisponíveis e os exclui do subtotal sem removê-los', async () => {
    const auth = await authorization();
    const item = await product();
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: item.id, quantity: 2 });
    await Product.updateOne({ _id: item._id }, { stock: 0 });
    const response = await request(app).get('/api/v1/cart').set('Authorization', auth);
    expect(response.body.data.subtotal).toBe(0);
    expect(response.body.data.items[0]).toMatchObject({ available: false, unavailableReason: 'out_of_stock' });
  });

  it('mantém referência de produto removido como item indisponível', async () => {
    const auth = await authorization();
    const item = await product();
    await request(app).post('/api/v1/cart/items').set('Authorization', auth).send({ productId: item.id, quantity: 1 });
    await Product.deleteOne({ _id: item._id });
    const response = await request(app).get('/api/v1/cart').set('Authorization', auth);
    expect(response.body.data.items[0]).toMatchObject({
      product: null, quantity: 1, available: false, unavailableReason: 'removed',
    });
    expect(response.body.data.subtotal).toBe(0);
  });

  it('rejeita usuário inativo e isola carrinhos', async () => {
    const firstAuth = await authorization('primeiro@example.com');
    const secondAuth = await authorization('segundo@example.com');
    const item = await product();
    await request(app).post('/api/v1/cart/items').set('Authorization', firstAuth).send({ productId: item.id, quantity: 1 });
    expect((await request(app).get('/api/v1/cart').set('Authorization', secondAuth)).body.data.items).toHaveLength(0);
    await User.updateOne({ email: 'primeiro@example.com' }, { isActive: false });
    expect((await request(app).get('/api/v1/cart').set('Authorization', firstAuth)).status).toBe(401);
  });

  it('rejeita campos desconhecidos e ObjectId inválido', async () => {
    const auth = await authorization();
    const item = await product();
    expect((await request(app).post('/api/v1/cart/items').set('Authorization', auth)
      .send({ productId: item.id, quantity: 1, price: 1 })).status).toBe(400);
    expect((await request(app).delete('/api/v1/cart/items/invalido').set('Authorization', auth)).status).toBe(400);
  });
});

describe('lista de desejos', () => {
  it('exige autenticação e retorna lista vazia', async () => {
    expect((await request(app).get('/api/v1/wishlist')).status).toBe(401);
    const response = await request(app).get('/api/v1/wishlist').set('Authorization', await authorization());
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], itemCount: 0 });
  });

  it('adiciona de forma idempotente sem expor campos sensíveis', async () => {
    const auth = await authorization();
    const item = await product();
    await request(app).post('/api/v1/wishlist/items').set('Authorization', auth).send({ productId: item.id });
    const response = await request(app).post('/api/v1/wishlist/items').set('Authorization', auth).send({ productId: item.id });
    expect(response.status).toBe(201);
    expect(response.body.data.itemCount).toBe(1);
    for (const field of sensitiveFields) expect(JSON.stringify(response.body)).not.toContain(`\"${field}\"`);
  });

  it('remove item ausente ou existente e esvazia de forma idempotente', async () => {
    const auth = await authorization();
    const item = await product();
    await request(app).post('/api/v1/wishlist/items').set('Authorization', auth).send({ productId: item.id });
    expect((await request(app).delete(`/api/v1/wishlist/items/${item.id}`).set('Authorization', auth)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/wishlist/items/${item.id}`).set('Authorization', auth)).status).toBe(204);
    expect((await request(app).delete('/api/v1/wishlist').set('Authorization', auth)).status).toBe(204);
  });

  it('rejeita produto inexistente, inativo, ID inválido e campos desconhecidos', async () => {
    const auth = await authorization();
    const inactive = await product({ isActive: false });
    expect((await request(app).post('/api/v1/wishlist/items').set('Authorization', auth)
      .send({ productId: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
    expect((await request(app).post('/api/v1/wishlist/items').set('Authorization', auth)
      .send({ productId: inactive.id })).status).toBe(404);
    expect((await request(app).delete('/api/v1/wishlist/items/invalido').set('Authorization', auth)).status).toBe(400);
    expect((await request(app).post('/api/v1/wishlist/items').set('Authorization', auth)
      .send({ productId: inactive.id, role: 'admin' })).status).toBe(400);
  });

  it('omite produtos removidos ou inativos que já estavam na lista', async () => {
    const auth = await authorization();
    const item = await product();
    await request(app).post('/api/v1/wishlist/items').set('Authorization', auth).send({ productId: item.id });
    await Product.updateOne({ _id: item._id }, { isActive: false });
    expect((await request(app).get('/api/v1/wishlist').set('Authorization', auth)).body.data.itemCount).toBe(0);
  });

  it('rejeita usuário inativo e isola listas', async () => {
    const firstAuth = await authorization('primeiro@example.com');
    const secondAuth = await authorization('segundo@example.com');
    const item = await product();
    await request(app).post('/api/v1/wishlist/items').set('Authorization', firstAuth).send({ productId: item.id });
    expect((await request(app).get('/api/v1/wishlist').set('Authorization', secondAuth)).body.data.itemCount).toBe(0);
    await User.updateOne({ email: 'primeiro@example.com' }, { isActive: false });
    expect((await request(app).get('/api/v1/wishlist').set('Authorization', firstAuth)).status).toBe(401);
  });
});
