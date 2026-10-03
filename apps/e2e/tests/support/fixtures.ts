import { test as base, expect, type Page } from '@playwright/test';
import { AdminApi, SRINAGAR, uniqueId } from './api.js';

export { expect };

/**
 * `page` skips the once-a-session intro splash (it covers the store for about three
 * seconds), and `admin` is the dashboard API signed in as the owner, shared by the worker
 * so the sign-in rate limit is not spent on every test.
 */
export const test = base.extend<object, { admin: AdminApi }>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem('noors-intro-seen', '1');
      } catch {
        // No storage: the splash plays and the tests wait for it like a shopper would.
      }
    });
    await use(page);
  },
  admin: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixture's dependencies from this pattern.
    async ({}, use) => {
      const admin = await AdminApi.signIn();
      await use(admin);
      await admin.dispose();
    },
    { scope: 'worker' },
  ],
});

/** An address on example.com that no earlier order used (so first-order codes apply). */
export const shopperEmail = (tag: string) => `e2e-${tag}-${uniqueId()}@example.com`;

/** Fills the guest contact and delivery sections of the checkout page. */
export async function fillGuestCheckout(
  page: Page,
  email: string,
  address: Partial<typeof SRINAGAR> = {},
) {
  const a = { ...SRINAGAR, ...address };
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Full name').fill(a.name);
  await page.getByLabel('Mobile number').fill(a.phone);
  await page.getByLabel('House, building and street').fill(a.line1);
  await page.getByLabel('Pincode').fill(a.pincode);
  await page.getByLabel('City').fill(a.city);
  await page.getByLabel('State').selectOption(a.state);
}

/** The product page's own panel (the page also lists related products with their own buttons). */
export function productPanel(page: Page, name: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { level: 1, name, exact: true }),
  });
}

/** Opens a product page, picks a size and adds one to the bag; the bag drawer opens. */
export async function addToBag(page: Page, slug: string, name: string, size: string) {
  await page.goto(`/products/${slug}`);
  const panel = productPanel(page, name);
  await panel
    .getByRole('group', { name: /^Size/ })
    .getByRole('button', { name: size, exact: true })
    .click();
  await panel.getByRole('button', { name: 'Add to cart', exact: true }).click();
  const bag = page.getByRole('dialog', { name: 'Your cart' });
  await expect(bag.getByRole('link', { name, exact: true })).toBeVisible();
  return bag;
}
