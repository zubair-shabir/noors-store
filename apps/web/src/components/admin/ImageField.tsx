'use client';

import { Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadImage } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { Thumb } from './Thumb';
import { Button } from './ui';

/** A single image: upload a file or clear it. Used for categories, collections and banners. */
export function ImageField({
  value,
  onChange,
  label = 'Image',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await uploadImage(file)).url);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <Thumb src={value} size={64} />
        <Button size="sm" busy={busy} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" /> {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            <X className="size-3.5" /> Remove
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
