import AppError from '../utils/AppError.js';

export function required(name, env = process.env) {
  if (!env[name]?.trim()) throw new AppError(`Integração não configurada: ${name}.`, 503);
  return env[name].trim();
}

export const invalidResponse = () => new AppError('Resposta inválida do provedor externo.', 502);

// The deadline covers both headers and body, even with an injected client.
export async function requestJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 8000, ...options } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
        if (!response.ok) {
          const unavailable = [401, 403, 429].includes(response.status) || response.status >= 500;
          const error = new AppError(unavailable ? 'Provedor externo indisponível.' : 'Solicitação recusada pelo provedor externo.', unavailable ? 503 : 502);
          error.providerStatus = response.status;
          throw error;
        }
        try { return await response.json(); } catch { throw invalidResponse(); }
      })(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AppError('Tempo limite do provedor externo excedido.', 503));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    // Never log URL queries, headers, request bodies or provider error bodies.
    console.warn('Falha HTTP de integração.', {
      host: new URL(url).hostname,
      status: error.providerStatus ?? null,
      category: error instanceof AppError ? error.message : 'Falha de comunicação.',
    });
    if (error instanceof AppError) throw error;
    throw new AppError('Falha de comunicação com o provedor externo.', 503);
  } finally { clearTimeout(timer); }
}

export function moneyInCents(value) {
  if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) throw invalidResponse();
  const [whole, fraction = ''] = String(value).split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0) throw invalidResponse();
  return cents;
}
