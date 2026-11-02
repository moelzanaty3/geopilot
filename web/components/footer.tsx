import Link from 'next/link';
import { LogoMark } from './logo';
import { AUTHOR, AUTHOR_URL, DISCLAIMER, GITHUB_URL, ISSUES_URL, LICENSE_NAME, NPM_URL } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <div>
            <Link className="logo" href="/" style={{ color: 'var(--text)', marginBottom: 12 }}>
              <LogoMark size={20} />
              trace-rank
            </Link>
            <p style={{ maxWidth: 340, marginTop: 12 }}>Local-first technical readiness for websites. No accounts, no hosted service, no telemetry, no model calls.</p>
          </div>
          <div>
            <h4>Docs</h4>
            <ul>
              <li><Link href="/docs/getting-started/">Getting started</Link></li>
              <li><Link href="/docs/rules/">Rules</Link></li>
              <li><Link href="/docs/cli/">CLI</Link></li>
              <li><Link href="/docs/scoring/">Scoring</Link></li>
            </ul>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li><Link href="/docs/security/">Security</Link></li>
              <li><Link href="/docs/releases/">Releases</Link></li>
              <li><Link href="/docs/decisions/">Decisions</Link></li>
              <li><a href={ISSUES_URL}>Issues</a></li>
            </ul>
          </div>
          <div>
            <h4>Elsewhere</h4>
            <ul>
              <li><a href={GITHUB_URL}>GitHub</a></li>
              <li><a href={NPM_URL}>npm</a></li>
              <li><a href={AUTHOR_URL}>{AUTHOR}</a></li>
            </ul>
          </div>
        </div>
        <p className="fine">{DISCLAIMER} · {LICENSE_NAME}</p>
      </div>
    </footer>
  );
}
