const products = require('../data/products.json');
const byId = new Map(products.map((product) => [product.id, product]));

function publicProducts() {
  return products.map(({ id, name, pricePaise, priceLabel }) => ({ id, name, pricePaise, priceLabel }));
}

function buildCart(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Your cart is empty.');
  const quantities = new Map();
  for (const line of items) {
    const productId = String(line?.productId || '');
    const quantity = Number(line?.quantity);
    if (!byId.has(productId)) throw new Error(`Unknown product: ${productId}.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('Each product quantity must be a whole number from 1 to 10.');
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  const cart = [...quantities.entries()].map(([productId, quantity]) => {
    const product = byId.get(productId);
    return { productId: product.id, name: product.name, quantity, unitPricePaise: product.pricePaise, lineTotalPaise: product.pricePaise * quantity };
  });
  return { items: cart, totalPaise: cart.reduce((sum, item) => sum + item.lineTotalPaise, 0) };
}

module.exports = { publicProducts, buildCart };
