export function LogoMark({ size = 22 }: { size?: number }) {
  // A route traced to its source: three points joined by one line.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <path d="M6 16.5 L10.5 11 L14 13.5 L18 7.5" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="16.5" r="1.6" fill="var(--on-accent)" />
      <circle cx="18" cy="7.5" r="1.6" fill="var(--on-accent)" />
    </svg>
  );
}
