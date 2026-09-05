import crypto from 'node:crypto';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

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
    if (!product) throw new AppError('Produto do carrinho não encontrado.', 404);
    if (!product.isActive) throw new AppError('Produto inativo no carrinho.', 400);
    if (product.stock === 0) throw new AppError('Produto sem estoque.', 400);
    if (item.quantity > product.stock) throw new AppError('Quantidade maior que o estoque disponível.', 400);
  }

  const reservations = [];
  let order;
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
      shippingInCents: 0, discountInCents: 0, totalInCents: subtotalInCents,
      shippingAddress: input.shippingAddress, paymentMethod: input.paymentMethod,
      status: 'pending', paymentStatus: 'pending',
      statusHistory: [{ type: 'order', status: 'pending' }, { type: 'payment', status: 'pending' }],
    });

    const cleared = await User.updateOne(
      { _id: userId, 'cart.items': user.cart.items },
      { $set: { 'cart.items': [], 'cart.updatedAt': new Date() } },
    );
    if (cleared.modifiedCount !== 1) throw new AppError('O carrinho mudou durante a criação do pedido.', 409);
    return order;
  } catch (error) {
    let cleanupError;
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
