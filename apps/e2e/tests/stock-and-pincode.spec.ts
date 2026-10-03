import type { Product } from './support/api.js';
import {
  addToBag,
  expect,
  fillGuestCheckout,
  productPanel,
  shopperEmail,
  test,
} from './support/fixtures.js';

let product: Product;

test.beforeAll(async ({ admin }) => {
  // S is sold out, M is in stock.
  product = await admin.createProduct({ S: 0, M: 5 });
});

test.afterAll(async ({ admin }) => {
  if (product) await admin.archive(product);
});

test('a sold-out size cannot be added to the bag', async ({ page, admin, request }) => {
  await page.goto(`/products/${product.slug}`);
  const panel = productPanel(page, product.name);
  const sizes = panel.getByRole('group', { name: /^Size/ });

  await sizes.getByRole('button', { name: 'S', exact: true }).click();
  await expect(panel.getByText('This combination is sold out.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Sold out', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Buy now' })).toBeDisabled();

  // The API refuses it too, whatever the page shows.
  const soldOut = admin.sizeVariants(product).S!;
  const res = await request.post('/api/v1/cart/items', {
    data: { variantId: soldOut.id, quantity: 1 },
  });
  expect(res.ok(), `adding a sold-out variant answered ${res.status()}`).toBe(false);

  // The size in stock still works.
  await sizes.getByRole('button', { name: 'M', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled();
});

test('checkout refuses a pincode the couriers do not reach', async ({ page }) => {
  const bag = await addToBag(page, product.slug, product.name, 'M');
  await bag.getByRole('link', { name: 'Checkout' }).click();
  await expect(page).toHaveURL(/\/checkout/);

  // Pincodes starting with 9 (Army Post Offices) are not served by the mock courier.
  await fillGuestCheckout(page, shopperEmail('pincode'), { pincode: '990001' });
  await expect(page.getByText("We can't deliver to 990001 yet")).toBeVisible();

  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByText("We can't deliver to this pincode yet")).toBeVisible();
  await expect(page.getByLabel('Pincode')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Test payment')).toHaveCount(0);
  await expect(page).toHaveURL(/\/checkout/);
});
