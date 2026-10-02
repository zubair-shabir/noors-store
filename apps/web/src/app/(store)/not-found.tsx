import { ButtonLink } from '@/components/ui/ButtonLink';
import { latestLink } from '@/lib/site';

export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="font-display text-6xl uppercase sm:text-8xl">Lost the thread</h1>
      <p className="mt-4 max-w-sm text-sm text-muted">
        This page doesn&apos;t exist or the piece has sold through. The newest drop is a good place
        to start.
      </p>
      <div className="mt-8">
        <ButtonLink href={latestLink.href}>Shop Latest Drip</ButtonLink>
      </div>
    </section>
  );
}
