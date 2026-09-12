export default function paymentResponse(order) {
  const result = { paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod };
  const payment = order.payment;
  if (order.paymentStatus === 'pending') {
    if (order.paymentMethod === 'pix') {
      if (payment.qrCode) result.qrCode = payment.qrCode;
      if (payment.qrCodeBase64) result.qrCodeBase64 = payment.qrCodeBase64;
    }
    if (order.paymentMethod === 'boleto' && payment.ticketUrl) result.ticketUrl = payment.ticketUrl;
    if (payment.expiresAt) result.expiresAt = payment.expiresAt;
  }
  if (order.paymentStatus === 'failed') result.statusDetail = 'Pagamento recusado ou cancelado.';
  return result;
}
