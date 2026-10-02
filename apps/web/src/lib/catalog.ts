import { rupeesToPaise, type Paise } from '@noors/shared';

/*
 * Placeholder catalogue for the design-system step. Images are cropped from the
 * reference site recording and will be replaced by the admin-managed catalogue
 * served by the API in Steps 3-5.
 */

export type CategorySlug = 'latest' | 'hoodies' | 'jackets' | 'overshirts';

export interface Category {
  slug: CategorySlug;
  name: string;
  image: string;
  detailImage: string;
}

export interface Product {
  slug: string;
  name: string;
  category: CategorySlug;
  price: Paise;
  compareAtPrice?: Paise;
  images: [string, ...string[]];
  sizes: string[];
}

const img = (name: string) => `/placeholder/${name}.webp`;

export const categories: Category[] = [
  {
    slug: 'jackets',
    name: 'Jackets',
    image: img('lookbook-1'),
    detailImage: img('utility-jacket-ecru-1'),
  },
  {
    slug: 'hoodies',
    name: 'Hoodies',
    image: img('kashmir-heritage-hoodie-1'),
    detailImage: img('stone-white-jacquard-hoodie-1'),
  },
  {
    slug: 'overshirts',
    name: 'Overshirts',
    image: img('lookbook-4'),
    detailImage: img('midnight-floral-jacket-1'),
  },
  {
    slug: 'latest',
    name: 'Latest Drip',
    image: img('lookbook-2'),
    detailImage: img('kashmir-heritage-hoodie-2'),
  },
];

export const products: Product[] = [
  {
    slug: 'utility-jacket-ecru',
    name: 'Utility Jacket Ecru',
    category: 'jackets',
    price: rupeesToPaise(4999),
    compareAtPrice: rupeesToPaise(5999),
    images: [img('utility-jacket-ecru-1'), img('utility-jacket-ecru-2')],
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    slug: 'kashmir-heritage-hoodie',
    name: 'Kashmir Heritage Hoodie',
    category: 'hoodies',
    price: rupeesToPaise(2499),
    compareAtPrice: rupeesToPaise(2999),
    images: [img('kashmir-heritage-hoodie-1'), img('kashmir-heritage-hoodie-2')],
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    slug: 'midnight-floral-jacket',
    name: 'Midnight Floral Jacket',
    category: 'jackets',
    price: rupeesToPaise(5499),
    compareAtPrice: rupeesToPaise(6499),
    images: [img('midnight-floral-jacket-1')],
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    slug: 'stone-white-jacquard-hoodie',
    name: 'Stone White Jacquard Hoodie',
    category: 'hoodies',
    price: rupeesToPaise(2499),
    compareAtPrice: rupeesToPaise(2999),
    images: [img('stone-white-jacquard-hoodie-1'), img('kashmir-heritage-hoodie-1')],
    sizes: ['S', 'M', 'L', 'XL'],
  },
];

export const featuredProducts = [products[0], products[1], products[2]];
export const latestProducts = [products[1], products[3], products[0]];

export const lookbook = [1, 2, 3, 4].map((n) => img(`lookbook-${n}`));

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getProductsByCategory(slug: CategorySlug): Product[] {
  return slug === 'latest' ? latestProducts : products.filter((p) => p.category === slug);
}

export const navLinks = [
  { href: '/shop/latest', label: 'Latest Drip' },
  { href: '/shop/hoodies', label: 'Hoodies' },
  { href: '/shop/jackets', label: 'Jackets' },
  { href: '/shop/overshirts', label: 'Overshirts' },
] as const;

export const companyLinks = [
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact Us' },
] as const;

export const contactEmail = 'zenifyrr@gmail.com';
