'use client';

import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { easeInOutQuart } from '@/lib/motion';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Slide-in panel with a dimmed backdrop. Closes on Escape or backdrop click and keeps focus inside. */
export function Drawer({ open, onClose, side, title, children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  const offset = side === 'left' ? '-100%' : '100%';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`absolute top-0 flex h-full w-full max-w-md flex-col bg-background text-foreground shadow-2xl outline-none ${
              side === 'left' ? 'left-0' : 'right-0'
            }`}
            initial={{ x: offset }}
            animate={{ x: 0 }}
            exit={{ x: offset }}
            transition={{ duration: 0.7, ease: easeInOutQuart }}
            data-lenis-prevent
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-5">
              <h2 className="text-sm font-semibold tracking-[0.14em] uppercase">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="-m-2 p-2 transition-transform duration-300 hover:rotate-90"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
            {footer && <div className="border-t border-line px-6 py-5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
