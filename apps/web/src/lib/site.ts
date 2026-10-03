import type { CategoryDto } from '@noors/shared';

/** Absolute origin of the storefront, for canonical URLs, the sitemap and social cards. */
export const siteUrl = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const contactEmail = 'zenifyrr@gmail.com';

/** "Latest Drip" is not a category: it lists every product, newest first. */
export const LATEST_SLUG = 'latest';
export const latestLink = { href: `/shop/${LATEST_SLUG}`, label: 'Latest Drip' };

export interface NavLink {
  href: string;
  label: string;
}

export function navLinksFor(categories: Pick<CategoryDto, 'slug' | 'name'>[]): NavLink[] {
  return [
    latestLink,
    ...categories
      .filter((c) => c.slug !== LATEST_SLUG)
      .map((c) => ({ href: `/shop/${c.slug}`, label: c.name })),
  ];
}

export const companyLinks: NavLink[] = [
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/account', label: 'Your Account' },
];

/** Placeholder brand photography (About page, fallbacks). Replaced when real photos arrive. */
export const lookbook = [1, 2, 3, 4].map((n) => `/placeholder/lookbook-${n}.webp`);

export const productHref = (slug: string) => `/products/${slug}`;
