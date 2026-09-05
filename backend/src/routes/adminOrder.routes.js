import { Router } from 'express';
import {
  getAdminOrder, listAdminOrders, updateOrderStatus, updatePaymentStatus,
} from '../controllers/order.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { emptyObjectSchema } from '../validations/cartWishlist.validation.js';
import {
  adminListOrdersSchema, orderIdParamsSchema, updateOrderStatusSchema, updatePaymentStatusSchema,
} from '../validations/order.validation.js';

const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/', validate({ query: adminListOrdersSchema }), listAdminOrders);
router.get('/:orderId', validate({ params: orderIdParamsSchema, query: emptyObjectSchema }), getAdminOrder);
router.patch('/:orderId/status', validate({ params: orderIdParamsSchema, body: updateOrderStatusSchema, query: emptyObjectSchema }), updateOrderStatus);
router.patch('/:orderId/payment-status', validate({ params: orderIdParamsSchema, body: updatePaymentStatusSchema, query: emptyObjectSchema }), updatePaymentStatus);

export default router;
