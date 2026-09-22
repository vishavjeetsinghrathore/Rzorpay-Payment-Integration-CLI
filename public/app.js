const cart = new Map();
const productsElement = document.querySelector('#products');
const cartLinesElement = document.querySelector('#cart-lines');
const totalElement = document.querySelector('#cart-total');
const payButton = document.querySelector('#pay-button');
const message = document.querySelector('#message');
const money = (paise) => `₹${(paise / 100).toFixed(2)}`;
const automationMode = new URLSearchParams(window.location.search).has('automation');

function cartPayload() { return [...cart.entries()].map(([productId, quantity]) => ({ productId, quantity })); }

function renderCart(products) {
  const lines = cartPayload().map(({ productId, quantity }) => ({ product: products.find((item) => item.id === productId), quantity }));
  const total = lines.reduce((sum, { product, quantity }) => sum + product.pricePaise * quantity, 0);
  cartLinesElement.innerHTML = lines.length ? lines.map(({ product, quantity }) => `<p>${product.name} × ${quantity} — ${money(product.pricePaise * quantity)}</p>`).join('') : 'Your cart is empty.';
  totalElement.textContent = money(total); payButton.disabled = lines.length === 0;
}

async function loadProducts() {
  const { products } = await fetch('/api/products').then((response) => response.json());
  productsElement.innerHTML = products.map((product) => `<article><h2>${product.name}</h2><p>${product.priceLabel}</p><button data-product-id="${product.id}">Add to Cart</button></article>`).join('');
  productsElement.addEventListener('click', (event) => { const id = event.target.dataset.productId; if (!id) return; cart.set(id, (cart.get(id) || 0) + 1); renderCart(products); });
  renderCart(products);
}

payButton.addEventListener('click', async () => {
  payButton.disabled = true; message.textContent = 'Creating secure Test Mode order…';
  try {
    const orderResponse = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cartPayload() }) });
    const order = await orderResponse.json(); if (!orderResponse.ok) throw new Error(order.error);
    const checkout = new Razorpay({
      key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId,
      name: 'Test Stationery Store', description: 'Test Mode order',
      prefill: automationMode ? { name: 'Test Shopper', email: 'test.shopper@example.com', contact: '9999999999' } : undefined,
      handler: async (paymentResponse) => {
        try {
          const verifyResponse = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paymentResponse) });
          const result = await verifyResponse.json(); if (!verifyResponse.ok) throw new Error(result.error);
          sessionStorage.setItem('verified-payment', JSON.stringify(result)); window.location.assign('/success.html');
        } catch (error) { message.textContent = `Verification failed: ${error.message}`; payButton.disabled = false; }
      },
      modal: { ondismiss: () => { message.textContent = 'Checkout dismissed.'; payButton.disabled = false; } }
    });
    checkout.open(); message.textContent = '';
  } catch (error) { message.textContent = `Could not start checkout: ${error.message}`; payButton.disabled = false; }
});
loadProducts().catch((error) => { message.textContent = `Could not load products: ${error.message}`; });
