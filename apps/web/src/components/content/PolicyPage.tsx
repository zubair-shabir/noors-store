import Link from 'next/link';
import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { policyLinks } from '@/lib/site';

/** Date the policy pages were last reviewed. Change it whenever their wording changes. */
export const POLICIES_UPDATED = { iso: '2026-10-03', label: '3 October 2026' };

const linkClass = 'text-foreground underline underline-offset-[3px] decoration-1';

/** Body copy for policy pages: readable measure, lists with markers, underlined links. */
const proseClass = [
  'text-[15px] leading-[1.75] text-foreground/85',
  '[&_p]:mt-4 [&_p:first-child]:mt-0',
  '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-muted',
  '[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_a]:text-foreground [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[3px]',
].join(' ');

interface PolicyPageProps {
  eyebrow?: string;
  title: string;
  intro: ReactNode;
  /** Key facts shown in a band under the title, e.g. the shipping fee. */
  facts?: { label: string; value: ReactNode }[];
  children: ReactNode;
  /** Hide the "Last updated" line (the FAQ is not a policy). */
  dated?: boolean;
}

/** Shared layout for Terms, Privacy, Shipping, Returns and the FAQ. */
export function PolicyPage({
  eyebrow = 'Policies',
  title,
  intro,
  facts,
  children,
  dated = true,
}: PolicyPageProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
      <header>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
          {eyebrow}
        </p>
        <Reveal
          as="h1"
          className="mt-3 font-display text-[clamp(2.75rem,9vw,5.5rem)] leading-[0.95] uppercase"
        >
          {title}
        </Reveal>
        {dated && (
          <p className="mt-5 text-xs tracking-[0.06em] text-muted uppercase">
            Last updated <time dateTime={POLICIES_UPDATED.iso}>{POLICIES_UPDATED.label}</time>
          </p>
        )}
        <Reveal as="div" delay={0.1} className="mt-8 text-lg leading-relaxed text-muted">
          {intro}
        </Reveal>
      </header>

      {facts && facts.length > 0 && (
        <dl className="mt-12 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="bg-background p-4">
              <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
                {f.label}
              </dt>
              <dd className="mt-2 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4">{children}</div>

      <nav aria-label="Store policies" className="mt-20 border-t border-line pt-8">
        <p className="text-[11px] font-semibold tracking-[0.14em] uppercase">More policies</p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {[...policyLinks, { href: '/faq', label: 'FAQ' }].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-[11px] tracking-[0.14em] uppercase underline-offset-[5px] hover:underline"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

/** One section of a policy: display heading plus prose. */
export function PolicySection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-line py-10 last:border-b-0">
      <h2 className="font-display text-2xl tracking-[0.01em] uppercase sm:text-3xl">{title}</h2>
      <div className={`mt-5 ${proseClass}`}>{children}</div>
    </section>
  );
}

/** Internal link styled for policy copy (Next's Link, so it prefetches). */
export function PolicyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

/** mailto link for the store's address. */
export function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className={linkClass}>
      {email}
    </a>
  );
}
