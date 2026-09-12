import { describe, expect, it, vi } from 'vitest';
import { requestJson, moneyInCents } from '../src/integrations/http.js';
import { createShippingAdapter } from '../src/integrations/melhorEnvio.js';
import { createPaymentAdapter, normalizePayment } from '../src/integrations/mercadoPago.js';

const env = { MELHOR_ENVIO_TOKEN: 'fake-secret', STORE_POSTAL_CODE: '69000-000', STORE_NAME: 'Teste', STORE_EMAIL: 'support@example.com', MERCADO_PAGO_ACCESS_TOKEN: 'fake-mp-secret' };
const response = (body) => ({ ok: true, json: async () => body });
const option = { id: 1, name: 'PAC', company: { name: 'Correios' }, price: '15.23', delivery_time: 4 };
const products = [{ id: 'abc', weightKg: 0.3, heightCm: 8, widthCm: 7, lengthCm: 9, price: 30, quantity: 2 }];
const quote = { destinationZipCode: '01001000', products };

describe('HTTP externo', () => {
  it.each([401, 403, 429, 500, 503])('normaliza HTTP %s sem mensagem sensível', async (status) => {
    await expect(requestJson('https://example.com', { fetchImpl: async () => ({ ok: false, status, json: async () => ({ secret: 'private' }) }) }))
      .rejects.toMatchObject({ statusCode: 503, message: 'Provedor externo indisponível.' });
  });
  it('normaliza recusa do provedor', async () => {
    await expect(requestJson('https://example.com', { fetchImpl: async () => ({ ok: false, status: 422 }) })).rejects.toMatchObject({ statusCode: 502 });
  });
  it('limita espera mesmo quando fetch não resolve', async () => {
    await expect(requestJson('https://example.com', { timeoutMs: 10, fetchImpl: () => new Promise(() => {}) })).rejects.toMatchObject({ statusCode: 503 });
  });
  it('limita leitura do corpo', async () => {
    await expect(requestJson('https://example.com', { timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) })).rejects.toMatchObject({ statusCode: 503 });
  });
  it('normaliza JSON inválido', async () => {
    await expect(requestJson('https://example.com', { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('secret'); } }) })).rejects.toMatchObject({ statusCode: 502 });
  });
  it.each([null, '', -1, '1.001', Infinity, '1e10', '9007199254740991'])('rejeita dinheiro inválido %s', (value) => {
    expect(() => moneyInCents(value)).toThrow();
  });
  it('converte decimais sem erro binário', () => { expect(moneyInCents('15.23')).toBe(1523); });
});

describe('Melhor Envio', () => {
  it('envia produtos separados, origem configurada e headers; usa customizações e ordena', async () => {
    const fetchImpl = vi.fn(async () => response([option, { ...option, id: 2, custom_price: '10.01', custom_delivery_time: 2 },
      { ...option, error: 'unavailable' }, { ...option, price: null }, { ...option, delivery_time: -1 }]));
    const result = await createShippingAdapter({ env, fetchImpl }).quote(quote);
    expect(result).toEqual([{ serviceId: '2', carrier: 'Correios', serviceName: 'PAC', price: 10.01, estimatedDays: 2 },
      { serviceId: '1', carrier: 'Correios', serviceName: 'PAC', price: 15.23, estimatedDays: 4 }]);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer fake-secret', 'User-Agent': 'Teste (support@example.com)' });
    expect(JSON.parse(options.body)).toEqual({ from: { postal_code: '69000000' }, to: { postal_code: '01001000' },
      products: [{ id: 'abc', width: 7, height: 8, length: 9, weight: 0.3, insurance_value: 30, quantity: 2 }] });
  });
  it.each([{}, [], [null], [{ ...option, price: undefined }]])('rejeita resposta sem opções válidas', async (data) => {
    await expect(createShippingAdapter({ env, fetchImpl: async () => response(data) }).quote(quote)).rejects.toMatchObject({ statusCode: 502 });
  });
  it('exige configuração somente ao usar', async () => {
    await expect(createShippingAdapter({ env: {} }).quote(quote)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('Mercado Pago', () => {
  it.each(['pix', 'boleto', 'credit_card'])('monta %s com valor e referência do servidor', async (method) => {
    const data = { id: 123, external_reference: 'EV-TEST', currency_id: 'BRL', transaction_amount: 52.23,
      status: 'pending', payment_method_id: method === 'pix' ? 'pix' : method === 'boleto' ? 'bolbradesco' : 'visa',
      payment_type_id: method === 'boleto' ? 'ticket' : 'credit_card', metadata: { attempt_id: 'stable-key' },
      point_of_interaction: { transaction_data: { qr_code: 'fake-qr-code' } },
      transaction_details: { external_resource_url: 'https://www.mercadopago.com.br/ticket' } };
    const fetchImpl = vi.fn(async () => response(data));
    const order = { paymentMethod: method, totalInCents: 5223, orderNumber: 'EV-TEST', shippingAddress: { zipCode: '69000-000', street: 'Rua', number: '10', neighborhood: 'Centro', city: 'Manaus', state: 'AM' } };
    const input = { payer: { firstName: 'Teste', lastName: 'Pessoa', identification: { type: 'CPF', number: '00000000000' } },
      ...(method === 'credit_card' && { card: { token: 'fake-card-token-value', installments: 1, paymentMethodId: 'visa' } }) };
    const result = await createPaymentAdapter({ env, fetchImpl }).create({ order, email: 'test@example.com', input, idempotencyKey: 'stable-key' });
    expect(result).toMatchObject({ externalPaymentId: '123', amountInCents: 5223, method });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments');
    const options = fetchImpl.mock.calls[0][1];
    expect(options.headers['X-Idempotency-Key']).toBe('stable-key');
    expect(JSON.parse(options.body)).toMatchObject({ transaction_amount: 52.23, external_reference: 'EV-TEST', payment_method_id: data.payment_method_id });
    expect(JSON.stringify(result)).not.toContain('fake-card-token-value');
  });
  it('consulta confirmatória usa GET e normaliza desconhecido sem transição', async () => {
    const fetchImpl = vi.fn(async () => response({ id: 1, external_reference: 'EV', transaction_amount: 1, currency_id: 'BRL', status: 'unknown' }));
    expect((await createPaymentAdapter({ env, fetchImpl }).get('1')).status).toBeUndefined();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/1');
  });
  it('rejeita resposta incompleta', () => { expect(() => normalizePayment({})).toThrow(); });
  it('exclui links inseguros e campos brutos', () => {
    const result = normalizePayment({ id: 1, external_reference: 'EV', transaction_amount: 1, currency_id: 'BRL', status: 'approved', secret: 'hidden',
      transaction_details: { external_resource_url: 'https://evil.example.com/ticket' } });
    expect(result.ticketUrl).toBeUndefined();
    expect(result).not.toHaveProperty('secret');
  });
  it('aceita o domínio global usado no boleto oficial', () => {
    const url = 'https://www.mercadopago.com/mlb/payments/ticket/helper?payment_id=123';
    expect(normalizePayment({ id: 123, external_reference: 'EV', transaction_amount: 1, currency_id: 'BRL', status: 'pending',
      transaction_details: { external_resource_url: url } }).ticketUrl).toBe(url);
  });
});
