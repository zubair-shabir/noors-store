import { OWNER } from './support/env.js';
import { placePaidOrder, type PlacedOrder, type Product } from './support/api.js';
import { expect, shopperEmail, test } from './support/fixtures.js';

let product: Product;
let order: PlacedOrder;

test.beforeAll(async ({ admin }) => {
  product = await admin.createProduct({ M: 5, L: 5 });
  order = await placePaidOrder(admin.sizeVariants(product).M!.id, shopperEmail('exchange'));
});

test.afterAll(async ({ admin }) => {
  if (product) await admin.archive(product);
});

test('admin delivers an order, the shopper asks for an exchange and the admin approves it', async ({
  page,
  browser,
}) => {
  const { orderNumber, accessToken } = order;

  await test.step('owner signs in to the dashboard', async () => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/admin\/login/);
  });

  await test.step('opens the newest order and marks it delivered', async () => {
    await page.goto('/admin/orders');
    // Orders are newest first; this test's order is the newest one.
    const newest = page.getByRole('link', { name: /^NR-\d+$/ }).first();
    await expect(newest).toHaveText(orderNumber);
    await newest.click();
    await expect(page.getByRole('heading', { name: `Order ${orderNumber}` })).toBeVisible();

    await page.getByRole('button', { name: 'Mark delivered' }).click();
    const confirm = page.getByRole('dialog', { name: 'Mark as delivered?' });
    await confirm.getByRole('button', { name: 'Mark delivered' }).click();
    await expect(confirm).toBeHidden();
    // The order's timeline records it (the toast has no role to find it by).
    await expect(
      page.getByRole('main').getByText('Marked delivered', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark delivered' })).toBeHidden();
  });

  await test.step('shopper asks for an exchange from the order page', async () => {
    const shopperContext = await browser.newContext();
    try {
      const shopper = await shopperContext.newPage();
      await shopper.addInitScript(() => sessionStorage.setItem('noors-intro-seen', '1'));
      await shopper.goto(`/orders/${orderNumber}?key=${encodeURIComponent(accessToken)}`);
      await expect(
        shopper.getByRole('definition').filter({ hasText: /^Delivered$/ }),
      ).toBeVisible();

      const returns = shopper.getByRole('region', { name: 'Returns and exchanges' });
      await returns.getByRole('button', { name: 'Return or exchange' }).click();
      await returns.getByRole('radio', { name: 'Exchange for another size' }).check();
      await returns.getByRole('checkbox', { name: new RegExp(product.name) }).check();
      await returns.getByLabel('Which size would you like, and why?').fill('Too small, L please');
      await returns.getByRole('button', { name: 'Send request' }).click();
      await expect(returns.getByText('Exchange: Requested')).toBeVisible();
    } finally {
      await shopperContext.close();
    }
  });

  await test.step('owner approves it on the returns page', async () => {
    await page.goto('/admin/returns');
    const request = page.getByRole('article').filter({ hasText: orderNumber });
    await expect(request.getByText('Too small, L please')).toBeVisible();
    await request.getByRole('button', { name: 'Approve' }).click();
    const dialog = page.getByRole('dialog', { name: 'Approve request' });
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(dialog).toBeHidden();
    await expect(request.getByRole('button', { name: 'Approve' })).toBeHidden();
    await expect(request.getByRole('button', { name: 'Mark received' })).toBeVisible();
  });
});
