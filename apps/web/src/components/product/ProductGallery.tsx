'use client';

import type { ImageDto } from '@noors/shared';
import { AnimatePresence, m } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';
import { easeOutExpo } from '@/lib/motion';

/**
 * Large photo with thumbnails on desktop; a swipeable strip on phones. Photos fade into
 * each other when a thumbnail or a different colour is picked.
 */
export function ProductGallery({ images, name }: { images: ImageDto[]; name: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  // A colour change swaps the image list; fall back to its first photo.
  const active = images.find((i) => i.url === picked) ?? images[0];

  if (!active) return <div className="aspect-[4/5] bg-surface" />;

  return (
    <div className="lg:grid lg:grid-cols-[72px_1fr] lg:gap-4">
      {/* Phones: horizontal snap strip */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 lg:hidden">
        {images.map((image, i) => (
          <div
            key={image.url}
            className="relative aspect-[4/5] w-[85%] shrink-0 snap-center overflow-hidden bg-surface"
          >
            <Image
              src={image.url}
              alt={image.alt ?? (i === 0 ? name : '')}
              fill
              priority={i === 0}
              sizes="85vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {/* Desktop: thumbnails + main photo */}
      <div className="hidden flex-col gap-3 lg:flex">
        {images.map((image) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setPicked(image.url)}
            aria-label="Show this photo"
            aria-pressed={image.url === active.url}
            className={`relative aspect-[4/5] overflow-hidden bg-surface transition-opacity ${
              image.url === active.url
                ? 'opacity-100 ring-1 ring-foreground'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            <Image src={image.url} alt="" fill sizes="72px" className="object-cover" />
          </button>
        ))}
      </div>
      <div
        className="relative hidden aspect-[4/5] overflow-hidden bg-surface lg:block"
        data-cursor-label="View"
      >
        <AnimatePresence initial={false}>
          <m.div
            key={active.url}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: easeOutExpo }}
          >
            <Image
              src={active.url}
              alt={active.alt ?? name}
              fill
              priority
              sizes="(min-width: 1280px) 640px, 50vw"
              className="object-cover"
            />
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
