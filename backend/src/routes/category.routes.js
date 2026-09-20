import { imageRoutes } from './image.routes.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { Router } from 'express';
import {
  createCategory, deleteCategory, getCategory, listCategories, updateCategory,
} from '../controllers/category.controller.js';
import validate from '../middlewares/validate.middleware.js';
import {
  createCategorySchema, listCategoriesSchema, updateCategorySchema,
} from '../validations/category.validation.js';
import { idParamsSchema } from '../validations/common.validation.js';

const router = Router();
router.use(imageRoutes('category'));
const admin = [authenticate, authorize('admin')];

router.route('/')
  .get(validate({ query: listCategoriesSchema }), listCategories)
  .post(...admin, validate({ body: createCategorySchema }), createCategory);

router.route('/:id')
  .get(validate({ params: idParamsSchema }), getCategory)
  .patch(...admin, validate({ params: idParamsSchema, body: updateCategorySchema }), updateCategory)
  .delete(...admin, validate({ params: idParamsSchema }), deleteCategory);

export default router;
