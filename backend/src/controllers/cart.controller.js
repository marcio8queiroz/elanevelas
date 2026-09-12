import mongoose from 'mongoose';
import Product from '../models/Product.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import productResponse, { publicProductSelect } from '../utils/productResponse.js';

const cartPopulate = { path: 'cart.items.product', select: publicProductSelect };

function currentPrice(product) {
  return product.promotionalPrice ?? product.price;
}

function cartResponse(user) {
  const items = user.cart.items.map((item) => {
    if (!item.product) {
      return {
        product: null,
        productId: item.product?._id?.toString() ?? item.product?.toString(),
        quantity: item.quantity,
        available: false,
        unavailableReason: 'removed',
      };
    }

    const product = item.product;
    const available = product.isActive && product.stock > 0 && item.quantity <= product.stock;
    let unavailableReason;
    if (!product.isActive) unavailableReason = 'inactive';
    else if (product.stock === 0) unavailableReason = 'out_of_stock';
    else if (item.quantity > product.stock) unavailableReason = 'insufficient_stock';
    const unitPrice = currentPrice(product);

    return {
      product: productResponse(product),
      quantity: item.quantity,
      unitPrice,
      lineTotal: available ? unitPrice * item.quantity : 0,
      available,
      ...(unavailableReason && { unavailableReason }),
    };
  });

  return {
    items,
    distinctItemCount: items.length,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + (item.lineTotal ?? 0), 0),
    updatedAt: user.cart.updatedAt ?? null,
  };
}

async function populatedCart(userId) {
  return User.findById(userId).select('cart').populate(cartPopulate);
}

async function activeProduct(productId) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new AppError('Produto não encontrado ou inativo.', 404);
  return product;
}

export const getCart = asyncHandler(async (req, res) => {
  const user = await populatedCart(req.user._id);
  res.json({ success: true, data: cartResponse(user) });
});

export const addCartItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.validated.body;
  const product = await activeProduct(productId);
  if (quantity > product.stock) throw new AppError('Quantidade maior que o estoque disponível.', 400);

  const objectId = new mongoose.Types.ObjectId(productId);
  const updated = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      $expr: {
        $lte: [
          {
            $add: [
              {
                $ifNull: [
                  {
                    $arrayElemAt: [
                      {
                        $map: {
                          input: {
                            $filter: {
                              input: { $ifNull: ['$cart.items', []] },
                              as: 'item',
                              cond: { $eq: ['$$item.product', objectId] },
                            },
                          },
                          as: 'item',
                          in: '$$item.quantity',
                        },
                      },
                      0,
                    ],
                  },
                  0,
                ],
              },
              quantity,
            ],
          },
          product.stock,
        ],
      },
    },
    [
      {
        $set: {
          'cart.items': {
            $cond: [
              { $in: [objectId, { $ifNull: ['$cart.items.product', []] }] },
              {
                $map: {
                  input: { $ifNull: ['$cart.items', []] },
                  as: 'item',
                  in: {
                    $cond: [
                      { $eq: ['$$item.product', objectId] },
                      { $mergeObjects: ['$$item', { quantity: { $add: ['$$item.quantity', quantity] }, updatedAt: '$$NOW' }] },
                      '$$item',
                    ],
                  },
                },
              },
              {
                $concatArrays: [
                  { $ifNull: ['$cart.items', []] },
                  [{ product: objectId, quantity, _id: new mongoose.Types.ObjectId(), createdAt: '$$NOW', updatedAt: '$$NOW' }],
                ],
              },
            ],
          },
          'cart.updatedAt': '$$NOW',
          'cart.revision': { $add: [{ $ifNull: ['$cart.revision', 0] }, 1] },
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  ).select('cart').populate(cartPopulate);

  if (!updated) throw new AppError('Quantidade maior que o estoque disponível.', 400);
  res.status(201).json({ success: true, data: cartResponse(updated) });
});

export const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.validated.params;
  const { quantity } = req.validated.body;
  const product = await activeProduct(productId);
  if (quantity > product.stock) throw new AppError('Quantidade maior que o estoque disponível.', 400);

  const updated = await User.findOneAndUpdate(
    { _id: req.user._id, 'cart.items.product': productId },
    { $inc: { 'cart.revision': 1 }, $set: { 'cart.items.$.quantity': quantity, 'cart.items.$.updatedAt': new Date(), 'cart.updatedAt': new Date() } },
    { returnDocument: 'after', runValidators: true },
  ).select('cart').populate(cartPopulate);
  if (!updated) throw new AppError('Item não encontrado no carrinho.', 404);
  res.json({ success: true, data: cartResponse(updated) });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  await User.updateOne(
    { _id: req.user._id },
    { $inc: { 'cart.revision': 1 }, $pull: { 'cart.items': { product: req.validated.params.productId } }, $set: { 'cart.updatedAt': new Date() } },
  );
  res.status(204).end();
});

export const clearCart = asyncHandler(async (req, res) => {
  await User.updateOne(
    { _id: req.user._id },
    { $inc: { 'cart.revision': 1 }, $set: { 'cart.items': [], 'cart.updatedAt': new Date() } },
  );
  res.status(204).end();
});
