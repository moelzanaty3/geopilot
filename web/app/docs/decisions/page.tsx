import { DocsPage } from '@/components/docs-page';
import { adrs } from '@/lib/data';

export const metadata = { title: 'Decisions' };

function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((block, i) => {
        if (/^- /m.test(block)) return <ul key={i}>{block.split('\n').filter((l) => l.startsWith('- ')).map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
        if (block.startsWith('## ')) return <h3 key={i}>{block.slice(3)}</h3>;
        return <p key={i}>{block}</p>;
      })}
    </>
  );
}

export default function Page() {
  return (
    <DocsPage href="/docs/decisions/" crumb="Decisions" title="Decisions" intro="Architecture decision records for choices this implementation made, including the Phase 0 decisions the specification left open.">
      {adrs().map((a) => (
        <section key={a.slug}>
          <h2 id={a.slug}>{a.title}</h2>
          <Markdownish text={a.body} />
        </section>
      ))}
    </DocsPage>
  );
}
