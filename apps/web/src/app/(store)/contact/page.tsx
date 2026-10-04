import type { Metadata } from 'next';
import { EmailLink, PolicyLink } from '@/components/content/PolicyPage';
import { Reveal } from '@/components/motion/Reveal';
import { ContactForm } from '@/components/shop/ContactForm';
import { getStoreInfo } from '@/lib/store-api';

export const metadata: Metadata = {
  title: 'Contact us',
  description:
    "Questions about an order, sizing or a drop? Send Noor's a message and we will reply within 24 hours.",
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const info = await getStoreInfo();
  return (
    <section className="mx-auto grid max-w-6xl gap-14 px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <Reveal as="h1" className="font-display text-5xl uppercase sm:text-7xl">
          Contact us
        </Reveal>
        <Reveal as="p" delay={0.1} className="mt-6 text-lg text-muted">
          Questions about an order, sizing or a drop? Send us a message and we will reply within 24
          hours.
        </Reveal>
        <dl className="mt-10 space-y-6 text-sm">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Email</dt>
            <dd className="mt-1.5 text-muted">
              <EmailLink email={info.email} />
            </dd>
          </div>
          {info.phone && (
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Phone</dt>
              <dd className="mt-1.5 text-muted">
                <a href={`tel:${info.phone.replace(/[^\d+]/g, '')}`}>{info.phone}</a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Studio</dt>
            <dd className="mt-1.5 whitespace-pre-line text-muted">{info.address}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Quick answers</dt>
            <dd className="mt-1.5 text-muted">
              <PolicyLink href="/track">Track an order</PolicyLink>, read the{' '}
              <PolicyLink href="/faq">FAQ</PolicyLink> or our{' '}
              <PolicyLink href="/returns">returns policy</PolicyLink>.
            </dd>
          </div>
        </dl>
      </div>
      <div className="lg:pt-4">
        <ContactForm />
      </div>
    </section>
  );
}
