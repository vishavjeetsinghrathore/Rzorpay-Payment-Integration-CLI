const log = (label, details) => console.log(`[client][success.js] ${label}`, details ?? '');

log('reading sessionStorage("verified-payment")');
const result = JSON.parse(sessionStorage.getItem('verified-payment') || 'null');
const target = document.querySelector('#result');
if (!result?.verified) {
  log('no verified payment found in this session');
  target.innerHTML = '<p>No verified payment is available in this browser session.</p>';
} else {
  log('rendering verified payment result', { paymentId: result.paymentId, orderId: result.orderId });
  const rows = result.products.map((item) => `<li>${item.name}: ${item.quantity} × ₹${(item.unitPricePaise / 100).toFixed(2)} = ₹${(item.lineTotalPaise / 100).toFixed(2)}</li>`).join('');
  target.innerHTML = `<dl><dt>Payment status</dt><dd>${result.paymentStatus}</dd><dt>Captured</dt><dd>${result.captured}</dd><dt>Payment ID</dt><dd>${result.paymentId}</dd><dt>Payment method</dt><dd>${result.paymentMethod}</dd><dt>Order ID</dt><dd>${result.orderId}</dd><dt>Total</dt><dd>${result.totalLabel}</dd></dl><h2>Purchased products</h2><ul>${rows}</ul>`;
}
