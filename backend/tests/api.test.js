import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';

const categoryData = (suffix = '') => ({
  name: `Velas${suffix}`,
  slug: `velas${suffix}`.toLowerCase(),
  description: 'Velas aromáticas',
});

const productData = (category, overrides = {}) => ({
  name: 'Vela Lavanda',
  slug: 'vela-lavanda',
  sku: 'VELA-001',
  description: 'Vela artesanal perfumada',
  category: category.toString(),
  fragrance: 'Lavanda',
  price: 49.9,
  stock: 10,
  shipping: { weightKg: 0.3, heightCm: 8, widthCm: 7, lengthCm: 7 },
  ...overrides,
});

describe('rotas básicas', () => {
  it('mantém health, test-error e rota inexistente funcionando', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);

    const testError = await request(app).get('/api/v1/test-error');
    expect(testError.status).toBe(400);
    expect(testError.body.message).toBe('Erro de teste da API');

    const missing = await request(app).get('/api/v1/inexistente');
    expect(missing.status).toBe(404);
  });
});

describe('categorias', () => {
  it('cria uma categoria válida e rejeita entrada inválida ou protegida', async () => {
    const created = await request(app).post('/api/v1/categories').send(categoryData());
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('Velas');

    expect((await request(app).post('/api/v1/categories').send({ slug: 'sem-nome' })).status).toBe(400);
    expect((await request(app).post('/api/v1/categories').send({ ...categoryData('x'), salesCount: 20 })).status).toBe(400);
  });

  it('retorna 409 para nome ou slug duplicado', async () => {
    await Category.create(categoryData());
    const response = await request(app).post('/api/v1/categories').send(categoryData());
    expect(response.status).toBe(409);
  });

  it('lista com busca, filtro e paginação', async () => {
    await Category.create([categoryData('A'), categoryData('B'), { ...categoryData('C'), isActive: false }]);
    const response = await request(app).get('/api/v1/categories?page=1&limit=1&sort=-name&search=Velas&isActive=true');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 1, totalItems: 2, totalPages: 2, hasNextPage: true, hasPreviousPage: false });
  });

  it('busca por ID, valida ID e retorna 404', async () => {
    const category = await Category.create(categoryData());
    expect((await request(app).get(`/api/v1/categories/${category.id}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/categories/invalido')).status).toBe(400);
    expect((await request(app).get(`/api/v1/categories/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it('atualiza e exclui uma categoria', async () => {
    const category = await Category.create(categoryData());
    const updated = await request(app).patch(`/api/v1/categories/${category.id}`).send({ description: 'Nova' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.description).toBe('Nova');
    expect((await request(app).delete(`/api/v1/categories/${category.id}`)).status).toBe(204);
  });

  it('impede exclusão quando há produto vinculado', async () => {
    const category = await Category.create(categoryData());
    await Product.create(productData(category._id));
    const response = await request(app).delete(`/api/v1/categories/${category.id}`);
    expect(response.status).toBe(409);
  });
});

describe('produtos', () => {
  it('cria produto válido e popula a categoria', async () => {
    const category = await Category.create(categoryData());
    const response = await request(app).post('/api/v1/products').send(productData(category._id));
    expect(response.status).toBe(201);
    expect(response.body.data.category.name).toBe('Velas');
    expect(response.body.data.sku).toBe('VELA-001');
  });

  it('rejeita categoria inexistente e dados inválidos', async () => {
    const missing = await request(app).post('/api/v1/products').send(productData(new mongoose.Types.ObjectId()));
    expect(missing.status).toBe(404);
    const invalid = await request(app).post('/api/v1/products').send({ name: 'Incompleto' });
    expect(invalid.status).toBe(400);
  });

  it('retorna 409 para SKU ou slug duplicado', async () => {
    const category = await Category.create(categoryData());
    await Product.create(productData(category._id));
    const response = await request(app).post('/api/v1/products').send(productData(category._id, { slug: 'outro' }));
    expect(response.status).toBe(409);
  });

  it('lista e pagina produtos', async () => {
    const category = await Category.create(categoryData());
    await Product.create([
      productData(category._id),
      productData(category._id, { name: 'Vela Baunilha', slug: 'vela-baunilha', sku: 'VELA-002' }),
    ]);
    const response = await request(app).get('/api/v1/products?page=2&limit=1');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({ page: 2, totalItems: 2, hasPreviousPage: true });
  });

  it('aplica busca e todos os filtros', async () => {
    const category = await Category.create(categoryData());
    await Product.create([
      productData(category._id, { isFeatured: true, isActive: true, tags: ['relaxante'] }),
      productData(category._id, { name: 'Outra', slug: 'outra', sku: 'OUTRA', fragrance: 'Baunilha', price: 10, stock: 0 }),
    ]);
    const query = `search=relaxante&category=${category.id}&fragrance=lavanda&minPrice=40&maxPrice=60&isFeatured=true&isActive=true&inStock=true`;
    const response = await request(app).get(`/api/v1/products?${query}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].sku).toBe('VELA-001');
  });

  it('aceita ordenação permitida e rejeita ordenação ou faixa inválida', async () => {
    expect((await request(app).get('/api/v1/products?sort=price')).status).toBe(200);
    expect((await request(app).get('/api/v1/products?sort=password')).status).toBe(400);
    expect((await request(app).get('/api/v1/products?minPrice=20&maxPrice=10')).status).toBe(400);
  });

  it('busca por ID, valida ID e retorna produto inexistente', async () => {
    const category = await Category.create(categoryData());
    const product = await Product.create(productData(category._id));
    expect((await request(app).get(`/api/v1/products/${product.id}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/products/abc')).status).toBe(400);
    expect((await request(app).get(`/api/v1/products/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it('atualiza, valida nova categoria e exclui produto', async () => {
    const category = await Category.create(categoryData());
    const product = await Product.create(productData(category._id));
    const updated = await request(app).patch(`/api/v1/products/${product.id}`).send({ stock: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.stock).toBe(3);
    expect((await request(app).patch(`/api/v1/products/${product.id}`).send({ category: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/products/${product.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/products/${product.id}`)).status).toBe(404);
  });
});
