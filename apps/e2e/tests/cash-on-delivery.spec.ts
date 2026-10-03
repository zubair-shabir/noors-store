import type { Product, StoreSettings } from './support/api.js';
import { addToBag, expect, fillGuestCheckout, shopperEmail, test } from './support/fixtures.js';

let product: Product;
let previous: StoreSettings | undefined;

test.beforeAll(async ({ admin }) => {
  product = await admin.createProduct({ M: 5 });
  previous = await admin.settings();
  // Cash on delivery on, with a ₹49 charge.
  await admin.saveSettings({ ...previous, cod: { enabled: true, fee: 4900 } });
});

test.afterAll(async ({ admin }) => {
  if (previous) await admin.saveSettings(previous);
  if (product) await admin.archive(product);
});

test('cash on delivery places the order without the payment dialog', async ({ page }) => {
  const email = shopperEmail('cod');
  const paymentCalls: string[] = [];
  page.on('request', (req) => {
    if (/\/checkout\/(mock-pay|verify)/.test(req.url())) paymentCalls.push(req.url());
  });

  const bag = await addToBag(page, product.slug, product.name, 'M');
  await bag.getByRole('link', { name: 'Checkout' }).click();
  await fillGuestCheckout(page, email);

  await page.getByRole('radio', { name: /Cash on delivery/ }).check();
  await expect(page.getByText(/₹49(\.00)? COD charge/)).toBeVisible();
  await page.getByRole('button', { name: /^Place order · ₹/ }).click();

  await expect(page).toHaveURL(/\/orders\/NR-\d+\?key=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Thank you' })).toBeVisible();
  await expect(page.getByText(/ready for the courier/)).toBeVisible();
  await expect(page.getByText('Shipping and COD charge')).toBeVisible();
  await expect(page.getByText('Test payment')).toHaveCount(0);
  expect(paymentCalls, 'no online payment should be attempted').toEqual([]);
});
