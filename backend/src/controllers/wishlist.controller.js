import Product from '../models/Product.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import productResponse, { publicProductSelect } from '../utils/productResponse.js';

const wishlistPopulate = { path: 'wishlist', select: publicProductSelect, match: { isActive: true } };

function wishlistResponse(user) {
  const items = user.wishlist.filter(Boolean).map(productResponse);
  return { items, itemCount: items.length };
}

async function populatedWishlist(userId) {
  return User.findById(userId).select('wishlist').populate(wishlistPopulate);
}

export const getWishlist = asyncHandler(async (req, res) => {
  const user = await populatedWishlist(req.user._id);
  res.json({ success: true, data: wishlistResponse(user) });
});

export const addWishlistItem = asyncHandler(async (req, res) => {
  const { productId } = req.validated.body;
  if (!(await Product.exists({ _id: productId, isActive: true }))) {
    throw new AppError('Produto não encontrado ou inativo.', 404);
  }
  await User.updateOne({ _id: req.user._id }, { $addToSet: { wishlist: productId } });
  const user = await populatedWishlist(req.user._id);
  res.status(201).json({ success: true, data: wishlistResponse(user) });
});

export const removeWishlistItem = asyncHandler(async (req, res) => {
  await User.updateOne(
    { _id: req.user._id },
    { $pull: { wishlist: req.validated.params.productId } },
  );
  res.status(204).end();
});

export const clearWishlist = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { wishlist: [] } });
  res.status(204).end();
});
