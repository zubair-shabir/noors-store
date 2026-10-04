import { placePaidOrder, type Product } from './support/api.js';
import { expect, shopperEmail, test } from './support/fixtures.js';

let product: Product;

test.beforeAll(async ({ admin }) => {
  product = await admin.createProduct({ M: 5 });
});

test.afterAll(async ({ admin }) => {
  if (product) await admin.archive(product);
});

test('a shopper signs in with an emailed code and sees their orders', async ({ page, admin }) => {
  const email = shopperEmail('signin');
  // An earlier guest order with the same email belongs to the account once signed in.
  const { orderNumber } = await placePaidOrder(admin.sizeVariants(product).M!.id, email);

  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();

  // Without an email provider (development), the code is shown on the form.
  const note = page.getByText(/Development mode, no email was sent/);
  await expect(note).toBeVisible();
  const code = (await note.textContent())?.match(/\b\d{6}\b/)?.[0];
  expect(code, 'the development code should be on the form').toBeTruthy();
  await page.getByLabel('Code').fill(code!);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  const orders = page.getByRole('region', { name: 'Orders' });
  const row = orders.getByRole('link', { name: new RegExp(orderNumber) });
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${orderNumber}`));
  await expect(page.getByText(product.name).first()).toBeVisible();
});
