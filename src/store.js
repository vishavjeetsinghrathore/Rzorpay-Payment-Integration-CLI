const products = require('../data/products.json');
const { createLogger } = require('./logger');

const log = createLogger('store.js');
const byId = new Map(products.map((product) => [product.id, product]));

function publicProducts() {
  log('publicProducts() called', { count: products.length });
  return products.map(({ id, name, pricePaise, priceLabel, icon, description }) => ({ id, name, pricePaise, priceLabel, icon, description }));
}

function buildCart(items) {
  log('buildCart() called', items);
  if (!Array.isArray(items) || items.length === 0) { log('buildCart() FAILED — empty cart'); throw new Error('Your cart is empty.'); }
  const quantities = new Map();
  for (const line of items) {
    const productId = String(line?.productId || '');
    const quantity = Number(line?.quantity);
    if (!byId.has(productId)) { log('buildCart() FAILED — unknown product', productId); throw new Error(`Unknown product: ${productId}.`); }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      log('buildCart() FAILED — invalid quantity', { productId, quantity });
      throw new Error('Each product quantity must be a whole number from 1 to 10.');
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  const cart = [...quantities.entries()].map(([productId, quantity]) => {
    const product = byId.get(productId);
    return { productId: product.id, name: product.name, quantity, unitPricePaise: product.pricePaise, lineTotalPaise: product.pricePaise * quantity };
  });
  const result = { items: cart, totalPaise: cart.reduce((sum, item) => sum + item.lineTotalPaise, 0) };
  log('buildCart() OK', { totalPaise: result.totalPaise, lines: result.items.length });
  return result;
}

module.exports = { publicProducts, buildCart };
