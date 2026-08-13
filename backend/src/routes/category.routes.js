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

router.route('/')
  .get(validate({ query: listCategoriesSchema }), listCategories)
  .post(validate({ body: createCategorySchema }), createCategory);

router.route('/:id')
  .get(validate({ params: idParamsSchema }), getCategory)
  .patch(validate({ params: idParamsSchema, body: updateCategorySchema }), updateCategory)
  .delete(validate({ params: idParamsSchema }), deleteCategory);

export default router;
