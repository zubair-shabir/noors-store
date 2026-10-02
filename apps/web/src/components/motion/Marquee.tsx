import type { CSSProperties, ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode;
  /** Seconds for one full loop. */
  duration?: number;
  className?: string;
}

/** Endless right-to-left scroll. The content is rendered twice and shifted by half its width. */
export function Marquee({ children, duration = 30, className = '' }: MarqueeProps) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className="flex w-max animate-marquee"
        style={{ '--marquee-duration': `${duration}s` } as CSSProperties}
      >
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
