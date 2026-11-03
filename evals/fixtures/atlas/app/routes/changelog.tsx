import { useEffect, useState } from 'react';
export const meta = () => [{ title: 'Changelog | Atlas' }, { name: 'description', content: 'What changed in Atlas, release by release.' }, { tagName: 'link', rel: 'canonical', href: 'https://atlasroadmaps.example/changelog' }];
export default function Changelog() {
  const [entries, setEntries] = useState<string[]>([]);
  useEffect(() => { fetch('/api/changelog').then((r) => r.json()).then(setEntries); }, []);
  return <main><h1>Changelog</h1><ul>{entries.map((e) => <li key={e}>{e}</li>)}</ul></main>;
}
