import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { contactEmail, type NavLink } from '@/lib/site';

const columnsFor = (navLinks: NavLink[]) => [
  { title: 'Clothing', links: navLinks },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About Us' },
      { href: '/contact', label: 'Contact Us' },
      { href: '/track', label: 'Track Order' },
      { href: '/account', label: 'Account' },
      { href: '/terms', label: 'Terms' },
      { href: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { href: `mailto:${contactEmail}`, label: 'Email' },
      { href: 'https://instagram.com/', label: 'Instagram' },
      { href: 'https://x.com/', label: 'X' },
    ],
  },
];

export function Footer({ navLinks }: { navLinks: NavLink[] }) {
  const columns = columnsFor(navLinks);
  return (
    <footer className="bg-black text-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-20 pb-10 md:grid-cols-[1.2fr_2fr] md:px-10">
        <div>
          <Logo className="text-2xl" />
          <p className="mt-4 max-w-[17rem] text-xs leading-relaxed text-white/80">
            Noor&apos;s blends culture with everyday function. Designed to move, built to last.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 md:justify-items-end">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold tracking-[0.06em] uppercase">{col.title}</h3>
              <ul className="mt-4 space-y-2.5 pl-0 sm:pl-4">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="relative text-[11px] tracking-[0.06em] uppercase after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-white after:transition-transform after:duration-500 hover:after:scale-x-100"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="pb-8 text-center text-[10px] tracking-[0.06em] text-white/80 uppercase">
        © {new Date().getFullYear()} Noor&apos;s Private Limited, all rights reserved.
      </p>
    </footer>
  );
}
