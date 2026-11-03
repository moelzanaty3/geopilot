import { DocsSidebar } from '@/components/docs-sidebar';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <DocsSidebar />
      {children}
    </div>
  );
}
