const crypto = require('node:crypto');
const express = require('express');
const path = require('node:path');
const { createClient, describeRazorpayError } = require('./razorpay-client');
const { publicProducts, buildCart } = require('./store');
const { verifyOrderPayment } = require('./verify');
const { createLogger } = require('./logger');

const log = createLogger('server.js');
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

app.get('/api/products', (_request, response) => {
  log('GET /api/products');
  response.json({ products: publicProducts() });
});

app.post('/api/orders', async (request, response) => {
  log('POST /api/orders — request', request.body);
  try {
    const cart = buildCart(request.body?.items);
    log('cart built locally', { totalPaise: cart.totalPaise, items: cart.items.length });

    log('[razorpay] -> POST https://api.razorpay.com/v1/orders (via client.orders.create())');
    const order = await client.orders.create({
      amount: cart.totalPaise,
      currency: 'INR',
      receipt: receipt(),
      notes: { source: 'test-ecommerce-demo', item_count: String(cart.items.length) }
    });
    log('[razorpay] <- order created', { orderId: order.id, amount: order.amount });

    orders.set(order.id, { ...cart, razorpayOrder: order });
    log('order stored in-memory, responding to browser', { orderId: order.id });
    response.status(201).json({
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      items: cart.items,
      totalPaise: cart.totalPaise
    });
  } catch (error) {
    log('POST /api/orders — error', error.message);
    apiError(response, error.message?.includes('cart') || error.message?.includes('product') || error.message?.includes('quantity') ? 400 : 502, describeRazorpayError(error));
  }
});

app.post('/api/payments/verify', async (request, response) => {
  const { razorpay_payment_id: paymentId, razorpay_order_id: checkoutOrderId, razorpay_signature: signature } = request.body || {};
  log('POST /api/payments/verify — request', { paymentId, checkoutOrderId });

  const record = orders.get(checkoutOrderId);
  if (!record) { log('unknown/expired local order'); return apiError(response, 400, 'Unknown or expired local order. Create a new order and retry.'); }
  if (!paymentId || !signature) { log('missing verification fields'); return apiError(response, 400, 'Missing Razorpay payment verification fields.'); }

  log('verifying HMAC signature locally (no Razorpay call)');
  if (!verifyOrderPayment({ orderId: record.razorpayOrder.id, paymentId, signature, secret: keySecret })) {
    log('signature verification FAILED');
    return apiError(response, 400, 'Razorpay signature verification failed. The payment is not trusted.');
  }
  log('signature verification OK');

  try {
    log('[razorpay] -> GET https://api.razorpay.com/v1/payments/:id (via client.payments.fetch())', { paymentId });
    const payment = await client.payments.fetch(paymentId);
    log('[razorpay] <- payment fetched', { status: payment.status, captured: payment.captured, method: payment.method });

    const isExpectedPayment = payment.order_id === record.razorpayOrder.id
      && payment.amount === record.totalPaise
      && payment.currency === 'INR';
    if (!isExpectedPayment) { log('payment details mismatch vs server-created order'); return apiError(response, 400, 'Payment details do not match the server-created order.'); }
    if (payment.status !== 'captured') {
      log('payment not captured', payment.status);
      return apiError(response, 409, `Payment is ${payment.status}, not captured. Do not fulfil this cart.`);
    }

    log('payment verified + captured, responding to browser', { paymentId: payment.id });
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
    log('POST /api/payments/verify — error', error.message);
    apiError(response, 502, describeRazorpayError(error));
  }
});

app.use((error, _request, response, _next) => apiError(response, 400, error.message || 'Invalid request.'));

app.listen(port, () => {
  console.log(`Test Mode store running at http://localhost:${port}`);
  console.log('Razorpay Test Mode only. No real money can be charged by this app.');
});
