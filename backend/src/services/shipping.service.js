import crypto from 'node:crypto';
import Product from '../models/Product.js';
import User from '../models/User.js';
import ShippingQuote from '../models/ShippingQuote.js';
import AppError from '../utils/AppError.js';
import { createShippingAdapter } from '../integrations/melhorEnvio.js';

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const canonical = (items) => items.map((i) => [String(i.productId ?? i.product).toLowerCase(), i.quantity]).sort((a, b) => a[0].localeCompare(b[0]));
export const cartFingerprint = (user) => hash(JSON.stringify([user.cart.revision ?? 0, canonical(user.cart.items)]));

export async function quoteShipping(userId, input, adapter = createShippingAdapter()) {
  const ids = input.items.map((i) => i.productId.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new AppError('Produtos duplicados.', 400);
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const parcels = input.items.map((item) => {
    const product = byId.get(item.productId.toLowerCase());
    if (!product) throw new AppError('Produto não encontrado.', 404);
    if (!product.isActive) throw new AppError('Produto inativo.', 400);
    if (Object.values(product.shipping.toObject()).some((v) => !Number.isFinite(v) || v <= 0)) throw new AppError('Peso e dimensões devem ser positivos.', 400);
    return { id: product.id, ...product.shipping.toObject(), price: product.promotionalPrice ?? product.price, quantity: item.quantity };
  });
  const user = await User.findById(userId).select('cart');
  if (!user || JSON.stringify(canonical(user.cart.items)) !== JSON.stringify(canonical(input.items))) throw new AppError('Os itens devem corresponder ao carrinho atual.', 400);
  const options = await adapter.quote({ destinationZipCode: input.destinationZipCode, products: parcels });
  const quoteId = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await ShippingQuote.create({ tokenHash: hash(quoteId), user: userId, fingerprint: cartFingerprint(user), destinationZipCode: input.destinationZipCode, options, expiresAt });
  return { quoteId, expiresAt, options };
}

export async function selectShipping(user, input) {
  const quote = await ShippingQuote.findOne({ tokenHash: hash(input.shippingQuoteId), user: user._id });
  if (!quote || quote.expiresAt <= new Date() || quote.fingerprint !== cartFingerprint(user)
    || quote.destinationZipCode !== input.shippingAddress.zipCode.replace('-', '')) throw new AppError('Cotação inválida ou vencida. Solicite uma nova cotação.', 400);
  const option = quote.options.find((o) => o.serviceId === input.shippingServiceId);
  if (!option) throw new AppError('Serviço de frete inválido.', 400);
  return { provider: 'melhor_envio', serviceId: option.serviceId, serviceName: option.serviceName, price: option.price, estimatedDays: option.estimatedDays };
}
