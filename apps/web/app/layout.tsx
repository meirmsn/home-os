// What: Root layout for @home-os/web. Loads Inter (preloaded, Latin subset,
//       three weights — 400/500/600), registers PWA + Apple meta, sets the
//       designed-state dark ground.
// Why:  No FOUT on dashboard load (design-review § Typography). Manifest +
//       Apple meta enable Add-to-Home-Screen on iOS Safari and proper PWA
//       theme color.
// Does NOT: Wire Sentry, PostHog, or any provider — those land in later
//           commits as <Providers> wrappers around `children`.

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Home OS',
  description: 'Intelligent home maintenance companion.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Home OS',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1C1B18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

/** Root document — dark ground, Inter font variable on <html>. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
