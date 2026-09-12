const money = (cents) => cents / 100;

const itemResponse = (item) => ({
  productId: item.product.toString(),
  name: item.name,
  sku: item.sku,
  ...(item.imageUrl && { imageUrl: item.imageUrl }),
  quantity: item.quantity,
  unitPrice: money(item.unitPriceInCents),
  lineTotal: money(item.totalInCents),
});

const baseResponse = (order) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  distinctItemCount: order.items.length,
  totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
  subtotal: money(order.subtotalInCents),
  shippingAmount: money(order.shippingInCents),
  discountAmount: money(order.discountInCents),
  total: money(order.totalInCents),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export const orderSummaryResponse = (order) => baseResponse(order);
export const orderDetailResponse = (order) => ({
  ...baseResponse(order),
  items: order.items.map(itemResponse),
  shippingAddress: order.shippingAddress,
  ...(order.shipping?.serviceId && { shipping: { provider: order.shipping.provider, serviceId: order.shipping.serviceId,
    serviceName: order.shipping.serviceName, price: order.shipping.price, estimatedDays: order.shipping.estimatedDays } }),
  statusHistory: order.statusHistory,
});
export const adminOrderSummaryResponse = (order) => ({
  ...baseResponse(order),
  ...(order.user && { customer: { id: order.user.id, name: order.user.name, email: order.user.email } }),
});
export const adminOrderDetailResponse = (order) => ({
  ...orderDetailResponse(order),
  ...(order.user && { customer: { id: order.user.id, name: order.user.name, email: order.user.email } }),
});
