const cart = new Map();
const productsElement = document.querySelector('#products');
const cartLinesElement = document.querySelector('#cart-lines');
const cartCountElement = document.querySelector('#cart-count');
const clearCartButton = document.querySelector('#clear-cart');
const totalElement = document.querySelector('#cart-total');
const payButton = document.querySelector('#pay-button');
const message = document.querySelector('#message');
const money = (paise) => `₹${(paise / 100).toFixed(2)}`;
const automationMode = new URLSearchParams(window.location.search).has('automation');
const MAX_QUANTITY = 10;
const log = (label, details) => console.log(`[client][app.js] ${label}`, details ?? '');
const razorpayLog = (label, details) => console.log(`[client][razorpay] ${label}`, details ?? '');

function cartPayload() { return [...cart.entries()].map(([productId, quantity]) => ({ productId, quantity })); }

function setQuantity(productId, quantity) {
  log('setQuantity() called', { productId, quantity });
  if (quantity <= 0) cart.delete(productId);
  else cart.set(productId, Math.min(quantity, MAX_QUANTITY));
}

function renderProducts(products) {
  log('renderProducts() called', { count: products.length });
  productsElement.innerHTML = products.map((product) => `
    <article>
      <span class="product-icon" aria-hidden="true">${product.icon || '🛒'}</span>
      <h2>${product.name}</h2>
      <p class="product-description">${product.description || ''}</p>
      <p class="price">${product.priceLabel}</p>
      <button data-product-id="${product.id}" data-testid="add-${product.id}">Add to Cart</button>
    </article>
  `).join('');
}

function renderCart(products) {
  log('renderCart() called');
  const lines = cartPayload().map(({ productId, quantity }) => ({ product: products.find((item) => item.id === productId), quantity }));
  const total = lines.reduce((sum, { product, quantity }) => sum + product.pricePaise * quantity, 0);

  cartLinesElement.innerHTML = lines.length
    ? lines.map(({ product, quantity }) => `
        <div class="cart-line" data-product-id="${product.id}">
          <span class="cart-line-icon" aria-hidden="true">${product.icon || '🛒'}</span>
          <span class="cart-line-name">${product.name}</span>
          <div class="qty-controls">
            <button type="button" class="qty-button" data-action="decrement" aria-label="Decrease ${product.name} quantity">−</button>
            <span class="qty-value">${quantity}</span>
            <button type="button" class="qty-button" data-action="increment" aria-label="Increase ${product.name} quantity" ${quantity >= MAX_QUANTITY ? 'disabled' : ''}>+</button>
          </div>
          <span class="cart-line-total">${money(product.pricePaise * quantity)}</span>
          <button type="button" class="remove-button" data-action="remove" aria-label="Remove ${product.name} from cart">✕</button>
        </div>
      `).join('')
    : 'Your cart is empty.';

  totalElement.textContent = money(total);
  payButton.disabled = lines.length === 0;

  const itemCount = lines.reduce((sum, { quantity }) => sum + quantity, 0);
  cartCountElement.hidden = itemCount === 0;
  cartCountElement.textContent = itemCount;
  clearCartButton.hidden = lines.length === 0;
}

async function loadProducts() {
  log('-> fetch GET /api/products');
  const { products } = await fetch('/api/products').then((response) => response.json());
  log('<- products loaded', products.length);
  renderProducts(products);

  productsElement.addEventListener('click', (event) => {
    const id = event.target.dataset.productId;
    if (!id) return;
    setQuantity(id, (cart.get(id) || 0) + 1);
    log('cart updated (client-side only, no network call)', cartPayload());
    renderCart(products);
  });

  cartLinesElement.addEventListener('click', (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    const productId = event.target.closest('.cart-line')?.dataset.productId;
    if (!productId) return;
    const current = cart.get(productId) || 0;
    if (action === 'increment') setQuantity(productId, current + 1);
    else if (action === 'decrement') setQuantity(productId, current - 1);
    else if (action === 'remove') cart.delete(productId);
    renderCart(products);
  });

  clearCartButton.addEventListener('click', () => { cart.clear(); renderCart(products); });

  renderCart(products);
}

payButton.addEventListener('click', async () => {
  payButton.disabled = true; message.textContent = 'Creating secure Test Mode order…';
  log('Pay button clicked, cart', cartPayload());
  try {
    log('-> fetch POST /api/orders');
    const orderResponse = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cartPayload() }) });
    const order = await orderResponse.json(); if (!orderResponse.ok) throw new Error(order.error);
    log('<- order created by server', { orderId: order.orderId, amount: order.amount });

    razorpayLog('constructing checkout instance: new Razorpay({...})', { orderId: order.orderId, amount: order.amount });
    const checkout = new Razorpay({
      key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId,
      name: 'Test Stationery Store', description: 'Test Mode order',
      prefill: automationMode ? { name: 'Test Shopper', email: 'test.shopper@example.com', contact: '9999999999' } : undefined,
      handler: async (paymentResponse) => {
        razorpayLog('handler fired — Razorpay confirms payment succeeded', paymentResponse);
        try {
          log('-> fetch POST /api/payments/verify');
          const verifyResponse = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paymentResponse) });
          const result = await verifyResponse.json(); if (!verifyResponse.ok) throw new Error(result.error);
          log('<- server verified payment', result);
          sessionStorage.setItem('verified-payment', JSON.stringify(result));
          log('redirecting to /success.html');
          window.location.assign('/success.html');
        } catch (error) { log('verification failed', error.message); message.textContent = `Verification failed: ${error.message}`; payButton.disabled = false; }
      },
      modal: {
        ondismiss: () => { razorpayLog('modal.ondismiss — user closed the checkout modal'); message.textContent = 'Checkout dismissed.'; payButton.disabled = false; }
      }
    });

    checkout.on('payment.failed', (response) => {
      razorpayLog('event "payment.failed" — Razorpay reports the payment failed', response.error);
      message.textContent = `Payment failed: ${response.error?.description || 'Unknown error.'}`;
      payButton.disabled = false;
    });

    razorpayLog('-> checkout.open() — handing off to Razorpay\'s hosted UI (iframe/modal talks directly to Razorpay, not this app)');
    checkout.open();
    message.textContent = '';
  } catch (error) { log('could not start checkout', error.message); message.textContent = `Could not start checkout: ${error.message}`; payButton.disabled = false; }
});
loadProducts().catch((error) => { message.textContent = `Could not load products: ${error.message}`; });
