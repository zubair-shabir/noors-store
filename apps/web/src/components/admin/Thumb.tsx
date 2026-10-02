/* eslint-disable @next/next/no-img-element -- admin thumbnails come from uploads or Cloudinary at any size */
import { ImageOff } from 'lucide-react';

export function Thumb({
  src,
  alt = '',
  size = 40,
}: {
  src: string | null;
  alt?: string;
  size?: number;
}) {
  return src ? (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="shrink-0 rounded-md bg-surface object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-surface text-subtle"
      style={{ width: size, height: size }}
    >
      <ImageOff className="size-4" aria-hidden />
    </span>
  );
}
