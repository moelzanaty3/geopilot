import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.ledger.example'),
  title: 'Ledger: accounting for small teams',
  description: 'Simple accounting software for small teams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <nav><a href="/">Home</a> <a href="/pricing">Pricing</a> <a href="/docs">Docs</a> <a href="/blog">Blog</a></nav>
        {children}
        <div data-nosnippet>We use cookies to keep you signed in.</div>
      </body>
    </html>
  );
}
