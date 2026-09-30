'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import toolkit from '@/toolkit/toolkit.json';

type Tool = (typeof toolkit.tools)[number];
type Status = keyof typeof toolkit.statusLegend;

const statusStyle: Record<Status, string> = {
  live: 'border border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]',
  'needs-key': 'border border-dashed border-[var(--v-ink)] text-[var(--v-ink)]',
  dormant: 'border border-[var(--v-steel)] bg-[var(--v-steel)] text-[var(--v-soft)]',
  'on-demand': 'border border-[var(--v-soft)] text-[var(--v-soft)]',
  library: 'border border-[var(--v-steel)] text-[var(--v-dim)]',
  tool: 'border border-[var(--v-steel)] text-[var(--v-dim)]',
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${statusStyle[status]}`}
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
          placeholder={`Search ${toolkit.tools.length} tools… try “scroll” or “3d”`}
          aria-label="Search tools"
          className="min-w-0 flex-1 basis-56 border border-[var(--v-steel)] bg-[var(--v-surface)] px-3 py-2 text-sm outline-none placeholder:text-[var(--v-dim)] focus-visible:border-[var(--v-ink)]"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {['all', ...Object.keys(cats)].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`border px-3 py-1 text-xs transition-colors ${
                cat === c
                  ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
                  : 'border-[var(--v-steel)] text-[var(--v-soft)] hover:text-[var(--v-ink)]'
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
              {'image' in t && t.image ? (
                <a href={t.url} target="_blank" rel="noreferrer" className="relative mb-1 block aspect-[16/10] w-full overflow-hidden border border-[var(--v-steel)]">
                  <Image src={t.image as string} alt={`${t.name} website`} fill sizes="(min-width: 640px) 12rem, 100vw" className="object-cover object-top" />
                </a>
              ) : null}
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
              <code className="block overflow-x-auto whitespace-nowrap border border-[var(--v-line)] bg-[var(--v-surface)] px-2 py-1 font-mono text-xs">
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
