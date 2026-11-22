export const ORDER_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [],
};
export const PAYMENT_TRANSITIONS = {
  pending: ['paid', 'failed'], paid: ['refunded'], failed: ['pending'], refunded: [],
};


export function orderActions(order) {
  const external = order.payment?.provider === 'mercado_pago';
  return {
    statuses: (ORDER_TRANSITIONS[order.status] ?? []).filter(status => !external || status !== 'cancelled'),
    paymentStatuses: external ? [] : (PAYMENT_TRANSITIONS[order.paymentStatus] ?? []),
    paymentManagedExternally: external,
  };
}
