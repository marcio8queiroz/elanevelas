import { invalidResponse, moneyInCents, requestJson, required } from './http.js';
import AppError from '../utils/AppError.js';

export function createShippingAdapter({ fetchImpl, env = process.env, timeoutMs } = {}) {
  return {
    async quote({ destinationZipCode, products }) {
      const token = required('MELHOR_ENVIO_TOKEN', env);
      const origin = required('STORE_POSTAL_CODE', env).replace('-', '');
      if (!/^\d{8}$/.test(origin)) throw new AppError('STORE_POSTAL_CODE inválido.', 503);
      const base = env.MELHOR_ENVIO_BASE_URL || 'https://sandbox.melhorenvio.com.br';
      if (base !== 'https://sandbox.melhorenvio.com.br') throw new AppError('Use o sandbox do Melhor Envio nesta etapa.', 503);
      const data = await requestJson(`${base}/api/v2/me/shipment/calculate`, {
        fetchImpl, timeoutMs, method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
          'User-Agent': `${required('STORE_NAME', env)} (${required('STORE_EMAIL', env)})` },
        body: JSON.stringify({ from: { postal_code: origin }, to: { postal_code: destinationZipCode },
          products: products.map((p) => ({ id: p.id, width: p.widthCm, height: p.heightCm,
            length: p.lengthCm, weight: p.weightKg, insurance_value: p.price, quantity: p.quantity })) }),
      });
      if (!Array.isArray(data)) throw invalidResponse();
      const options = data.flatMap((option) => {
        try {
          if (!option || option.error || !/^\d+$/.test(String(option.id)) || typeof option.name !== 'string'
            || !option.name.trim() || typeof option.company?.name !== 'string' || !option.company.name.trim()) return [];
          const price = moneyInCents(option.custom_price ?? option.price) / 100;
          const estimatedDays = option.custom_delivery_time ?? option.delivery_time;
          if (!Number.isSafeInteger(estimatedDays) || estimatedDays < 0) return [];
          return [{ serviceId: String(option.id), carrier: option.company.name, serviceName: option.name, price, estimatedDays }];
        } catch { return []; }
      });
      if (!options.length) throw invalidResponse();
      return options.sort((a, b) => a.price - b.price || a.serviceId.localeCompare(b.serviceId));
    },
  };
}
