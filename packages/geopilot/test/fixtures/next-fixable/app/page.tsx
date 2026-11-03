import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.example.com/' },
};

export default function Home() {
  return (
    <main>
      <h1>Fixable</h1>
      <a href="/about">About</a> <a href="/pricing">Pricing</a>
    </main>
  );
}
