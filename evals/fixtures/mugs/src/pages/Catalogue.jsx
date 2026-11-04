import { useEffect, useState } from 'react';

export default function Catalogue() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    fetch('/api/mugs').then((r) => r.json()).then(setItems);
  }, []);
  return (
    <main>
      <h1>Catalogue</h1>
      {items.map((m) => <p key={m.id}>{m.name}</p>)}
    </main>
  );
}
