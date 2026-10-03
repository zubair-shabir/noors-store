import { SRINAGAR } from './support/api.js';
import { expect, fillGuestCheckout, productPanel, shopperEmail, test } from './support/fixtures.js';

const PRODUCT = { slug: 'utility-jacket-ecru', name: 'Utility Jacket Ecru', category: 'Jackets' };

test.beforeAll(async ({ admin }) => {
  // Every run buys one; keep the seeded product in stock so the test never meets "Sold out".
  await admin.ensureStock(await admin.productBySlug(PRODUCT.slug), 'M');
});

test('browse, buy with a coupon and pay online, then track the order', async ({ page }) => {
  const email = shopperEmail('online');

  await test.step('home → category → product', async () => {
    await page.goto('/');
    await page
      .getByRole('main')
      .getByRole('link', { name: new RegExp(`^${PRODUCT.category}`, 'i') })
      .first()
      .click();
    await expect(page).toHaveURL(/\/shop\/jackets/);
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT.category })).toBeVisible();
    await page
      .getByRole('heading', { name: PRODUCT.name, exact: true })
      .getByRole('link')
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/products/${PRODUCT.slug}`));
  });

  await test.step('pick a size and add to the bag', async () => {
    const panel = productPanel(page, PRODUCT.name);
    const sizes = panel.getByRole('group', { name: /^Size/ });
    await sizes.getByRole('button', { name: 'M', exact: true }).click();
    await expect(sizes.getByRole('button', { name: 'M', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await panel.getByRole('button', { name: 'Add to cart', exact: true }).click();
  });

  await test.step('bag drawer → checkout', async () => {
    const bag = page.getByRole('dialog', { name: 'Your cart' });
    await expect(bag.getByRole('link', { name: PRODUCT.name, exact: true })).toBeVisible();
    await expect(bag.getByText('M', { exact: true })).toBeVisible();
    await bag.getByRole('link', { name: 'Checkout' }).click();
    await expect(page).toHaveURL(/\/checkout/);
  });

  await test.step('guest details, Srinagar 190001 address and a coupon', async () => {
    await fillGuestCheckout(page, email);
    await expect(page.getByText(`Delivery to ${SRINAGAR.pincode} by`)).toBeVisible();

    const summary = page.getByRole('complementary', { name: 'Order summary' });
    await summary.getByLabel('Coupon code').fill('WINTER50');
    await summary.getByRole('button', { name: 'Apply' }).click();
    await expect(summary.getByText('WINTER50', { exact: true })).toBeVisible();
    await expect(summary.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(summary.getByText('Discount (WINTER50)')).toBeVisible();
  });

  let orderNumber = '';
  await test.step('pay in the test payment dialog', async () => {
    await page.getByRole('button', { name: /^Pay ₹/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Test payment')).toBeVisible();
    orderNumber = (await dialog.getByText(/Order NR-\d+/).textContent())!.match(/NR-\d+/)![0];
    await dialog.getByRole('button', { name: /^Pay ₹/ }).click();
  });

  await test.step('the confirmation thanks the shopper and shows the order number', async () => {
    await expect(page).toHaveURL(new RegExp(`/orders/${orderNumber}\\?key=`));
    await expect(page.getByRole('heading', { level: 1, name: 'Thank you' })).toBeVisible();
    await expect(page.getByText(`Order ${orderNumber}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`We will email ${email} when it ships`)).toBeVisible();
    await expect(page.getByText(PRODUCT.name).first()).toBeVisible();
    await expect(page.getByText('Discount (WINTER50)')).toBeVisible();
  });

  await test.step('/track finds the order by its number and phone', async () => {
    await page.goto('/track');
    await page.getByLabel('Order number').fill(orderNumber);
    await page.getByLabel('Phone').fill(SRINAGAR.phone);
    await page.getByRole('button', { name: 'Track' }).click();
    await expect(page.getByText(`Order ${orderNumber}`, { exact: true })).toBeVisible();
    await expect(page.getByText(PRODUCT.name).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/track\\?order=${orderNumber}`));
  });
});
