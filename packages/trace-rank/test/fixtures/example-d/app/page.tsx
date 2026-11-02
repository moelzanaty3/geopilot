import type { Metadata } from 'next';

export const metadata: Metadata = {
  description: 'Example home page.',
  alternates: { canonical: 'https://www.example.com/' },
};

export default function Home() {
  return <main><h1>Example</h1><a href="/about">About</a></main>;
}
