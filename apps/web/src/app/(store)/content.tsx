import Link from 'next/link';
import type { FaqItem } from '@/components/home/Faq';

// Copy from the reference site.

export const brandStory =
  "Born from Kashmir and shaped by purpose, every detail reflects confidence that feels natural. Noor's focuses on comfort, ease, and control in daily movement. Wear it your way, without forcing a statement just owning it. Rooted in culture and refined through intention, each piece is crafted for confidence that lasts. Every drop blends comfort, freedom, and control into something effortless. It's made to fit your life, your pace, and your way of wearing it.";

export const storesLines = [
  'Our stores are more',
  'than retail spaces.',
  "They're built to let you",
  'feel the drip.',
];

const link = (href: string, label: string) => (
  <Link href={href} className="text-foreground underline underline-offset-2">
    {label}
  </Link>
);

export const faqs: FaqItem[] = [
  {
    question: 'How long does delivery take?',
    answer: (
      <>
        About 3 days within Jammu and Kashmir and about 5 working days elsewhere in India. Checkout
        shows an estimate for your pincode. See our {link('/shipping', 'shipping policy')}.
      </>
    ),
  },
  {
    question: 'Can I return or exchange an item?',
    answer: (
      <>
        Yes. Ask from your order page within the return window, with the item unworn and its tags
        on, and swap it for another size or get a refund. See our{' '}
        {link('/returns', 'returns policy')}.
      </>
    ),
  },
  {
    question: 'What if I receive a damaged or incorrect item?',
    answer: (
      <>
        Write to us within 48 hours of delivery with your order number and a photo, and we will
        replace it or refund you in full. {link('/contact', 'Contact us')} or read our{' '}
        {link('/faq', 'FAQ')}.
      </>
    ),
  },
];
