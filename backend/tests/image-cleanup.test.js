import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageAsset from '../src/models/ImageAsset.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import Order from '../src/models/Order.js';
import { cleanImageAsset, processImageCleanup, MAX_CLEANUP_ATTEMPTS } from '../src/services/imageCleanup.service.js';

let adapter;
beforeEach(() => { adapter = { remove: vi.fn(async () => {}) }; });
afterEach(() => vi.restoreAllMocks());
const asset = (overrides = {}) => ImageAsset.create({ publicId: `elanevelas/${randomUUID()}`,
  url: `https://example.com/${randomUUID()}.webp`, state: 'cleanup', nextAttemptAt: new Date(0), ...overrides });

describe('recuperação idempotente e retenção', () => {
  it('registro publicado é retido mesmo sem referência atual', async () => {
    const record = await asset({ state: 'retained' });
    expect(await cleanImageAsset(record.id, adapter)).toBe('skipped');
    await processImageCleanup({ adapter });
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it.each(['order', 'product-url', 'product-id', 'category-url', 'category-id'])('protege referência %s antes de excluir', async (kind) => {
    const record = await asset();
    // Minimal raw snapshots focus on the cleanup boundary; order creation is covered by orders.test.js.
    if (kind === 'order') await Order.collection.insertOne({ items: [{ imageUrl: record.url }] });
    if (kind.startsWith('product')) await Product.collection.insertOne({ images: [kind.endsWith('url') ? { url: record.url } : { publicId: record.publicId }] });
    if (kind.startsWith('category')) await Category.collection.insertOne({ image: kind.endsWith('url') ? { url: record.url } : { publicId: record.publicId } });
    expect(await cleanImageAsset(record.id, adapter)).toBe('retained');
    expect(adapter.remove).not.toHaveBeenCalled();
    expect((await ImageAsset.findById(record.id)).state).toBe('retained');
  });

  it('repetir exclusão concluída não repete a chamada externa', async () => {
    const record = await asset();
    expect(await cleanImageAsset(record.id, adapter)).toBe('deleted');
    expect(await cleanImageAsset(record.id, adapter)).toBe('skipped');
    expect(adapter.remove).toHaveBeenCalledTimes(1);
  });

  it('workers concorrentes obtêm uma única lease', async () => {
    const record = await asset();
    const results = await Promise.all([cleanImageAsset(record.id, adapter), cleanImageAsset(record.id, adapter)]);
    expect(results.sort()).toEqual(['deleted', 'skipped']);
    expect(adapter.remove).toHaveBeenCalledTimes(1);
  });

  it('recupera crash após destroy mas antes da confirmação local por exclusão idempotente', async () => {
    const record = await asset();
    const original = ImageAsset.updateOne.bind(ImageAsset);
    vi.spyOn(ImageAsset, 'updateOne').mockImplementationOnce(() => { throw new Error('database write failed'); });
    expect(await cleanImageAsset(record.id, adapter)).toBe('pending');
    ImageAsset.updateOne.mockImplementation(original);
    expect(await cleanImageAsset(record.id, adapter, new Date(Date.now() + 300_000))).toBe('deleted');
    expect(adapter.remove).toHaveBeenCalledTimes(2);
  });

  it('retoma lease expirada, mas não uma lease ativa', async () => {
    const record = await asset({ lease: randomUUID(), leaseUntil: new Date(Date.now() + 60_000) });
    expect(await cleanImageAsset(record.id, adapter)).toBe('skipped');
    expect(await cleanImageAsset(record.id, adapter, new Date(Date.now() + 61_000))).toBe('deleted');
  });

  it('upload ambíguo só é limpo depois da quarentena', async () => {
    const record = await asset({ state: 'uploading', nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    expect(await cleanImageAsset(record.id, adapter)).toBe('skipped');
    expect(await cleanImageAsset(record.id, adapter, new Date(Date.now() + 25 * 60 * 60 * 1000))).toBe('deleted');
  });

  it('retry é limitado e preserva registros esgotados sem mensagens brutas', async () => {
    const record = await asset();
    adapter.remove.mockRejectedValue(new Error('SECRET raw provider payload'));
    for (let i = 0; i < MAX_CLEANUP_ATTEMPTS; i += 1) {
      expect(await cleanImageAsset(record.id, adapter, new Date(Date.now() + i * 24 * 60 * 60 * 1000))).toBe('pending');
    }
    const failed = await ImageAsset.findById(record.id);
    expect(failed.state).toBe('failed');
    expect(failed.attempts).toBe(MAX_CLEANUP_ATTEMPTS);
    expect(JSON.stringify(failed)).not.toContain('SECRET');
    expect(await cleanImageAsset(record.id, adapter, new Date('2099-01-01'))).toBe('skipped');
    expect(adapter.remove).toHaveBeenCalledTimes(MAX_CLEANUP_ATTEMPTS);
  });

  it('torna visível crash na última tentativa como failed', async () => {
    const record = await asset({ attempts: MAX_CLEANUP_ATTEMPTS, lease: randomUUID(), leaseUntil: new Date(0) });
    await processImageCleanup({ adapter });
    expect((await ImageAsset.findById(record.id)).state).toBe('failed');
    expect(adapter.remove).not.toHaveBeenCalled();
  });

  it('falha ao consultar referências impede destroy e preserva a tarefa', async () => {
    const record = await asset();
    vi.spyOn(Order, 'exists').mockRejectedValueOnce(new Error('db failure'));
    expect(await cleanImageAsset(record.id, adapter)).toBe('pending');
    expect(adapter.remove).not.toHaveBeenCalled();
    expect((await ImageAsset.findById(record.id)).state).toBe('cleanup');
  });

  it('jamais usa um publicId legado ou não gerado para exclusão', async () => {
    const record = await asset({ publicId: 'legacy/arbitrary' });
    expect(await cleanImageAsset(record.id, adapter)).toBe('pending');
    expect(adapter.remove).not.toHaveBeenCalled();
    expect(await ImageAsset.countDocuments()).toBe(1);
  });

  it('lote tem no máximo 100 registros e não toca ativos desconhecidos', async () => {
    await asset();
    await asset();
    const counts = await processImageCleanup({ adapter, limit: 1 });
    expect(counts.deleted).toBe(1);
    expect(await ImageAsset.countDocuments({ state: 'cleanup' })).toBe(1);
    expect(await cleanImageAsset(new mongoose.Types.ObjectId(), adapter)).toBe('skipped');
  });
});
