require('dotenv').config();

function getConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const mode = (process.env.RAZORPAY_MODE || 'test').trim().toLowerCase();

  if (!keyId || !keySecret) {
    throw new Error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET. Copy .env.example to .env and add matching Razorpay keys.');
  }

  if (mode !== 'test') {
    throw new Error('This project is Test Mode only. Set RAZORPAY_MODE=test and use an rzp_test_ key.');
  }

  if (!keyId.startsWith('rzp_test_')) {
    throw new Error('This project accepts Test Mode keys only. RAZORPAY_KEY_ID must start with rzp_test_.');
  }

  return { keyId, keySecret, mode };
}

module.exports = { getConfig };
