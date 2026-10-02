import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UploadDto } from '@noors/shared';
import { HttpError } from '../../lib/errors.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type ImageType = 'jpg' | 'png' | 'webp' | 'avif' | 'gif';

/** Identifies an image from its first bytes; the browser-sent MIME type is not trusted. */
export function sniffImageType(buf: Buffer): ImageType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp' && /^avi[fs]$/.test(buf.toString('ascii', 8, 12)))
    return 'avif';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}

export interface ImageStore {
  save(file: Buffer, type: ImageType): Promise<UploadDto>;
}

/** Development fallback: files go to a local folder the API serves at /uploads. */
export class LocalImageStore implements ImageStore {
  constructor(private readonly dir: string) {}

  async save(file: Buffer, type: ImageType): Promise<UploadDto> {
    await mkdir(this.dir, { recursive: true });
    const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${type}`;
    await writeFile(path.join(this.dir, name), file);
    return { url: `/uploads/${name}`, width: null, height: null };
  }
}

/**
 * Uploads to Cloudinary with a signed request. CLOUDINARY_URL looks like
 * cloudinary://<api_key>:<api_secret>@<cloud_name>.
 */
export class CloudinaryImageStore implements ImageStore {
  private readonly cloud: string;
  private readonly key: string;
  private readonly secret: string;

  constructor(
    cloudinaryUrl: string,
    private readonly folder = 'noors/products',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const u = new URL(cloudinaryUrl);
    if (u.protocol !== 'cloudinary:' || !u.username || !u.password || !u.hostname) {
      throw new Error('CLOUDINARY_URL must look like cloudinary://key:secret@cloud_name');
    }
    this.key = decodeURIComponent(u.username);
    this.secret = decodeURIComponent(u.password);
    this.cloud = u.hostname;
  }

  /** Cloudinary signature: SHA-1 of the sorted params joined with & followed by the secret. */
  sign(params: Record<string, string>): string {
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return createHash('sha1')
      .update(toSign + this.secret)
      .digest('hex');
  }

  async save(file: Buffer, type: ImageType): Promise<UploadDto> {
    const params = { folder: this.folder, timestamp: String(Math.floor(Date.now() / 1000)) };
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file)], { type: `image/${type === 'jpg' ? 'jpeg' : type}` }),
    );
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append('api_key', this.key);
    form.append('signature', this.sign(params));

    const res = await this.fetchImpl(`https://api.cloudinary.com/v1_1/${this.cloud}/image/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      throw new HttpError(502, `Image host rejected the upload (${res.status})`, 'upload_failed');
    }
    const body = (await res.json()) as { secure_url: string; width?: number; height?: number };
    return { url: body.secure_url, width: body.width ?? null, height: body.height ?? null };
  }
}
