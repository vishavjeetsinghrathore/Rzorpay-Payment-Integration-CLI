# Razorpay Test Mode e-commerce pipeline

This is a deliberately **Test Mode-only** Node.js e-commerce demo. It has a small frontend, a server-owned cart and Razorpay Order flow, server-side signature verification, fetched-payment validation, and an optional Playwright runner that operates Razorpay's actual Test Checkout in a headless browser. It never creates a Live Mode payment or invents a successful payment response.

## What is included

- Hardcoded product catalog in [data/products.json](data/products.json): Pen ₹2.00 and Pencil ₹4.00.
- Frontend product list, Add to Cart controls, cart total, Razorpay Test Checkout, and verified success page.
- Backend endpoint that recalculates all cart prices and quantities, creates a Razorpay Test Order, and keeps the API secret server-side.
- Backend verification that checks the Checkout HMAC signature, fetches the payment from Razorpay, and requires matching Order ID, amount, INR currency, and `captured` status.
- Headless Playwright runner that adds one pen and one pencil, uses Razorpay Test Checkout, and prints the verified result. It does not mock Razorpay.

## First-time setup

1. Regenerate any Test key whose secret was shared, committed, or placed in `.env.example`.
2. In Razorpay Dashboard, select **Test Mode** and generate a Test Mode API key pair.
3. Copy `.env.example` to `.env` and add only your Test Mode credentials:

```env
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
PORT=3000
```

4. Install packages and Playwright's Chromium browser:

```powershell
npm.cmd install
npm.cmd run install:browsers
```

## Run the store

```powershell
npm.cmd start
```

Open `http://localhost:3000`. Add a pen and/or pencil, then choose **Pay with Razorpay Test Checkout**. The browser receives only the Test key ID; the secret stays in `.env` on the server.

On a successful checkout, the frontend posts the payment ID, Order ID, and signature to the backend. The backend verifies the signature against its stored Order ID, fetches the payment directly from Razorpay, and only then displays the verification result.

## Fully headless end-to-end Test Checkout

With valid Test Mode credentials and Chromium installed, run:

```powershell
npm.cmd run test:checkout
```

The runner starts the local server, launches Chromium in headless mode, adds one of each product, opens Razorpay Test Checkout, fills Test Mode customer/card fields, completes Razorpay's mock test flow if it appears, and prints the server-verified result. It fails instead of reporting success if Razorpay changes its hosted Test Checkout controls, the test account cannot create an Order, signature validation fails, or Razorpay does not report a captured payment.

This runner sends no real credentials or money. The card number is a public Test Mode card value and works only in the Razorpay Test environment. Do not alter this project to automate Live Mode checkout.

## Verification output

The success page and Playwright output contain:

- payment status and captured flag
- Razorpay payment ID and payment method
- Razorpay Order ID
- purchased products and quantities
- server-calculated total amount

## Safety and limits

- `src/config.js` rejects any mode other than `test` and every non-`rzp_test_` key ID.
- Do not put secrets in the frontend, product JSON, source code, or `.env.example`.
- The local order cache is in memory and is intentionally for demos only; restarting the server invalidates unfinished checkout sessions.
- Razorpay Test Mode is a simulation: no real money is deducted. Standard Checkout returns a payment ID, Order ID, and signature after success; that signature must be verified server-side. [Razorpay Checkout handling](https://razorpay.com/docs/server-integration/python/test-app/) and [signature-verification requirements](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/).
- Razorpay recommends checking that successful payments are `captured`; this app does that API fetch before showing success. [Razorpay status guidance](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/)

## Local tests

```powershell
npm.cmd test
```

The original CLI remains available for learning-only resource calls:

```powershell
npm.cmd run cli
```
