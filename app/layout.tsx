import type { Metadata } from 'next';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/roboto';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chat Rehearsal — WhatsApp-style chat maker',
  description: 'Build fictional conversations from a reference screenshot or a script.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
