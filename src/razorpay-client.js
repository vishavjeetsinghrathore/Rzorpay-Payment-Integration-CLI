const Razorpay = require('razorpay');
const { getConfig } = require('./config');
const { createLogger } = require('./logger');

const log = createLogger('razorpay-client.js');

function createClient() {
  log('createClient() called');
  const { keyId, keySecret, mode } = getConfig();
  log('[razorpay] constructing Razorpay SDK client', { keyId, mode });
  return { client: new Razorpay({ key_id: keyId, key_secret: keySecret }), keySecret, mode };
}

function describeRazorpayError(error) {
  const details = error?.error || error;
  const code = details?.code ? `[${details.code}] ` : '';
  const description = details?.description || details?.reason || error?.message || 'Unknown Razorpay error';
  log('[razorpay] describeRazorpayError()', `${code}${description}`);
  return `${code}${description}`;
}

module.exports = { createClient, describeRazorpayError };
