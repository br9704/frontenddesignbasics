import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import { appName, appTagline } from '@/lib/shared';
import './global.css';

const display = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});

const sans = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: { default: `${appName}: ${appTagline}`, template: `%s · ${appName}` },
  description:
    'Principles, motion, 3D, shaders, components, a showcase of standout sites and an installable toolkit. The guide to complete, beautiful web design.',
  openGraph: { images: '/banners/og.jpg' },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
