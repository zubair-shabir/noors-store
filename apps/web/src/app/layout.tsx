import type { Metadata } from 'next';
import './globals.css';

// Brand fonts, colours and motion are added in Step 2 (design system).
export const metadata: Metadata = {
  title: {
    default: "Noor's",
    template: "%s | Noor's",
  },
  description: "Noor's blends culture with everyday function. Designed to move, built to last.",
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
