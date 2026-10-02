'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Drawer } from '@/components/ui/Drawer';
import { companyLinks, navLinks } from '@/lib/catalog';
import { easeOutExpo } from '@/lib/motion';
import { useUi } from '@/lib/ui-store';

export function MenuDrawer() {
  const panel = useUi((s) => s.panel);
  const close = useUi((s) => s.close);

  return (
    <Drawer open={panel === 'menu'} onClose={close} side="left" title="Menu">
      <nav aria-label="Main">
        <ul className="space-y-1">
          {navLinks.map((link, i) => (
            <motion.li
              key={link.href}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.06, duration: 0.6, ease: easeOutExpo }}
            >
              <Link
                href={link.href}
                onClick={close}
                className="block py-1 font-display text-4xl uppercase transition-opacity hover:opacity-50"
              >
                {link.label}
              </Link>
            </motion.li>
          ))}
        </ul>
        <ul className="mt-10 space-y-3 border-t border-line pt-8">
          {companyLinks.map((link, i) => (
            <motion.li
              key={link.href}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.06, duration: 0.5 }}
            >
              <Link
                href={link.href}
                onClick={close}
                className="text-xs font-semibold tracking-[0.14em] text-muted uppercase hover:text-foreground"
              >
                {link.label}
              </Link>
            </motion.li>
          ))}
        </ul>
      </nav>
    </Drawer>
  );
}
