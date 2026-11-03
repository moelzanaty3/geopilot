import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  alternates: { canonical: 'https://www.example.com/pricing' },
};

export default function Pricing() {
  return <main>Pricing</main>;
}
