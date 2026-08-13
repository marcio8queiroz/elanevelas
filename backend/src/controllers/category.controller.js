import Category from '../models/Category.js';
import Product from '../models/Product.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pagination = (page, limit, totalItems) => ({
  page,
  limit,
  totalItems,
  totalPages: Math.ceil(totalItems / limit),
  hasNextPage: page * limit < totalItems,
  hasPreviousPage: page > 1,
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.validated.body);
  res.status(201).json({ success: true, data: category });
});

export const listCategories = asyncHandler(async (req, res) => {
  const { page, limit, sort, search, isActive } = req.validated.query;
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: expression }, { slug: expression }, { description: expression }];
  }

  const [data, totalItems] = await Promise.all([
    Category.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    Category.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: pagination(page, limit, totalItems) });
});

export const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.validated.params.id);
  if (!category) throw new AppError('Categoria não encontrada.', 404);
  res.json({ success: true, data: category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(
    req.validated.params.id,
    req.validated.body,
    { returnDocument: 'after', runValidators: true },
  );
  if (!category) throw new AppError('Categoria não encontrada.', 404);
  res.json({ success: true, data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;
  const category = await Category.findById(id);
  if (!category) throw new AppError('Categoria não encontrada.', 404);
  if (await Product.exists({ category: id })) {
    throw new AppError('A categoria está vinculada a produtos e não pode ser excluída.', 409);
  }
  await category.deleteOne();
  res.status(204).end();
});
