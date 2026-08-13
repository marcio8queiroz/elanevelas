import Category from '../models/Category.js';
import Product from '../models/Product.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const populateCategory = { path: 'category', select: 'name slug isActive' };

const pagination = (page, limit, totalItems) => ({
  page,
  limit,
  totalItems,
  totalPages: Math.ceil(totalItems / limit),
  hasNextPage: page * limit < totalItems,
  hasPreviousPage: page > 1,
});

async function assertCategoryExists(categoryId) {
  if (!(await Category.exists({ _id: categoryId }))) {
    throw new AppError('Categoria não encontrada.', 404);
  }
}

export const createProduct = asyncHandler(async (req, res) => {
  await assertCategoryExists(req.validated.body.category);
  const product = await Product.create(req.validated.body);
  await product.populate(populateCategory);
  res.status(201).json({ success: true, data: product });
});

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, sort, search, category, fragrance, minPrice, maxPrice, isFeatured, isActive, inStock } = req.validated.query;
  const filter = {};
  if (category) filter.category = category;
  if (fragrance) filter.fragrance = new RegExp(`^${escapeRegex(fragrance)}$`, 'i');
  if (isFeatured !== undefined) filter.isFeatured = isFeatured;
  if (isActive !== undefined) filter.isActive = isActive;
  if (inStock !== undefined) filter.stock = inStock ? { $gt: 0 } : 0;
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { name: expression },
      { description: expression },
      { fragrance: expression },
      { tags: expression },
      { sku: expression },
    ];
  }

  const [data, totalItems] = await Promise.all([
    Product.find(filter).populate(populateCategory).sort(sort).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: pagination(page, limit, totalItems) });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.validated.params.id).populate(populateCategory);
  if (!product) throw new AppError('Produto não encontrado.', 404);
  res.json({ success: true, data: product });
});

export const updateProduct = asyncHandler(async (req, res) => {
  if (req.validated.body.category) await assertCategoryExists(req.validated.body.category);
  const product = await Product.findByIdAndUpdate(
    req.validated.params.id,
    req.validated.body,
    { returnDocument: 'after', runValidators: true },
  ).populate(populateCategory);
  if (!product) throw new AppError('Produto não encontrado.', 404);
  res.json({ success: true, data: product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.validated.params.id);
  if (!product) throw new AppError('Produto não encontrado.', 404);
  res.status(204).end();
});
