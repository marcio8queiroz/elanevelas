import { imageRoutes } from './image.routes.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { Router } from 'express';
import {
  createProduct, deleteProduct, getProduct, listProducts, updateProduct,
} from '../controllers/product.controller.js';
import validate from '../middlewares/validate.middleware.js';
import {
  createProductSchema, listProductsSchema, updateProductSchema,
} from '../validations/product.validation.js';
import { idParamsSchema } from '../validations/common.validation.js';

const router = Router();
router.use(imageRoutes('product'));
const admin = [authenticate, authorize('admin')];

router.route('/')
  .get(validate({ query: listProductsSchema }), listProducts)
  .post(...admin, validate({ body: createProductSchema }), createProduct);

router.route('/:id')
  .get(validate({ params: idParamsSchema }), getProduct)
  .patch(...admin, validate({ params: idParamsSchema, body: updateProductSchema }), updateProduct)
  .delete(...admin, validate({ params: idParamsSchema }), deleteProduct);

export default router;
