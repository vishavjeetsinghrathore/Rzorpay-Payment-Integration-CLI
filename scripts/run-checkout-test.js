/*
 * This is an end-to-end Test Mode runner. It drives Razorpay's actual hosted
 * Test Checkout and waits for this app's server-side verification. It never
 * manufactures a Razorpay response or a payment ID.
 */
const { spawn } = require('node:child_process');
const readline = require('node:readline/promises');
const { chromium } = require('playwright');
require('dotenv').config();

const baseUrl = process.env.CHECKOUT_TEST_URL || 'http://127.0.0.1:3000';
const useExistingServer = process.env.TEST_SERVER_ALREADY_RUNNING === '1';
const headless = process.env.HEADLESS !== 'false';

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/products`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Server did not become ready at ${baseUrl}.`);
}

async function candidateFrames(page) {
  return page.frames().filter((frame) => /razorpay/i.test(frame.url()));
}

async function clickFirst(page, selectors, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of [...await candidateFrames(page), page.mainFrame()]) {
      for (const selector of selectors) {
        const locator = frame.locator(selector).first();
        if (await locator.isVisible().catch(() => false)) {
          try {
            await locator.click({ timeout: 3_000 });
          } catch {
            // An overlay/backdrop transition can intercept the pointer event
            // even though the control is genuinely visible and clickable.
            await locator.click({ force: true });
          }
          return;
        }
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`Could not find a clickable Checkout control: ${selectors.join(', ')}`);
}

async function fillFirst(page, selectors, value, label) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    for (const frame of [...await candidateFrames(page), page.mainFrame()]) {
      for (const selector of selectors) {
        const locator = frame.locator(selector).first();
        if (await locator.isVisible().catch(() => false)) { await locator.fill(value); return; }
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`Could not find the ${label} input in Razorpay Test Checkout.`);
}

async function completeTestCardPayment(page) {
  await clickFirst(page, ['button:has-text("Card")', '[data-method="card"]', 'text=Card']);
  await fillFirst(page, ['input[name="card[number]"]', 'input[autocomplete="cc-number"]', 'input[placeholder*="Card number" i]'], '5267318187975449', 'test card number');
  await fillFirst(page, ['input[name="card[expiry]"]', 'input[autocomplete="cc-exp"]', 'input[placeholder*="MM / YY" i]'], '12/30', 'expiry');
  await fillFirst(page, ['input[name="card[cvv]"]', 'input[autocomplete="cc-csc"]', 'input[placeholder*="CVV" i]'], '123', 'CVV');
  await clickFirst(page, ['button:has-text("Pay")', 'button:has-text("Proceed")', 'button:has-text("Continue")']);

  // Razorpay Test Checkout can gate on a "Contact details" prompt (mobile +
  // email) before it will proceed to the mock bank confirmation.
  await handleContactDetailsPrompt(page);

  // Razorpay's Test Mode can show a mock bank confirmation. Click it only
  // when it is actually rendered by Razorpay; never replace this with a mock.
  let deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      if (await page.getByRole('heading', { name: 'Payment Success' }).isVisible().catch(() => false)) return;
      await handleContactDetailsPrompt(page);
      const otpWaitMs = await handleOtpPrompt(page);
      if (otpWaitMs !== false) { deadline += otpWaitMs; await page.waitForTimeout(300); continue; }
      for (const frame of [...await candidateFrames(page), page.mainFrame()]) {
        const success = frame.getByRole('button', { name: /^success$/i });
        if (await success.isVisible().catch(() => false)) { await success.click(); continue; }
        // The Contact details gate can return control to the card form,
        // which then needs its own Continue click to actually submit.
        const cardContinue = frame.getByRole('button', { name: 'Continue' }).first();
        if (await cardContinue.isVisible().catch(() => false) && await cardContinue.isEnabled().catch(() => false)) {
          await cardContinue.click({ timeout: 3_000 }).catch(() => cardContinue.click({ force: true }));
        }
      }
    } catch (error) {
      // Checkout can swap out frames mid-navigation (e.g. right after the
      // OTP step submits); treat that as "still in progress", not fatal.
      if (!/detached|Target (page|frame|closed)/i.test(error.message)) throw error;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('Checkout did not return to the verified Payment Success page. Razorpay may have changed its Test Checkout UI or the payment was not captured.');
}

// Picks the Continue button belonging to the same modal as `anchorBox`
// (the modal's own field). There can be another, unrelated "Continue"
// button from the card form underneath the modal, sitting above it instead.
async function continueButtonBelow(frame, anchorBox) {
  const continueButtons = await frame.getByRole('button', { name: 'Continue' }).all();
  let target = null;
  let bestDistance = Infinity;
  for (const button of continueButtons) {
    const box = await button.boundingBox().catch(() => null);
    if (!box) continue;
    if (anchorBox && box.y > anchorBox.y && box.y - anchorBox.y < bestDistance) {
      target = button;
      bestDistance = box.y - anchorBox.y;
    }
  }
  return target ?? continueButtons[continueButtons.length - 1];
}

async function handleContactDetailsPrompt(page) {
  for (const frame of [...await candidateFrames(page), page.mainFrame()]) {
    const headingVisible = await frame.getByText('Contact details').first().isVisible().catch(() => false);
    if (!headingVisible) continue;
    const mobileInput = frame.getByPlaceholder(/mobile number/i).first();
    if (await mobileInput.isVisible().catch(() => false)) {
      await mobileInput.click();
      await mobileInput.fill('');
      await mobileInput.pressSequentially('7305234567', { delay: 30 });
      await mobileInput.blur();
      await page.waitForTimeout(300);
    }
    const mobileBox = await mobileInput.boundingBox().catch(() => null);
    const target = await continueButtonBelow(frame, mobileBox);
    if (target) {
      await target.click({ timeout: 3_000 }).catch(() => target.click({ force: true }));
      await page.waitForTimeout(500);
    }
    return;
  }
}

async function promptForOtp() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const otp = await rl.question('Enter the OTP shown in the Razorpay Test Checkout mock bank screen: ');
    return otp.trim();
  } finally {
    rl.close();
  }
}

// Returns false if no OTP prompt is showing, otherwise the number of
// milliseconds spent waiting on the user to type the OTP (so the caller can
// extend its own timeout budget by that much).
async function handleOtpPrompt(page) {
  for (const frame of [...await candidateFrames(page), page.mainFrame()]) {
    const otpInput = frame.getByPlaceholder(/enter otp/i).first();
    if (!(await otpInput.isVisible().catch(() => false))) continue;
    const currentValue = await otpInput.inputValue().catch(() => '');
    let waitedMs = 0;
    if (!currentValue) {
      const startedAt = Date.now();
      const otp = await promptForOtp();
      waitedMs = Date.now() - startedAt;
      await otpInput.click();
      await otpInput.pressSequentially(otp, { delay: 30 });
    }
    const otpBox = await otpInput.boundingBox().catch(() => null);
    const target = await continueButtonBelow(frame, otpBox);
    if (target) {
      await target.click({ timeout: 3_000 }).catch(() => target.click({ force: true }));
      await page.waitForTimeout(500);
    }
    return waitedMs;
  }
  return false;
}

async function run() {
  let server;
  if (!useExistingServer) {
    server = spawn(process.execPath, ['src/server.js'], { stdio: 'inherit', shell: false });
    server.once('error', (error) => { throw error; });
  }
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless, slowMo: headless ? 0 : 150 });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/?automation=1`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add to Cart' }).nth(0).click();
    await page.getByRole('button', { name: 'Add to Cart' }).nth(1).click();
    await page.getByTestId('pay-button').click();
    await completeTestCardPayment(page);
    const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('verified-payment')));
    if (!result?.verified || result.paymentStatus !== 'captured' || result.captured !== true) {
      throw new Error('The app did not receive a verified captured payment.');
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser?.close();
    if (server && !server.killed) server.kill();
  }
}

run().catch((error) => { console.error(`Test checkout failed: ${error.message}`); process.exitCode = 1; });
