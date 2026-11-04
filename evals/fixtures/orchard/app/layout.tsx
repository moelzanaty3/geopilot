export const metadata = { metadataBase: new URL('https://www.orchard.example') };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav><a href="/">Home</a> <a href="/varieties">Varieties</a> <a href="/visit">Visit</a></nav>
        {children}
        <div data-nosnippet>Cookies keep your basket working.</div>
      </body>
    </html>
  );
}
