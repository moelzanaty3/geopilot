'use client';

import { useEffect, useState } from 'react';

export default function Page() {
  const [posts, setPosts] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    fetch('/api/posts').then((r) => r.json()).then(setPosts);
  }, []);
  return <main><h1>Blog</h1>{posts.map((p) => <article key={p.id}>{p.title}</article>)}</main>;
}
