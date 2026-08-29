import { Router } from 'express';
import {
  addWishlistItem, clearWishlist, getWishlist, removeWishlistItem,
} from '../controllers/wishlist.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  addWishlistItemSchema, emptyObjectSchema, productIdParamsSchema,
} from '../validations/cartWishlist.validation.js';

const router = Router();
router.use(authenticate);
router.route('/')
  .get(validate({ query: emptyObjectSchema }), getWishlist)
  .delete(validate({ body: emptyObjectSchema, query: emptyObjectSchema }), clearWishlist);
router.post('/items', validate({ body: addWishlistItemSchema, query: emptyObjectSchema }), addWishlistItem);
router.delete(
  '/items/:productId',
  validate({ params: productIdParamsSchema, body: emptyObjectSchema, query: emptyObjectSchema }),
  removeWishlistItem,
);

export default router;
