'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_NAV, RULE_LINKS } from '@/lib/docs-nav';

export function DocsSidebar() {
  const raw = usePathname() ?? '/';
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const path = (raw.startsWith(base) ? raw.slice(base.length) : raw).replace(/\/?$/, '/');
  const inRules = path.startsWith('/docs/rules/');
  const links = (
        <>
          {DOCS_NAV.map((g) => (
            <div className="group" key={g.label}>
              <div className="group-label">{g.label}</div>
              <ul>
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={path === l.href ? 'active' : undefined} aria-current={path === l.href ? 'page' : undefined}>
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {inRules && (
            <div className="group">
              <div className="group-label">Rule catalogue</div>
              <ul>
                {RULE_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={path === l.href ? 'active' : undefined}>
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
  );
  // Two copies, one per layout: a disclosure on phones (collapsed so the
  // article is not pushed a screen down) and a plain column on desktop.
  return (
    <aside className="docs-sidebar">
      <nav aria-label="Documentation" className="sidebar-desktop">
        {links}
      </nav>
      <details className="sidebar-mobile">
        <summary>Documentation menu</summary>
        <nav aria-label="Documentation (mobile)">{links}</nav>
      </details>
    </aside>
  );
}
