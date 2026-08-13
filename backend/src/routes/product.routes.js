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

router.route('/')
  .get(validate({ query: listProductsSchema }), listProducts)
  .post(validate({ body: createProductSchema }), createProduct);

router.route('/:id')
  .get(validate({ params: idParamsSchema }), getProduct)
  .patch(validate({ params: idParamsSchema, body: updateProductSchema }), updateProduct)
  .delete(validate({ params: idParamsSchema }), deleteProduct);

export default router;
