import asyncHandler from '../utils/asyncHandler.js';
import paymentResponse from '../utils/paymentResponse.js';
import { quoteShipping } from '../services/shipping.service.js';
import { initiatePayment, ownOrder, processWebhook } from '../services/payment.service.js';
import { verifyWebhook } from '../integrations/mercadoPago.js';

export const shippingQuotes = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await quoteShipping(req.user._id, req.validated.body, req.app.locals.shippingAdapter) });
});
export const createPayment = asyncHandler(async (req, res) => {
  const order = await initiatePayment(req.user, req.validated.params.orderId, req.validated.body, req.app.locals.paymentAdapter);
  res.json({ success: true, data: paymentResponse(order) });
});
export const getPayment = asyncHandler(async (req, res) => {
  res.json({ success: true, data: paymentResponse(await ownOrder(req.user._id, req.validated.params.orderId)) });
});
export const mercadoPagoWebhook = asyncHandler(async (req, res) => {
  await processWebhook(verifyWebhook(req), req.app.locals.paymentAdapter);
  res.json({ success: true });
});
