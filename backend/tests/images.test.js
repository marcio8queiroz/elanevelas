import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import User from '../src/models/User.js';
import ImageAsset from '../src/models/ImageAsset.js';
import { createTokenPair } from '../src/services/token.service.js';
import { migrateImageIds } from '../src/services/imageMigration.service.js';
import { editProductImage, uploadImage } from '../src/services/image.service.js';
import { processImageCleanup } from '../src/services/imageCleanup.service.js';

let adminToken, customerToken, product, category, adapter, png;
const base = () => `/api/v1/products/${product.id}/images`;
const categoryBase = () => `/api/v1/categories/${category.id}/image`;
const authorized = (method, path) => request(app)[method](path).auth(adminToken, { type: 'bearer' });
const upload = (path = base(), method = 'post') => authorized(method, path).attach('file', png, { filename: 'candle.png', contentType: 'image/png' });
const legacyImage = (extra = {}) => ({ url: 'https://example.com/old.jpg', ...extra });

beforeEach(async () => {
  const users = await User.create([
    { name: 'Admin', email: 'admin-images@example.com', role: 'admin', passwordHash: 'unused' },
    { name: 'Customer', email: 'customer-images@example.com', passwordHash: 'unused' },
  ]);
  adminToken = createTokenPair(users[0]).accessToken;
  customerToken = createTokenPair(users[1]).accessToken;
  category = await Category.create({ name: 'Images', slug: 'images' });
  product = await Product.create({ name: 'Candle', slug: 'candle', sku: 'CANDLE', description: 'Test',
    category: category._id, fragrance: 'Lavender', price: 10, stock: 20,
    shipping: { weightKg: 0.3, heightCm: 8, widthCm: 8, lengthCm: 8 } });
  png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#123456' } }).png().toBuffer();
  adapter = { store: vi.fn(async ({ publicId }) => ({ url: `https://res.cloudinary.com/test/image/upload/${publicId}.webp` })),
    remove: vi.fn(async () => {}) };
  app.locals.imageAdapter = adapter;
});
afterEach(() => { delete app.locals.imageAdapter; vi.restoreAllMocks(); });

describe('upload e proteção de entrada', () => {
  it.each([
    ['patch', 'product-image'], ['patch', 'order'], ['delete', 'product-image'],
    ['put', 'category'], ['delete', 'category'],
  ])('protege %s %s antes de validar entrada', async (method, target) => {
    const path = target === 'category' ? categoryBase() : `${base()}/${target === 'order' ? 'order' : randomUUID()}`;
    expect((await request(app)[method](path).send({})).status).toBe(401);
    expect((await request(app)[method](path).auth(customerToken, { type: 'bearer' }).send({})).status).toBe(403);
    expect(adapter.store).not.toHaveBeenCalled();
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it.each([['anonymous', 401], ['customer', 403]])('rejeita %s antes do multipart e da integração', async (role, status) => {
    const req = request(app).post(base()).set('Content-Type', 'multipart/form-data; boundary=broken');
    if (role === 'customer') req.auth(customerToken, { type: 'bearer' });
    const response = await req.send('malformed body');
    expect(response.status).toBe(status);
    expect(adapter.store).not.toHaveBeenCalled();
    expect(await ImageAsset.countDocuments()).toBe(0);
  });

  it.each(['jpeg', 'png', 'webp'])('processa %s real e retorna somente campos públicos', async (format) => {
    const buffer = await sharp(png).toFormat(format).toBuffer();
    const response = await authorized('post', base()).field('alt', 'Vela azul')
      .attach('file', buffer, { filename: `image.${format}`, contentType: `image/${format}` });
    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ alt: 'Vela azul', isMain: true, width: 8, height: 6, format: 'webp' });
    expect(response.body.data[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(response.body)).not.toMatch(/publicId|imageRevision|elanevelas.*signature|buffer|base64/);
    const decoded = await sharp(adapter.store.mock.calls[0][0].buffer).metadata();
    expect(decoded.format).toBe('webp');
    expect((await ImageAsset.findOne()).state).toBe('retained');
  });

  it('ignora extensão e caminhos; identifica o conteúdo e gera a chave no servidor', async () => {
    const response = await authorized('post', base()).attach('file', png, { filename: '../../evil.svg', contentType: 'image/png' });
    expect(response.status).toBe(201);
    expect(adapter.store.mock.calls[0][0].publicId).toMatch(/^elanevelas\/[a-f0-9-]{36}$/);
    expect(adapter.store.mock.calls[0][0]).not.toHaveProperty('filename');
  });

  it('aceita exatamente 5 MiB e descarta bytes adicionais após a imagem ao reprocessar', async () => {
    const buffer = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length)]);
    const response = await authorized('post', base()).attach('file', buffer, { filename: 'padded.png', contentType: 'image/png' });
    expect(response.status).toBe(201);
    expect(adapter.store.mock.calls[0][0].buffer.length).toBeLessThan(1024);
  });

  it.each([
    ['sem arquivo', (r) => r.field('alt', 'Test'), 400],
    ['campo desconhecido', (r) => r.field('publicId', 'arbitrary').attach('file', png, 'a.png'), 400],
    ['URL remota', (r) => r.field('url', 'https://example.com/image.jpg'), 400],
    ['arquivos extras', (r) => r.attach('file', png, 'a.png').attach('file', png, 'b.png'), 400],
    ['campo de arquivo errado', (r) => r.attach('image', png, 'a.png'), 400],
    ['campo grande', (r) => r.field('alt', 'a'.repeat(801)).attach('file', png, 'a.png'), 413],
    ['alt longo', (r) => r.field('alt', 'a'.repeat(201)).attach('file', png, 'a.png'), 400],
    ['campos extras', (r) => r.field('alt', 'a').field('x', 'b').attach('file', png, 'a.png'), 400],
    ['arquivo grande', (r) => r.attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'a.png'), 413],
    ['MIME falsificado', (r) => r.attach('file', png, { filename: 'a.jpg', contentType: 'image/jpeg' }), 415],
    ['SVG disfarçado', (r) => r.attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.png'), 415],
    ['conteúdo não imagem', (r) => r.attach('file', Buffer.from('secret nonimage'), 'a.png'), 415],
    ['arquivo corrompido', (r) => r.attach('file', png.subarray(0, 35), 'a.png'), 400],
  ])('rejeita %s sem armazenar', async (_, build, status) => {
    const response = await build(authorized('post', base()));
    expect(response.status).toBe(status);
    expect(adapter.store).not.toHaveBeenCalled();
    expect(response.body).not.toHaveProperty('stack');
  });

  it.each([['invalid', 400], [new mongoose.Types.ObjectId().toString(), 404]])('valida recurso %s antes do arquivo', async (id, status) => {
    const response = await authorized('post', `/api/v1/products/${id}/images`).send({});
    expect(response.status).toBe(status);
    expect(adapter.store).not.toHaveBeenCalled();
  });

  it('rejeita JSON e queries desconhecidas', async () => {
    expect((await authorized('post', base()).send({ url: 'https://example.com/a.png' })).status).toBe(415);
    expect((await upload(`${base()}?transformation=unsafe`)).status).toBe(400);
  });

  it('ausência de configuração só afeta integração e não consultas ou alt', async () => {
    const first = (await upload()).body.data[0];
    delete app.locals.imageAdapter;
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '');
    try {
      expect((await upload()).status).toBe(503);
      expect((await request(app).get(base())).status).toBe(200);
      expect((await authorized('patch', `${base()}/${first.id}`).send({ alt: 'Local' })).status).toBe(200);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('regras do catálogo e concorrência', () => {
  it('mantém uma principal, edita alt, reordena e escolhe a primeira restante ao remover', async () => {
    const first = (await upload()).body.data[0];
    const second = (await upload()).body.data[1];
    let response = await authorized('patch', `${base()}/${second.id}`).send({ alt: 'Segunda', isMain: true });
    expect(response.status).toBe(200);
    expect(response.body.data.filter((image) => image.isMain).map((image) => image.id)).toEqual([second.id]);
    response = await authorized('patch', `${base()}/order`).send({ imageIds: [second.id, first.id] });
    expect(response.status).toBe(200);
    expect(response.body.data.map((image) => image.id)).toEqual([second.id, first.id]);
    expect(response.body.data[0].alt).toBe('Segunda');
    expect((await authorized('delete', `${base()}/${second.id}`)).status).toBe(204);
    response = await request(app).get(base());
    expect(response.body.data).toMatchObject([{ id: first.id, isMain: true }]);
    expect((await authorized('delete', `${base()}/${first.id}`)).status).toBe(204);
    expect((await request(app).get(base())).body.data).toEqual([]);
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it.each(['duplicate', 'missing', 'foreign'])('rejeita ordenação %s', async (kind) => {
    const first = (await upload()).body.data[0];
    const ids = kind === 'duplicate' ? [first.id, first.id] : kind === 'missing' ? [] : [randomUUID()];
    expect((await authorized('patch', `${base()}/order`).send({ imageIds: ids })).status).toBe(400);
  });

  it('imagem de outro produto é inexistente; false não pode desmarcar a única principal', async () => {
    const first = (await upload()).body.data[0];
    const other = await Product.create({ ...product.toObject(), _id: new mongoose.Types.ObjectId(), slug: 'other', sku: 'OTHER' });
    expect((await authorized('patch', `/api/v1/products/${other.id}/images/${first.id}`).send({ alt: 'x' })).status).toBe(404);
    expect((await authorized('delete', `/api/v1/products/${other.id}/images/${first.id}`)).status).toBe(404);
    expect((await authorized('patch', `${base()}/${first.id}`).send({ isMain: false })).status).toBe(400);
  });

  it('não perde atualizações concorrentes de principal e alt', async () => {
    await upload();
    await upload();
    const snapshot = await Product.findById(product.id);
    const results = await Promise.allSettled([
      editProductImage(snapshot, snapshot.images[1].id, { isMain: true }),
      editProductImage(snapshot, snapshot.images[0].id, { alt: 'Concurrent' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.statusCode).toBe(409);
    expect((await Product.findById(product.id)).images.filter((i) => i.isMain)).toHaveLength(1);
  });

  it('não excede 20 em uploads concorrentes e compensa o perdedor', async () => {
    await Product.updateOne({ _id: product.id }, { $set: { images: Array.from({ length: 19 }, (_, i) =>
      legacyImage({ id: randomUUID(), isMain: i === 0 })) } });
    const snapshot = await Product.findById(product.id);
    const results = await Promise.allSettled([1, 2].map(() =>
      uploadImage('product', snapshot, { buffer: png, mimetype: 'image/png' }, '', adapter)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.statusCode).toBe(409);
    expect((await Product.findById(product.id)).images).toHaveLength(20);
    expect(adapter.remove).toHaveBeenCalledTimes(1);
    expect((await authorized('post', base()).send({})).status).toBe(409);
  });

  it('substitui e remove imagem da categoria preservando arquivos publicados', async () => {
    const first = await upload(categoryBase(), 'put');
    expect(first.status).toBe(200);
    const second = await upload(categoryBase(), 'put');
    expect(second.status).toBe(200);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(adapter.remove).not.toHaveBeenCalled();
    expect((await authorized('delete', categoryBase())).status).toBe(204);
    expect((await authorized('delete', categoryBase())).status).toBe(204);
    expect(await Category.exists({ _id: category.id })).toBeTruthy();
    expect((await Category.findById(category.id).lean()).image).toBeNull();
  });

  it('substituições concorrentes de categoria persistem uma referência e compensam a outra', async () => {
    const snapshot = await Category.findById(category.id);
    const results = await Promise.allSettled([1, 2].map(() => uploadImage('category', snapshot,
      { buffer: png, mimetype: 'image/png' }, '', adapter)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(adapter.remove).toHaveBeenCalledTimes(1);
    expect(await ImageAsset.countDocuments({ state: 'retained' })).toBe(1);
    expect(await ImageAsset.countDocuments({ state: 'deleted' })).toBe(1);
  });
});

describe('falhas, legado e respostas', () => {
  it('não inicia upload se não consegue registrar sua identidade durável', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(ImageAsset, 'create').mockRejectedValueOnce(new Error('SECRET local database path'));
    const response = await upload();
    expect(response.status).toBe(500);
    expect(response.text).not.toMatch(/SECRET|database path|stack/);
    expect(adapter.store).not.toHaveBeenCalled();
  });

  it('preserva limpeza pendente quando a consulta ao banco falha durante a compensação', async () => {
    vi.spyOn(Product, 'findOneAndUpdate').mockRejectedValueOnce(Object.assign(new Error('rejected'), { code: 121 }));
    vi.spyOn(Product, 'exists').mockRejectedValueOnce(new Error('database unavailable'));
    expect((await upload()).status).toBe(503);
    expect((await ImageAsset.findOne()).state).toBe('cleanup');
    expect(adapter.remove).not.toHaveBeenCalled();
    expect((await processImageCleanup({ adapter, now: new Date(Date.now() + 300_000) })).deleted).toBe(1);
  });

  it('falha externa preserva a referência anterior e deixa identidade recuperável', async () => {
    const old = (await upload(categoryBase(), 'put')).body.data;
    adapter.store.mockRejectedValueOnce(new Error('SECRET raw provider /private/path'));
    const response = await upload(categoryBase(), 'put');
    expect(response.status).toBe(503);
    expect(response.text).not.toMatch(/SECRET|private|stack/);
    expect((await Category.findById(category.id)).image.url).toBe(old.url);
    expect(await ImageAsset.countDocuments({ state: 'uploading' })).toBe(1);
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it('compensa upload quando a persistência falha e recupera falha na compensação', async () => {
    const spy = vi.spyOn(Product, 'findOneAndUpdate').mockRejectedValueOnce(Object.assign(new Error('write rejected'), { code: 121 }));
    adapter.remove.mockRejectedValueOnce(new Error('raw secret'));
    expect((await upload()).status).toBe(503);
    spy.mockRestore();
    expect((await Product.findById(product.id)).images).toHaveLength(0);
    const pending = await ImageAsset.findOne();
    expect(pending.state).toBe('cleanup');
    expect(pending.attempts).toBe(1);
    const result = await processImageCleanup({ adapter, now: new Date(Date.now() + 300_000) });
    expect(result.deleted).toBe(1);
    expect((await ImageAsset.findById(pending.id)).state).toBe('deleted');
  });

  it('não remove uma escrita persistida cuja resposta do banco foi perdida', async () => {
    const original = Product.findOneAndUpdate.bind(Product);
    vi.spyOn(Product, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await original(...args); throw new Error('lost acknowledgment');
    });
    expect((await upload()).status).toBe(503);
    expect((await Product.findById(product.id)).images).toHaveLength(1);
    expect(adapter.remove).not.toHaveBeenCalled();
    expect((await ImageAsset.findOne()).state).toBe('retained');
  });

  it('retém gravação ambígua mesmo se o produto já tiver sido excluído', async () => {
    const original = Product.findOneAndUpdate.bind(Product);
    vi.spyOn(Product, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await original(...args);
      await Product.deleteOne({ _id: product.id });
      throw new Error('lost acknowledgment after concurrent deletion');
    });
    expect((await upload()).status).toBe(503);
    expect(adapter.remove).not.toHaveBeenCalled();
    expect((await ImageAsset.findOne()).state).toBe('retained');
  });

  it('limpeza que assume upload antigo impede publicação tardia', async () => {
    adapter.store.mockImplementationOnce(async ({ publicId }) => {
      await ImageAsset.updateOne({ publicId }, { $set: { nextAttemptAt: new Date(0) } });
      await processImageCleanup({ adapter });
      return { url: `https://example.com/${publicId}.webp` };
    });
    expect((await upload()).status).toBe(409);
    expect((await Product.findById(product.id)).images).toHaveLength(0);
    expect((await ImageAsset.findOne()).state).toBe('deleted');
    expect(adapter.remove).toHaveBeenCalledTimes(2);
  });

  it('não registra nem remove legado de categoria sem referência confiável', async () => {
    await Category.updateOne({ _id: category.id }, { $set: { image: legacyImage({ publicId: 'untrusted/legacy' }) } });
    expect((await upload(categoryBase(), 'put')).status).toBe(200);
    expect(adapter.remove).not.toHaveBeenCalled();
    expect(await ImageAsset.countDocuments()).toBe(1);
  });

  it('migração é explícita, dry-run e idempotente sem inventar publicId', async () => {
    await Product.collection.updateOne({ _id: product._id }, { $set: { images: [legacyImage(), legacyImage({ isMain: true, publicId: 'untrusted/old' })] } });
    expect((await request(app).get(base())).status).toBe(200);
    expect((await upload()).status).toBe(409);
    expect(adapter.store).not.toHaveBeenCalled();
    expect((await migrateImageIds()).candidates).toBe(1);
    expect((await Product.collection.findOne({ _id: product._id })).images[0].id).toBeUndefined();
    expect((await migrateImageIds({ dryRun: false })).updated).toBe(1);
    const migrated = await Product.findById(product.id);
    expect(migrated.images[0].publicId).toBeUndefined();
    expect(migrated.images[1].publicId).toBe('untrusted/old');
    expect(migrated.images.filter((image) => image.isMain)).toHaveLength(1);
    expect((await migrateImageIds({ dryRun: false })).updated).toBe(0);
    expect((await authorized('delete', `${base()}/${migrated.images[1].id}`)).status).toBe(204);
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it.each(['products', 'categories'])('bloqueia escrita direta e mutações anônimas em %s', async (kind) => {
    const id = kind === 'products' ? product.id : category.id;
    const value = kind === 'products' ? { images: [legacyImage()] } : { image: legacyImage() };
    expect((await authorized('patch', `/api/v1/${kind}/${id}`).send(value)).status).toBe(400);
    expect((await authorized('post', `/api/v1/${kind}`).send(value)).status).toBe(400);
    for (const field of ['publicId', 'imageRevision', 'storage', 'transformation']) {
      expect((await authorized('patch', `/api/v1/${kind}/${id}`).send({ [field]: 'unsafe' })).status).toBe(400);
    }
    for (const method of ['post', 'patch', 'delete']) {
      const path = `/api/v1/${kind}${method === 'post' ? '' : `/${id}`}`;
      expect((await request(app)[method](path).send({})).status).toBe(401);
      expect((await request(app)[method](path).auth(customerToken, { type: 'bearer' }).send({})).status).toBe(403);
    }
  });

  it('sanitiza consultas de catálogo, carrinho e desejos e retém após excluir o catálogo', async () => {
    await upload();
    await upload(categoryBase(), 'put');
    await User.updateOne({ email: 'customer-images@example.com' }, {
      $set: { 'cart.items': [{ product: product._id, quantity: 1 }], wishlist: [product._id] },
    });
    for (const path of ['/products', `/products/${product.id}`, '/categories', `/categories/${category.id}`, '/cart', '/wishlist']) {
      const response = await request(app).get(`/api/v1${path}`).auth(customerToken, { type: 'bearer' });
      expect(response.status).toBe(200);
      expect(response.text).not.toMatch(/publicId|imageRevision|signature|api_key/);
    }
    expect((await authorized('delete', `/api/v1/products/${product.id}`)).status).toBe(204);
    expect((await authorized('delete', `/api/v1/categories/${category.id}`)).status).toBe(204);
    expect(await ImageAsset.countDocuments({ state: 'retained' })).toBe(2);
    expect(adapter.remove).not.toHaveBeenCalled();
  });
});
