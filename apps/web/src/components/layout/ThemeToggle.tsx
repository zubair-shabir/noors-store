'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const THEME_KEY = 'noors-theme';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const getTheme = () => document.documentElement.dataset.theme ?? 'light';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light');
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={className}
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Theme still switches for this page view.
        }
      }}
    >
      {theme === 'dark' ? (
        <Sun className="h-[22px] w-[22px]" strokeWidth={2.25} />
      ) : (
        <Moon className="h-[22px] w-[22px]" strokeWidth={2.25} />
      )}
    </button>
  );
}
