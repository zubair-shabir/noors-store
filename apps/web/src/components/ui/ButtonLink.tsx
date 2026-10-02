import Link from 'next/link';
import type { ComponentProps } from 'react';

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: 'outline' | 'solid' };

/** Small uppercase button. Outline variant fills black from the left on hover ("View all"). */
export function ButtonLink({
  variant = 'outline',
  className = '',
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      {...props}
      className={`group relative inline-flex items-center justify-center overflow-hidden border border-foreground px-5 py-2.5 text-[11px] font-semibold tracking-[0.16em] uppercase ${
        variant === 'solid' ? 'bg-foreground text-background' : 'text-foreground'
      } ${className}`}
    >
      {variant === 'outline' && (
        <span
          aria-hidden="true"
          className="absolute inset-0 origin-left scale-x-0 bg-foreground transition-transform duration-500 ease-out-expo group-hover:scale-x-100"
        />
      )}
      <span
        className={`relative transition-colors duration-500 ${
          variant === 'outline' ? 'group-hover:text-background' : ''
        }`}
      >
        {children}
      </span>
    </Link>
  );
}
