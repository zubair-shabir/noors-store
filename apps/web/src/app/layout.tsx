import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource/anton/400.css';
import '@fontsource/cinzel/500.css';
import './globals.css';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  openGraph: { siteName: "Noor's", locale: 'en_IN', type: 'website' },
  title: {
    default: "Noor's | Clothing beyond time",
    template: "%s | Noor's",
  },
  description: "Noor's blends culture with everyday function. Designed to move, built to last.",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Runs before first paint: applies the saved theme and skips the intro if it already played this session.
const prePaint = `try{var d=document.documentElement,t=localStorage.getItem('noors-theme');if(t)d.dataset.theme=t;if(sessionStorage.getItem('noors-intro-seen'))d.dataset.intro='seen'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaint }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
