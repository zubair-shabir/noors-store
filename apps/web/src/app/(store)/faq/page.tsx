import type { Metadata } from 'next';
import { EmailLink, PolicyLink } from '@/components/content/PolicyPage';
import { Faq, type FaqItem } from '@/components/home/Faq';
import { Reveal } from '@/components/motion/Reveal';
import {
  codSentence,
  deliveryEstimates,
  returnWindowSentence,
  shippingFeeSentence,
} from '@/lib/policies';
import { getStoreInfo } from '@/lib/store-api';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    "Answers about Noor's delivery times, shipping charges, cash on delivery, returns, exchanges, sizing, payment and tracking.",
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const info = await getStoreInfo();
  const write = (
    <>
      write to <EmailLink email={info.email} />
    </>
  );
  const items: FaqItem[] = [
    {
      question: 'How long does delivery take?',
      answer: (
        <>
          Orders leave our studio in Srinagar within 1 to 2 working days. Delivery then takes{' '}
          {deliveryEstimates.local} within Jammu and Kashmir and {deliveryEstimates.elsewhere}{' '}
          elsewhere in India. Checkout shows an estimated date for your pincode. More in our{' '}
          <PolicyLink href="/shipping">shipping policy</PolicyLink>.
        </>
      ),
    },
    {
      question: 'How much is shipping?',
      answer: <>{shippingFeeSentence(info)} We ship within India only.</>,
    },
    {
      question: 'Do you offer cash on delivery?',
      answer: codSentence(info),
    },
    {
      question: 'Can I return or exchange an item?',
      answer: (
        <>
          {returnWindowSentence(info)} Items must be unworn with their tags on. Ask from your order
          page in your <PolicyLink href="/account">account</PolicyLink> or on the{' '}
          <PolicyLink href="/track">tracking page</PolicyLink>. Exchanges are for another size of
          the same item. See our <PolicyLink href="/returns">returns policy</PolicyLink>.
        </>
      ),
    },
    {
      question: 'When will I get my refund?',
      answer: (
        <>
          Once your return reaches us and passes our check, we refund online payments to the
          original payment method through Razorpay; it usually shows up within 5 to 7 working days.
          Cash on delivery orders are refunded by bank transfer or UPI.
        </>
      ),
    },
    {
      question: 'How do I find my size?',
      answer: (
        <>
          Most product pages have a size chart with chest, length, shoulder and sleeve measurements
          in centimetres. Compare them with a piece you already own that fits well. Between sizes?
          Size up for a relaxed fit, or {write} and we will help. If it still does not fit, you can
          exchange it for another size.
        </>
      ),
    },
    {
      question: 'Which payment methods do you accept?',
      answer: (
        <>
          UPI, debit and credit cards, net banking and popular wallets, all through Razorpay
          {info.cod.enabled ? ', plus cash on delivery' : ''}. Prices include GST.
        </>
      ),
    },
    {
      question: 'How do I track my order?',
      answer: (
        <>
          We email you the courier and tracking number when your order ships. You can also follow it
          on our <PolicyLink href="/track">tracking page</PolicyLink> with your order number and
          phone number, or from your <PolicyLink href="/account">account</PolicyLink>.
        </>
      ),
    },
    {
      question: 'What if I receive a damaged or wrong item?',
      answer: (
        <>
          We are sorry. Please {write} within 48 hours of delivery with your order number and a
          photo, and we will send a replacement or refund you in full, including shipping.
        </>
      ),
    },
    {
      question: 'Can I cancel or change my order?',
      answer: (
        <>
          Yes, until it is dispatched. Please {write} or use the{' '}
          <PolicyLink href="/contact">contact form</PolicyLink> with your order number as soon as
          you can. Online payments are refunded in full.
        </>
      ),
    },
    {
      question: 'How do I contact you?',
      answer: (
        <>
          Use our <PolicyLink href="/contact">contact form</PolicyLink> or {write}
          {info.phone ? `, or call ${info.phone}` : ''}. We reply within 24 hours.
        </>
      ),
    },
  ];

  return (
    <>
      <header className="mx-auto max-w-[70rem] px-4 pt-16 sm:px-10 sm:pt-24 md:px-[12%]">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Help</p>
        <Reveal
          as="h1"
          className="mt-3 font-display text-[clamp(2.75rem,9vw,5.5rem)] leading-[0.95] uppercase"
        >
          Questions, answered
        </Reveal>
        <Reveal as="p" delay={0.1} className="mt-6 max-w-xl text-lg text-muted">
          Delivery, returns, sizing and payment. Can&apos;t find what you need?{' '}
          <PolicyLink href="/contact">Get in touch</PolicyLink>.
        </Reveal>
      </header>
      <Faq items={items} />
    </>
  );
}
