import { Router } from 'express';
import { createOrder, getOrder, listOrders } from '../controllers/order.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { emptyObjectSchema } from '../validations/cartWishlist.validation.js';
import { createOrderSchema, listOrdersSchema, orderIdParamsSchema } from '../validations/order.validation.js';

const router = Router();
router.use(authenticate);
router.route('/')
  .post(validate({ body: createOrderSchema, query: emptyObjectSchema }), createOrder)
  .get(validate({ query: listOrdersSchema }), listOrders);
router.get('/:orderId', validate({ params: orderIdParamsSchema, query: emptyObjectSchema }), getOrder);

export default router;
