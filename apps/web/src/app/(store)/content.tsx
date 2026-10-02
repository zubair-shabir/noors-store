import type { FaqItem } from '@/components/home/Faq';
import { contactEmail } from '@/lib/site';

// Copy from the reference site.

export const brandStory =
  "Born from Kashmir and shaped by purpose, every detail reflects confidence that feels natural. Noor's focuses on comfort, ease, and control in daily movement. Wear it your way, without forcing a statement just owning it. Rooted in culture and refined through intention, each piece is crafted for confidence that lasts. Every drop blends comfort, freedom, and control into something effortless. It's made to fit your life, your pace, and your way of wearing it.";

export const storesLines = [
  'Our stores are more',
  'than retail spaces.',
  "They're built to let you",
  'feel the drip.',
];

const writeToUs = (
  <>
    Write to{' '}
    <a href={`mailto:${contactEmail}`} className="text-foreground underline underline-offset-2">
      {contactEmail}
    </a>{' '}
    and we will sort it out within 24 hours.
  </>
);

export const faqs: FaqItem[] = [
  { question: 'How long does delivery take?', answer: writeToUs },
  { question: 'Can I return or exchange an item?', answer: writeToUs },
  { question: 'What if I receive a damaged or incorrect item?', answer: writeToUs },
];
