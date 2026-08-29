import { Router } from 'express';
import {
  addCartItem, clearCart, getCart, removeCartItem, updateCartItem,
} from '../controllers/cart.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  addCartItemSchema, emptyObjectSchema, productIdParamsSchema, updateCartItemSchema,
} from '../validations/cartWishlist.validation.js';

const router = Router();
router.use(authenticate);
router.route('/')
  .get(validate({ query: emptyObjectSchema }), getCart)
  .delete(validate({ body: emptyObjectSchema, query: emptyObjectSchema }), clearCart);
router.post('/items', validate({ body: addCartItemSchema, query: emptyObjectSchema }), addCartItem);
router.route('/items/:productId')
  .patch(validate({ params: productIdParamsSchema, body: updateCartItemSchema, query: emptyObjectSchema }), updateCartItem)
  .delete(validate({ params: productIdParamsSchema, body: emptyObjectSchema, query: emptyObjectSchema }), removeCartItem);

export default router;
