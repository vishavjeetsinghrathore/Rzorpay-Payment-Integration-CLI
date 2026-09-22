const crypto = require('node:crypto');

function secureEqual(left, right) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySignature(payload, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return secureEqual(expected, String(signature || '').trim());
}

function verifyOrderPayment({ orderId, paymentId, signature, secret }) {
  return verifySignature(`${orderId}|${paymentId}`, signature, secret);
}

function verifyPaymentLinkPayment({ paymentLinkId, referenceId, status, paymentId, signature, secret }) {
  return verifySignature(`${paymentLinkId}|${referenceId}|${status}|${paymentId}`, signature, secret);
}

module.exports = { verifyOrderPayment, verifyPaymentLinkPayment };
