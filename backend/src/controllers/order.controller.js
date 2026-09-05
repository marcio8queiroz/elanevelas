import Order from '../models/Order.js';
import { createOrderFromCart } from '../services/order.service.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  adminOrderDetailResponse, adminOrderSummaryResponse, orderDetailResponse, orderSummaryResponse,
} from '../utils/orderResponse.js';

const ORDER_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [],
};
const PAYMENT_TRANSITIONS = {
  pending: ['paid', 'failed'], paid: ['refunded'], failed: ['pending'], refunded: [],
};

const pagination = (page, limit, totalItems) => ({
  page, limit, totalItems, totalPages: Math.ceil(totalItems / limit),
  hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1,
});

function sortValue(sort) {
  const descending = sort.startsWith('-');
  const field = sort.replace(/^-/, '') === 'total' ? 'totalInCents' : sort.replace(/^-/, '');
  return `${descending ? '-' : ''}${field}`;
}

function listFilter(query, user) {
  const filter = {};
  if (user) filter.user = user;
  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.user) filter.user = query.user;
  if (query.orderNumber) filter.orderNumber = query.orderNumber;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }
  return filter;
}

async function list(req, res, { admin = false } = {}) {
  const { page, limit, sort } = req.validated.query;
  const filter = listFilter(req.validated.query, admin ? undefined : req.user._id);
  let find = Order.find(filter).sort(sortValue(sort)).skip((page - 1) * limit).limit(limit);
  if (admin) find = find.populate({ path: 'user', select: 'name email' });
  const [orders, totalItems] = await Promise.all([find, Order.countDocuments(filter)]);
  const response = admin ? adminOrderSummaryResponse : orderSummaryResponse;
  res.json({ success: true, data: orders.map(response), pagination: pagination(page, limit, totalItems) });
}

export const createOrder = asyncHandler(async (req, res) => {
  const order = await createOrderFromCart(req.user._id, req.validated.body);
  res.status(201).json({ success: true, data: orderDetailResponse(order) });
});

export const listOrders = asyncHandler((req, res) => list(req, res));

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.validated.params.orderId, user: req.user._id });
  if (!order) throw new AppError('Pedido não encontrado.', 404);
  res.json({ success: true, data: orderDetailResponse(order) });
});

export const listAdminOrders = asyncHandler((req, res) => list(req, res, { admin: true }));

export const getAdminOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.validated.params.orderId).populate({ path: 'user', select: 'name email' });
  if (!order) throw new AppError('Pedido não encontrado.', 404);
  res.json({ success: true, data: adminOrderDetailResponse(order) });
});

async function transition(req, res, { field, historyType, transitions }) {
  const nextStatus = req.validated.body[field];
  const current = await Order.findById(req.validated.params.orderId);
  if (!current) throw new AppError('Pedido não encontrado.', 404);
  if (current[field] === nextStatus) {
    await current.populate({ path: 'user', select: 'name email' });
    return res.json({ success: true, data: adminOrderDetailResponse(current) });
  }
  if (!transitions[current[field]]?.includes(nextStatus)) throw new AppError('Transição de estado inválida.', 400);
  const updated = await Order.findOneAndUpdate(
    { _id: current._id, [field]: current[field] },
    { $set: { [field]: nextStatus }, $push: { statusHistory: { type: historyType, status: nextStatus, changedAt: new Date() } } },
    { returnDocument: 'after', runValidators: true },
  ).populate({ path: 'user', select: 'name email' });
  if (!updated) throw new AppError('O pedido foi atualizado simultaneamente.', 409);
  return res.json({ success: true, data: adminOrderDetailResponse(updated) });
}

export const updateOrderStatus = asyncHandler((req, res) => transition(req, res, {
  field: 'status', historyType: 'order', transitions: ORDER_TRANSITIONS,
}));
export const updatePaymentStatus = asyncHandler((req, res) => transition(req, res, {
  field: 'paymentStatus', historyType: 'payment', transitions: PAYMENT_TRANSITIONS,
}));
