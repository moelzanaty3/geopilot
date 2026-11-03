import Link from 'next/link';
import type { ReactNode } from 'react';
import { adjacent } from '@/lib/docs-nav';

export function DocsPage({ href, crumb, title, intro, children }: { href: string; crumb: string; title: string; intro: string; children: ReactNode }) {
  const { prev, next } = adjacent(href);
  return (
    <main className="docs-main" id="content" tabIndex={-1}>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/docs/">Docs</Link> / {crumb}
      </nav>
      <h1>{title}</h1>
      <p className="intro">{intro}</p>
      <div className="prose">{children}</div>
      {(prev || next) && (
        <nav className="docs-pager" aria-label="Pagination">
          {prev && (
            <Link href={prev.href}>
              <span className="dir">← Previous</span>
              <span className="name">{prev.title}</span>
            </Link>
          )}
          {next && (
            <Link href={next.href} className="next">
              <span className="dir">Next →</span>
              <span className="name">{next.title}</span>
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
