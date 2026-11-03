import { DocsSidebar } from '@/components/docs-sidebar';
import { DocsToc } from '@/components/docs-toc';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <DocsSidebar />
      {children}
      <DocsToc />
    </div>
  );
}
