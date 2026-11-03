import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Fixable', template: '%s | Fixable' },
  description: 'A fixture with fixable issues.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
