'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard unavailable (insecure context); the text stays selectable
    }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy: ${text}`}>
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function Command({ text }: { text: string }) {
  return (
    <span className="cmd">
      <span className="prompt" aria-hidden="true">$</span>
      <code>{text}</code>
      <CopyButton text={text} />
    </span>
  );
}
