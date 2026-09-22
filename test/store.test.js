const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCart, publicProducts } = require('../src/store');

test('exposes the two hardcoded products', () => {
  assert.deepEqual(publicProducts().map((product) => product.id), ['pen', 'pencil']);
});

test('calculates cart quantities and total on the server', () => {
  const cart = buildCart([{ productId: 'pen', quantity: 2 }, { productId: 'pencil', quantity: 1 }]);
  assert.equal(cart.totalPaise, 800);
  assert.deepEqual(cart.items.map(({ productId, quantity }) => ({ productId, quantity })), [{ productId: 'pen', quantity: 2 }, { productId: 'pencil', quantity: 1 }]);
});

test('rejects unknown products and invalid quantities', () => {
  assert.throws(() => buildCart([{ productId: 'eraser', quantity: 1 }]));
  assert.throws(() => buildCart([{ productId: 'pen', quantity: 0 }]));
});
