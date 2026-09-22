const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { rupeesToPaise } = require('../src/validation');
const { verifyOrderPayment, verifyPaymentLinkPayment } = require('../src/verify');

test('converts INR strings to paise precisely', () => {
  assert.equal(rupeesToPaise('299.50'), 29950);
  assert.equal(rupeesToPaise('1'), 100);
  assert.throws(() => rupeesToPaise('0.99'));
  assert.throws(() => rupeesToPaise('12.345'));
});

test('verifies an Order callback signature', () => {
  const secret = 'test-secret';
  const signature = crypto.createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
  assert.equal(verifyOrderPayment({ orderId: 'order_1', paymentId: 'pay_1', signature, secret }), true);
  assert.equal(verifyOrderPayment({ orderId: 'order_1', paymentId: 'pay_2', signature, secret }), false);
});

test('verifies a Payment Link callback signature', () => {
  const secret = 'test-secret';
  const message = 'plink_1|reference-1|paid|pay_1';
  const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
  assert.equal(verifyPaymentLinkPayment({ paymentLinkId: 'plink_1', referenceId: 'reference-1', status: 'paid', paymentId: 'pay_1', signature, secret }), true);
});
