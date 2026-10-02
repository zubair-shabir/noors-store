import { ChinarLeaf } from './ChinarLeaf';

interface LogoProps {
  className?: string;
}

/** NOOR'S wordmark: Cinzel capitals with the chinar leaf standing in for the apostrophe. */
export function Logo({ className = '' }: LogoProps) {
  return (
    <span
      className={`relative inline-flex items-end font-brand leading-none tracking-[0.18em] ${className}`}
      aria-label="Noor's"
      role="img"
    >
      <span aria-hidden="true">NOOR</span>
      <span aria-hidden="true" className="relative">
        <ChinarLeaf className="absolute -top-[0.62em] left-[-0.32em] h-[0.62em] w-[0.62em]" />S
      </span>
    </span>
  );
}
