import type { ReactNode } from 'react';

/**
 * Collapsed reference detail (token tables, copyable code) on the rules pages. The rules stay
 * visible; the long lookup material opens on demand. Plain <details>, so it works without JS.
 */
export function Reference({ title = 'Reference', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group my-6 rounded-lg border border-fd-border bg-fd-card/40 [&_table]:my-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-mono text-sm text-fd-muted-foreground hover:text-fd-foreground">
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="border-t border-fd-border px-4 pb-2 pt-1">{children}</div>
    </details>
  );
}
