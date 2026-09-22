const crypto = require('node:crypto');
const express = require('express');
const path = require('node:path');
const { createClient, describeRazorpayError } = require('./razorpay-client');
const { publicProducts, buildCart } = require('./store');
const { verifyOrderPayment } = require('./verify');

const { client, keySecret } = createClient();
const keyId = process.env.RAZORPAY_KEY_ID;
const port = Number(process.env.PORT || 3000);
const orders = new Map();
const app = express();

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function receipt() {
  return `cart_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function apiError(response, status, message) {
  return response.status(status).json({ error: message });
}

app.get('/api/products', (_request, response) => response.json({ products: publicProducts() }));

app.post('/api/orders', async (request, response) => {
  try {
    const cart = buildCart(request.body?.items);
    const order = await client.orders.create({
      amount: cart.totalPaise,
      currency: 'INR',
      receipt: receipt(),
      notes: { source: 'test-ecommerce-demo', item_count: String(cart.items.length) }
    });
    orders.set(order.id, { ...cart, razorpayOrder: order });
    response.status(201).json({
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      items: cart.items,
      totalPaise: cart.totalPaise
    });
  } catch (error) {
    apiError(response, error.message?.includes('cart') || error.message?.includes('product') || error.message?.includes('quantity') ? 400 : 502, describeRazorpayError(error));
  }
});

app.post('/api/payments/verify', async (request, response) => {
  const { razorpay_payment_id: paymentId, razorpay_order_id: checkoutOrderId, razorpay_signature: signature } = request.body || {};
  const record = orders.get(checkoutOrderId);
  if (!record) return apiError(response, 400, 'Unknown or expired local order. Create a new order and retry.');
  if (!paymentId || !signature) return apiError(response, 400, 'Missing Razorpay payment verification fields.');
  if (!verifyOrderPayment({ orderId: record.razorpayOrder.id, paymentId, signature, secret: keySecret })) {
    return apiError(response, 400, 'Razorpay signature verification failed. The payment is not trusted.');
  }
  try {
    const payment = await client.payments.fetch(paymentId);
    const isExpectedPayment = payment.order_id === record.razorpayOrder.id
      && payment.amount === record.totalPaise
      && payment.currency === 'INR';
    if (!isExpectedPayment) return apiError(response, 400, 'Payment details do not match the server-created order.');
    if (payment.status !== 'captured') {
      return apiError(response, 409, `Payment is ${payment.status}, not captured. Do not fulfil this cart.`);
    }
    response.json({
      verified: true,
      paymentStatus: payment.status,
      captured: payment.captured === true,
      paymentId: payment.id,
      paymentMethod: payment.method || 'unknown',
      orderId: record.razorpayOrder.id,
      products: record.items,
      totalPaise: record.totalPaise,
      totalLabel: `₹${(record.totalPaise / 100).toFixed(2)}`
    });
  } catch (error) {
    apiError(response, 502, describeRazorpayError(error));
  }
});

app.use((error, _request, response, _next) => apiError(response, 400, error.message || 'Invalid request.'));

app.listen(port, () => {
  console.log(`Test Mode store running at http://localhost:${port}`);
  console.log('Razorpay Test Mode only. No real money can be charged by this app.');
});
