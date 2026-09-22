#!/usr/bin/env node
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { createClient, describeRazorpayError } = require('./razorpay-client');
const { rupeesToPaise, requireId, optionalCustomer } = require('./validation');
const { verifyOrderPayment, verifyPaymentLinkPayment } = require('./verify');

const rl = readline.createInterface({ input, output });
const ask = async (question) => (await rl.question(question)).trim();

function printHeader(mode) {
  const live = mode === 'live';
  console.log(`\nRazorpay Payment Link + Order CLI — ${live ? 'LIVE MODE' : 'TEST MODE'}`);
  console.log(live
    ? 'Warning: actions in this session can create real payment requests. This tool never marks a payment as successful itself.\n'
    : 'This tool calls Razorpay. It never marks a payment as successful itself.\n');
}

async function askAmount() {
  while (true) {
    try { return rupeesToPaise(await ask('Amount in INR (example 299.50): ₹')); }
    catch (error) { console.log(`Input error: ${error.message}`); }
  }
}

async function createOrder(client) {
  const amount = await askAmount();
  const receipt = await ask('Your unique receipt reference: ');
  if (!receipt) throw new Error('A receipt reference is required.');
  const notes = { demo: 'razorpay-cli', requested_by: 'merchant' };
  const order = await client.orders.create({ amount, currency: 'INR', receipt, notes });
  console.log('\nOrder created with Razorpay:');
  console.table([{ id: order.id, amount: `₹${(order.amount / 100).toFixed(2)}`, status: order.status, receipt: order.receipt }]);
  console.log('Save the order ID. An Order is a merchant-side payment record; it does not take money by itself.');
}

async function createPaymentLink(client, mode) {
  if (mode === 'live') {
    const confirmation = await ask('LIVE MODE: type CREATE_LIVE_LINK to create a real payment request: ');
    if (confirmation !== 'CREATE_LIVE_LINK') {
      console.log('Live Payment Link creation cancelled.');
      return;
    }
  }
  const amount = await askAmount();
  const referenceId = await ask('Unique payment-link reference (max 40 characters): ');
  if (!referenceId || referenceId.length > 40) throw new Error('A non-empty reference of 40 characters or fewer is required.');
  const description = await ask('Description: ');
  const name = await ask('Customer name (optional): ');
  const email = await ask('Customer email (optional): ');
  const contact = await ask('Customer phone with country code (optional, e.g. +919999999999): ');
  const customer = optionalCustomer({ name, email, contact });
  const request = {
    amount,
    currency: 'INR',
    accept_partial: false,
    reference_id: referenceId,
    description: description || `Payment requested through Razorpay ${mode === 'live' ? 'Live' : 'Test'} Mode CLI demo`,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { demo: 'razorpay-cli', reference_id: referenceId }
  };
  if (Object.keys(customer).length) request.customer = customer;
  const link = await client.paymentLink.create(request);
  console.log('\nPayment Link created with Razorpay:');
  console.table([{ id: link.id, status: link.status, amount: `₹${(link.amount / 100).toFixed(2)}`, reference: link.reference_id }]);
  console.log(`\nOpen this Razorpay-hosted URL in a browser to authorize a ${mode === 'live' ? 'real' : 'Test Mode'} payment:\n${link.short_url}`);
  console.log(mode === 'live'
    ? 'The payer must complete authorization in their own bank/UPI app or card flow. This CLI never collects credentials.'
    : 'Use Razorpay’s Test Mode payment instructions/test credentials. This CLI does not collect card or UPI credentials.');
}

async function checkPaymentLink(client) {
  const id = requireId(await ask('Payment Link ID (plink_...): '), 'plink_', 'Payment Link ID');
  const link = await client.paymentLink.fetch(id);
  console.log('\nLive status from Razorpay:');
  console.table([{ id: link.id, status: link.status, paid: `₹${((link.amount_paid || 0) / 100).toFixed(2)}`, due: `₹${((link.amount_due || 0) / 100).toFixed(2)}`, payment_id: link.payment_id || '—' }]);
  if (link.payment_id) await showPayment(client, link.payment_id);
}

async function showPayment(client, suppliedId) {
  const id = requireId(suppliedId || await ask('Payment ID (pay_...): '), 'pay_', 'Payment ID');
  const payment = await client.payments.fetch(id);
  console.log('\nLive payment details from Razorpay:');
  console.table([{ id: payment.id, status: payment.status, captured: payment.captured, amount: `₹${(payment.amount / 100).toFixed(2)}`, method: payment.method || '—', order_id: payment.order_id || '—' }]);
  if (payment.status !== 'captured') console.log('Do not fulfil based on this result. A captured status is the relevant successful state for this demo.');
}

async function verifyMenu(keySecret) {
  const kind = await ask('Verify (1) Order payment callback or (2) Payment Link callback? ');
  if (kind === '1') {
    const valid = verifyOrderPayment({ orderId: requireId(await ask('razorpay_order_id: '), 'order_', 'Order ID'), paymentId: requireId(await ask('razorpay_payment_id: '), 'pay_', 'Payment ID'), signature: await ask('razorpay_signature: '), secret: keySecret });
    console.log(valid ? 'Signature is valid. Now fetch the payment and require status captured.' : 'Signature is NOT valid. Treat the callback as untrusted.');
  } else if (kind === '2') {
    const valid = verifyPaymentLinkPayment({ paymentLinkId: requireId(await ask('razorpay_payment_link_id: '), 'plink_', 'Payment Link ID'), referenceId: await ask('razorpay_payment_link_reference_id: '), status: await ask('razorpay_payment_link_status: '), paymentId: requireId(await ask('razorpay_payment_id: '), 'pay_', 'Payment ID'), signature: await ask('razorpay_signature: '), secret: keySecret });
    console.log(valid ? 'Signature is valid. Now fetch the payment and require status captured.' : 'Signature is NOT valid. Treat the callback as untrusted.');
  } else {
    console.log('Choose 1 or 2.');
  }
}

async function main() {
  let setup;
  try { setup = createClient(); }
  catch (error) { console.error(`Configuration error: ${error.message}`); process.exitCode = 1; return; }
  printHeader(setup.mode);
  while (true) {
    console.log('\n1. Create Order\n2. Create Payment Link\n3. Check Payment Link status\n4. Fetch Payment by ID\n5. Verify callback signature\n0. Exit');
    const choice = await ask('Choose an action: ');
    if (choice === '0') break;
    try {
      if (choice === '1') await createOrder(setup.client);
      else if (choice === '2') await createPaymentLink(setup.client, setup.mode);
      else if (choice === '3') await checkPaymentLink(setup.client);
      else if (choice === '4') await showPayment(setup.client);
      else if (choice === '5') await verifyMenu(setup.keySecret);
      else console.log('Choose a listed menu number.');
    } catch (error) { console.error(`\nRequest failed: ${describeRazorpayError(error)}`); }
  }
  rl.close();
  console.log('Goodbye.');
}

main().catch((error) => { console.error(describeRazorpayError(error)); process.exitCode = 1; });
