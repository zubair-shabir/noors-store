import { formatINR } from '@noors/shared';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Noor&apos;s</h1>
      <p className="max-w-md text-neutral-600">
        Blends culture with everyday function. Designed to move, built to last.
      </p>
      <p className="text-sm text-neutral-500">
        Storefront coming soon · prices shown like {formatINR(249900)}
      </p>
    </main>
  );
}
