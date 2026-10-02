import Link from 'next/link';
import { Marquee } from '@/components/motion/Marquee';

interface AnnouncementBarProps {
  /** Active announcement banners from the dashboard, in order. */
  messages: { text: string; href: string | null }[];
}

/** Black scrolling strip above the header. Hidden when the dashboard has no announcement. */
export function AnnouncementBar({ messages }: AnnouncementBarProps) {
  if (messages.length === 0) return null;
  // Repeat the messages so the strip is always wider than the screen.
  const items = Array.from(
    { length: Math.max(2, Math.ceil(6 / messages.length)) },
    () => messages,
  ).flat();
  return (
    <div className="bg-black text-white">
      <Marquee duration={28} className="py-2">
        {items.map((m, i) =>
          m.href ? (
            <Link
              key={i}
              href={m.href}
              className="px-12 text-[11px] font-semibold tracking-[0.06em] uppercase hover:opacity-70"
            >
              {m.text}
            </Link>
          ) : (
            <span key={i} className="px-12 text-[11px] font-semibold tracking-[0.06em] uppercase">
              {m.text}
            </span>
          ),
        )}
      </Marquee>
    </div>
  );
}
