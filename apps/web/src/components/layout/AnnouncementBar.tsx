import { Marquee } from '@/components/motion/Marquee';

interface AnnouncementBarProps {
  message: string;
}

/** Black scrolling strip above the header. Text comes from the admin banner settings in Step 4. */
export function AnnouncementBar({ message }: AnnouncementBarProps) {
  return (
    <div className="bg-black text-white">
      <Marquee duration={28} className="py-2">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="px-12 text-[11px] font-semibold tracking-[0.06em] uppercase">
            {message}
          </span>
        ))}
      </Marquee>
    </div>
  );
}
