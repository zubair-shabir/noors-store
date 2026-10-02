import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/Reveal';
import { contactEmail } from '@/lib/site';

export const metadata: Metadata = { title: 'Contact us' };

// The contact form (emailed through Resend) is built in Step 7.
export default function ContactPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
      <Reveal as="h1" className="font-display text-5xl uppercase sm:text-7xl">
        Contact us
      </Reveal>
      <Reveal as="p" delay={0.1} className="mt-6 text-lg text-muted">
        Questions about an order, sizing or a drop? Write to{' '}
        <a href={`mailto:${contactEmail}`} className="text-foreground underline underline-offset-4">
          {contactEmail}
        </a>{' '}
        and we will reply within 24 hours.
      </Reveal>
    </section>
  );
}
