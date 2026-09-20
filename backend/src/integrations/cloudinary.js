import { createHash } from 'node:crypto';
import { invalidResponse, requestJson, required } from './http.js';
import AppError from '../utils/AppError.js';

export const managedPublicId = /^elanevelas\/[a-f0-9-]{36}$/;

export function createCloudinaryAdapter({ env = process.env, fetchImpl, timeoutMs = 8000 } = {}) {
  async function call(action, publicId, buffer) {
    if (!managedPublicId.test(publicId)) throw new AppError('Identificador de armazenamento inválido.', 400);
    const cloud = required('CLOUDINARY_CLOUD_NAME', env);
    const key = required('CLOUDINARY_API_KEY', env);
    const secret = required('CLOUDINARY_API_SECRET', env);
    if (!/^[a-zA-Z0-9_-]+$/.test(cloud)) throw new AppError('Configuração de imagens inválida.', 503);
    const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)),
      ...(action === 'upload' ? { overwrite: 'false' } : { invalidate: 'true' }) };
    const signed = Object.keys(params).sort().map((name) => `${name}=${params[name]}`).join('&');
    const form = new FormData();
    for (const [name, value] of Object.entries(params)) form.set(name, value);
    form.set('api_key', key);
    form.set('signature', createHash('sha256').update(signed + secret).digest('hex'));
    if (buffer) form.set('file', new Blob([buffer], { type: 'image/webp' }), 'image.webp');
    return requestJson(`https://api.cloudinary.com/v1_1/${cloud}/image/${action}`, {
      method: 'POST', body: form, fetchImpl, timeoutMs,
    });
  }
  return {
    async store({ publicId, buffer }) {
      const result = await call('upload', publicId, buffer);
      let url;
      try { url = new URL(result.secure_url); } catch { throw invalidResponse(); }
      if (result.public_id !== publicId || result.resource_type !== 'image' || result.format !== 'webp' ||
          url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || url.search) {
        throw invalidResponse();
      }
      return { url: url.href };
    },
    async remove({ publicId }) {
      const result = await call('destroy', publicId);
      if (!['ok', 'not found'].includes(result?.result)) throw invalidResponse();
    },
  };
}

export default createCloudinaryAdapter();
