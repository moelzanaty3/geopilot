'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Heading = { id: string; text: string };

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Pages are plain JSX without heading ids, so the anchors are assigned here, in
// one place, rather than by hand on every h2.
export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const elements = [...document.querySelectorAll<HTMLHeadingElement>('.prose h2')];
    for (const element of elements) {
      if (!element.id) element.id = slug(element.textContent ?? '');
    }
    setHeadings(elements.map((element) => ({ id: element.id, text: element.textContent ?? '' })));
    setActive(elements[0]?.id ?? '');
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (target) document.getElementById(target)?.scrollIntoView();

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-90px 0px -70% 0px' },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length < 2) return null;
  return (
    <nav className="docs-toc" aria-label="On this page">
      <div className="toc-label">On this page</div>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className={heading.id === active ? 'active' : undefined}>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
