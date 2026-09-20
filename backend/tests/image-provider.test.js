import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudinaryAdapter } from '../src/integrations/cloudinary.js';

const env = { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'fake-key', CLOUDINARY_API_SECRET: 'fake-secret' };
const publicId = `elanevelas/${randomUUID()}`;
const valid = { public_id: publicId, secure_url: `https://res.cloudinary.com/test/image/upload/${publicId}.webp`, resource_type: 'image', format: 'webp' };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
afterEach(() => vi.restoreAllMocks());

describe('fronteira Cloudinary sem rede', () => {
  it('assina parâmetros fixos em SHA-256 e envia somente bytes reprocessados', async () => {
    const fetchImpl = vi.fn(async () => response(valid));
    const adapter = createCloudinaryAdapter({ env, fetchImpl });
    expect(await adapter.store({ publicId, buffer: Buffer.from('processed bytes') })).toEqual({ url: valid.secure_url });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload');
    expect(options.redirect).toBe('error');
    const timestamp = options.body.get('timestamp');
    expect(options.body.get('signature')).toBe(createHash('sha256')
      .update(`overwrite=false&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`).digest('hex'));
    expect(options.body.get('overwrite')).toBe('false');
    expect(options.body.get('api_key')).toBe(env.CLOUDINARY_API_KEY);
    expect(await options.body.get('file').text()).toBe('processed bytes');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(['ok', 'not found'])('destroy aceita %s idempotentemente', async (result) => {
    const fetchImpl = vi.fn(async () => response({ result }));
    await createCloudinaryAdapter({ env, fetchImpl }).remove({ publicId });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/\/image\/destroy$/);
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body.get('invalidate')).toBe('true');
    expect(body.has('file')).toBe(false);
  });

  it.each([401, 403, 429, 500, 503, 400, 404])('normaliza HTTP %s sem payloads ou segredos', async (status) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => response({ error: 'fake-secret /private/path' }, status));
    await expect(createCloudinaryAdapter({ env, fetchImpl }).store({ publicId, buffer: Buffer.alloc(1) }))
      .rejects.toMatchObject({ statusCode: [400, 404].includes(status) ? 502 : 503 });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/fake-secret|fake-key|private|signature/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { public_id: 'arbitrary' }, { secure_url: 'http://res.cloudinary.com/insecure' },
    { secure_url: 'https://evil.example/a.webp' }, { secure_url: 'https://secret@res.cloudinary.com/a.webp' },
    { resource_type: 'video' }, { format: 'gif' }, { secure_url: 'invalid' },
  ])('rejeita resposta incompatível %j', async (override) => {
    const fetchImpl = vi.fn(async () => response({ ...valid, ...override }));
    await expect(createCloudinaryAdapter({ env, fetchImpl }).store({ publicId, buffer: Buffer.alloc(1) }))
      .rejects.toMatchObject({ statusCode: 502 });
  });

  it('normaliza JSON inválido, falha de rede e resposta de exclusão inesperada', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => { throw new Error('raw'); } }));
    const adapter = createCloudinaryAdapter({ env, fetchImpl });
    await expect(adapter.remove({ publicId })).rejects.toMatchObject({ statusCode: 502 });
    fetchImpl.mockRejectedValueOnce(new Error('raw secret'));
    await expect(adapter.remove({ publicId })).rejects.toMatchObject({ statusCode: 503 });
    fetchImpl.mockResolvedValueOnce(response({ result: 'unknown' }));
    await expect(adapter.remove({ publicId })).rejects.toMatchObject({ statusCode: 502 });
    fetchImpl.mockResolvedValueOnce(response(null));
    await expect(adapter.remove({ publicId })).rejects.toMatchObject({ statusCode: 502 });
  });

  it.each(['headers', 'body'])('timeout cobre %s sem retry', async (phase) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = () => new Promise(() => {});
    const fetchImpl = vi.fn(phase === 'headers' ? pending : async () => ({ ok: true, json: pending }));
    await expect(createCloudinaryAdapter({ env, fetchImpl, timeoutMs: 10 }).remove({ publicId }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])('configuração %s só é exigida ao usar', async (name) => {
    const adapter = createCloudinaryAdapter({ env: { ...env, [name]: '' } });
    await expect(adapter.remove({ publicId })).rejects.toMatchObject({ statusCode: 503 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('não permite chaves externas arbitrárias', async () => {
    await expect(createCloudinaryAdapter({ env }).remove({ publicId: 'legacy/image' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
