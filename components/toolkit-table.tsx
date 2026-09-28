'use client';

import { useMemo, useState } from 'react';
import toolkit from '@/toolkit/toolkit.json';

type Tool = (typeof toolkit.tools)[number];
type Status = keyof typeof toolkit.statusLegend;

const statusStyle: Record<Status, string> = {
  live: 'bg-[#1f7a4d] text-white',
  'needs-key': 'bg-[var(--color-riso-blue)] text-white',
  dormant: 'bg-[#8a8374] text-white',
  'on-demand': 'bg-[#b8860b] text-white',
  library: 'border border-[var(--rule)] text-[var(--text-soft)]',
  tool: 'border border-[var(--rule)] text-[var(--text-soft)]',
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${statusStyle[status]}`}
      title={toolkit.statusLegend[status]}
    >
      {status}
    </span>
  );
}

export function ToolkitTable() {
  const cats = toolkit.categories as Record<string, string>;
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return toolkit.tools.filter(
      (t: Tool) =>
        (cat === 'all' || t.category === cat) &&
        (!needle || `${t.name} ${t.what} ${t.when}`.toLowerCase().includes(needle)),
    );
  }, [cat, q]);

  return (
    <div className="not-prose my-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 36 tools… try “scroll” or “3d”"
          aria-label="Search tools"
          className="min-w-0 flex-1 basis-56 rounded-md border border-[var(--rule)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {['all', ...Object.keys(cats)].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                cat === c
                  ? 'bg-[var(--text)] text-[var(--surface)]'
                  : 'border border-[var(--rule)] text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              {c === 'all' ? 'All' : cats[c]}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
        {rows.map((t: Tool) => (
          <li key={t.id} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[12rem_1fr]">
            <div className="flex flex-col items-start gap-1.5">
              <a href={t.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline">
                {t.name}
              </a>
              <StatusPill status={t.mcp.status as Status} />
              <span className="font-mono text-[11px] text-[var(--text-soft)]">{cats[t.category]}</span>
            </div>
            <div className="min-w-0 space-y-1.5 text-sm">
              <p>{t.what}</p>
              <p className="text-[var(--text-soft)]">
                <span className="font-medium text-[var(--text)]">Use when: </span>
                {t.when}
              </p>
              <code className="block overflow-x-auto whitespace-nowrap rounded bg-[var(--color-fd-muted)] px-2 py-1 font-mono text-xs">
                {t.install}
              </code>
              <p className="text-xs text-[var(--text-soft)]">
                {t.mcp.via} · {t.cost}
              </p>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-sm text-[var(--text-soft)]">Nothing matches that.</li>}
      </ul>
    </div>
  );
}
