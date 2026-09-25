const crypto = require('node:crypto');
const { createLogger } = require('./logger');

const log = createLogger('verify.js');

function secureEqual(left, right) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySignature(payload, signature, secret) {
  log('[razorpay] verifySignature() — computing HMAC-SHA256 locally (no network call)', { payload });
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const matches = secureEqual(expected, String(signature || '').trim());
  log('[razorpay] verifySignature() result', matches);
  return matches;
}

function verifyOrderPayment({ orderId, paymentId, signature, secret }) {
  log('verifyOrderPayment() called', { orderId, paymentId });
  return verifySignature(`${orderId}|${paymentId}`, signature, secret);
}

function verifyPaymentLinkPayment({ paymentLinkId, referenceId, status, paymentId, signature, secret }) {
  log('verifyPaymentLinkPayment() called', { paymentLinkId, referenceId, status, paymentId });
  return verifySignature(`${paymentLinkId}|${referenceId}|${status}|${paymentId}`, signature, secret);
}

module.exports = { verifyOrderPayment, verifyPaymentLinkPayment };
