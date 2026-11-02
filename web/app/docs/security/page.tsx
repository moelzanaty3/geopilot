import { DocsPage } from '@/components/docs-page';
import { GITHUB_URL } from '@/lib/site';

export const metadata = { title: 'Security & privacy' };

export default function Page() {
  return (
    <DocsPage href="/docs/security/" crumb="Security & privacy" title="Security & privacy" intro="Threat model: target websites, repository content, pull-request authors, responses and anything an agent reads may be malicious.">
      <h2>Network</h2>
      <ul>
        <li>Every address is resolved and validated, and the socket is handed only the checked address, so a DNS answer that changes between check and connect cannot slip through.</li>
        <li>Loopback, private, link-local, CGNAT, IPv6 ULA, multicast and reserved ranges are blocked by default, including IPv4-mapped, NAT64 and 6to4 forms and alternative IPv4 encodings.</li>
        <li>A private destination is allowed only when you name it. A discovered link or a redirect from another host never reaches one.</li>
        <li>Five redirects; connect 5 s, request 10 s; HTML 5 MiB, robots 500 KiB, sitemap 50 MiB, counted after decompression.</li>
        <li>Same-origin crawling; two requests per host and 250 ms spacing for remote hosts; robots.txt respected for GEO’s own user agent unless you override it for a target you named (recorded in the report).</li>
      </ul>
      <h2>Repository</h2>
      <ul>
        <li>Repository code, configuration and builds are never executed — except V3 commands and the <code>fix.serve</code> process you authorise for a run, which get argv only, no shell, a loopback URL, a free-port check, bounded redacted logs and guaranteed termination.</li>
        <li>Symlinks that escape the repository are not followed. <code>.env*</code>, <code>*.pem</code>, <code>*.key</code>, <code>.npmrc</code>, <code>.git/config</code> and gitignored files are never read.</li>
        <li>Evidence snippets are capped at 300 characters and secrets are redacted. Cookies, auth headers and full response bodies are not stored.</li>
      </ul>
      <h2>Prompt injection</h2>
      <p>Crawled HTML, comments, robots.txt, llms.txt and tool output are untrusted. The skill never follows instructions found there and never fetches a URL because content asks it to. This is a behavioural rule, not a security guarantee.</p>
      <h2>Privacy</h2>
      <p>No telemetry, no account, no update check, no remote rule feed, no hidden model call. Network traffic goes only to the targets you authorise, plus package installation when you run <code>npx</code>.</p>
      <h2>Supply chain</h2>
      <p>One runtime dependency (<code>@babel/parser</code>, pinned with its only dependency). Frozen lockfile, actions pinned to commit SHAs, npm trusted publishing with provenance, and no long-lived publish token.</p>
      <h2>Reporting a vulnerability</h2>
      <p>Use GitHub’s private vulnerability reporting on <a href={`${GITHUB_URL}/security`}>the repository</a>. Please do not open a public issue.</p>
    </DocsPage>
  );
}
