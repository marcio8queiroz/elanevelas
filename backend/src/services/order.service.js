import crypto from 'node:crypto';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

import { selectShipping } from './shipping.service.js';
import { moneyInCents } from '../integrations/http.js';

const cents = (amount) => Math.round(amount * 100);
const publicOrderNumber = () => `EV-${crypto.randomBytes(9).toString('hex').toUpperCase()}`;

async function rollbackReservations(reservations) {
  await Promise.all(reservations.map(({ productId, quantity }) => Product.updateOne(
    { _id: productId }, { $inc: { stock: quantity, salesCount: -quantity } },
  )));
}

export async function createOrderFromCart(userId, input) {
  const user = await User.findById(userId).select('cart');
  if (!user?.cart.items.length) throw new AppError('O carrinho está vazio.', 400);
  const cartItems = user.cart.items.map((item) => ({ productId: item.product.toString(), quantity: item.quantity }));
  const ids = cartItems.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) throw new AppError('O carrinho contém produtos duplicados.', 400);

  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const item of cartItems) {
    const product = byId.get(item.productId);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new AppError('Quantidade inválida no carrinho.', 400);
    if (!product) throw new AppError('Produto do carrinho não encontrado.', 404);
    if (!product.isActive) throw new AppError('Produto inativo no carrinho.', 400);
    if (product.stock === 0) throw new AppError('Produto sem estoque.', 400);
    if (item.quantity > product.stock) throw new AppError('Quantidade maior que o estoque disponível.', 400);
  }

  const shipping = await selectShipping(user, input);
  const shippingInCents = moneyInCents(shipping.price);
  const expectedSubtotal = cartItems.reduce((sum, item) => {
    const product = byId.get(item.productId);
    const value = cents(product.promotionalPrice ?? product.price) * item.quantity;
    if (!Number.isSafeInteger(value) || value < 0) throw new AppError('Valor inválido no carrinho.', 400);
    return sum + value;
  }, 0);
  if (!Number.isSafeInteger(expectedSubtotal + shippingInCents)) throw new AppError('Total do pedido excede o limite.', 400);
  const reservations = [];
  let order;
  let cartCleared = false;
  try {
    for (const item of cartItems) {
      const reserved = await Product.updateOne(
        { _id: item.productId, isActive: true, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity, salesCount: item.quantity } },
      );
      if (reserved.modifiedCount !== 1) throw new AppError('O estoque mudou durante a criação do pedido.', 409);
      reservations.push(item);
    }

    const items = cartItems.map((item) => {
      const product = byId.get(item.productId);
      const unitPriceInCents = cents(product.promotionalPrice ?? product.price);
      const mainImage = product.images.find((image) => image.isMain) ?? product.images[0];
      return {
        product: product._id, sku: product.sku, name: product.name,
        ...(mainImage?.url && { imageUrl: mainImage.url }), quantity: item.quantity,
        unitPriceInCents, totalInCents: unitPriceInCents * item.quantity,
      };
    });
    const subtotalInCents = items.reduce((sum, item) => sum + item.totalInCents, 0);
    order = await Order.create({
      orderNumber: publicOrderNumber(), user: userId, items, subtotalInCents,
      shipping, shippingInCents, discountInCents: 0, totalInCents: subtotalInCents + shippingInCents,
      shippingAddress: input.shippingAddress, paymentMethod: input.paymentMethod,
      status: 'pending', paymentStatus: 'pending',
      statusHistory: [{ type: 'order', status: 'pending' }, { type: 'payment', status: 'pending' }],
    });

    const cleared = await User.updateOne(
      { _id: userId, 'cart.items': user.cart.items,
        $expr: { $eq: [{ $ifNull: ['$cart.revision', 0] }, user.cart.revision ?? 0] } },
      { $inc: { 'cart.revision': 1 }, $set: { 'cart.items': [], 'cart.updatedAt': new Date() } },
    );
    if (cleared.modifiedCount !== 1) throw new AppError('O carrinho mudou durante a criação do pedido.', 409);
    cartCleared = true;
    // Payment must not start while this order can still be compensated.
    order.checkoutCompletedAt = new Date();
    await order.save();
    return order;
  } catch (error) {
    let cleanupError;
    if (cartCleared) {
      try {
        await User.updateOne({ _id: userId, 'cart.items': [], 'cart.revision': (user.cart.revision ?? 0) + 1 },
          { $set: { 'cart.items': user.cart.items, 'cart.updatedAt': new Date() }, $inc: { 'cart.revision': 1 } });
      } catch (caught) { cleanupError = caught; }
    }
    if (order) {
      try {
        await Order.deleteOne({ _id: order._id });
      } catch (caught) {
        cleanupError = caught;
      }
    }
    try {
      await rollbackReservations(reservations);
    } catch (caught) {
      cleanupError ??= caught;
    }
    throw cleanupError ?? error;
  }
}
