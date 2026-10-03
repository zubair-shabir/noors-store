'use client';

import { AnimatePresence, m } from 'motion/react';
import { Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { easeOutExpo } from '@/lib/motion';

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

/** Accordion: the plus turns into a cross and the answer slides open. Several can be open at once. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section
      id="faq"
      className="mx-auto max-w-[70rem] scroll-mt-28 px-4 py-16 sm:px-10 md:px-[12%]"
    >
      <Reveal className="border-t border-line">
        {items.map((item) => (
          <FaqRow key={item.question} item={item} />
        ))}
      </Reveal>
    </section>
  );
}

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-b border-line">
      <h3>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-6 py-8 text-left text-base sm:text-xl"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          {item.question}
          <Plus
            className={`h-5 w-5 shrink-0 transition-transform duration-500 ease-out-expo ${open ? 'rotate-45' : ''}`}
            strokeWidth={1.5}
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="overflow-hidden"
          >
            <div className="pb-6 text-sm text-muted sm:text-base">{item.answer}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
