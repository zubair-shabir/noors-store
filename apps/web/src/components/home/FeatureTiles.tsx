import { Phone, Send, ShieldCheck } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';

const features = [
  { icon: Send, label: 'Free Shipping' },
  { icon: ShieldCheck, label: 'Secure Checkout' },
  { icon: Phone, label: '24/7 Assistance' },
];

export function FeatureTiles() {
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3 sm:px-10 sm:pb-20">
      {features.map(({ icon: Icon, label }, i) => (
        <Reveal
          key={label}
          delay={i * 0.08}
          className="flex flex-col items-center gap-4 bg-surface px-6 py-12"
        >
          <Icon className="h-6 w-6" strokeWidth={1.5} />
          <p className="text-lg sm:text-xl">{label}</p>
        </Reveal>
      ))}
    </section>
  );
}
