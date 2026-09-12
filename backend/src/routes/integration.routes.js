import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { emptyObjectSchema } from '../validations/cartWishlist.validation.js';
import { orderIdParamsSchema } from '../validations/order.validation.js';
import { paymentSchema, quoteSchema } from '../validations/integration.validation.js';
import { createPayment, getPayment, mercadoPagoWebhook, shippingQuotes } from '../controllers/integration.controller.js';

const router = Router();
router.post('/webhooks/mercado-pago', mercadoPagoWebhook);
router.post('/shipping/quotes', authenticate, validate({ body: quoteSchema, query: emptyObjectSchema }), shippingQuotes);
router.route('/orders/:orderId/payments')
  .post(authenticate, validate({ params: orderIdParamsSchema, query: emptyObjectSchema, body: paymentSchema }), createPayment)
  .get(authenticate, validate({ params: orderIdParamsSchema, query: emptyObjectSchema }), getPayment);
export default router;
