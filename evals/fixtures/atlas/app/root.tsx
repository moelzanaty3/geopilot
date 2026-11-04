import { Links, Meta, Outlet, Scripts } from '@remix-run/react';
export const meta = () => [{ title: 'Atlas' }, { name: 'description', content: 'Roadmaps your whole team can follow.' }];
export default function App() {
  return (
    <html lang="en">
      <head><Meta /><Links /></head>
      <body><nav><a href="/pricing">Pricing</a> <a href="/changelog">Changelog</a></nav><Outlet /><Scripts /></body>
    </html>
  );
}
