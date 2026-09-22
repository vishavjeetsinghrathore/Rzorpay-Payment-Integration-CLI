const Razorpay = require('razorpay');
const { getConfig } = require('./config');

function createClient() {
  const { keyId, keySecret, mode } = getConfig();
  return { client: new Razorpay({ key_id: keyId, key_secret: keySecret }), keySecret, mode };
}

function describeRazorpayError(error) {
  const details = error?.error || error;
  const code = details?.code ? `[${details.code}] ` : '';
  const description = details?.description || details?.reason || error?.message || 'Unknown Razorpay error';
  return `${code}${description}`;
}

module.exports = { createClient, describeRazorpayError };
