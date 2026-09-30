'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { AsciiFrame } from './ascii-frame';
import { BuiltWith } from './experience-frame';
import { LivePreview } from './make-live';
import { catalog, GITHUB_BLOB, KINDS, STAGES, type CatalogEntry } from './make-data';

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

export function Chip({
  on,
  children,
  onClick,
  disabled,
  title,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`pixel shrink-0 border px-2 py-1 text-[16px] leading-[16px] ${ring} ${
        on
          ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
          : 'border-[var(--v-steel)] text-[var(--v-soft)] hover:border-[var(--v-ink)] hover:text-[var(--v-ink)] disabled:opacity-40 disabled:hover:border-[var(--v-steel)] disabled:hover:text-[var(--v-soft)]'
      }`}
    >
      {children}
    </button>
  );
}

function matches(e: CatalogEntry, kind: string | null, stage: string | null, tools: string[]) {
  return (!kind || e.kind === kind) && (!stage || e.stage === stage) && tools.every((t) => e.tools.includes(t));
}

export function MakeGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = params.get('kind');
  const stage = params.get('stage');
  const tools = useMemo(() => (params.get('tool') ?? '').split(',').filter(Boolean), [params]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggleTool = (t: string) => {
    const next = tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t];
    setParam('tool', next.length ? next.join(',') : null);
  };

  const allTools = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of catalog) for (const t of e.tools) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, []);

  const shown = catalog.filter((e) => matches(e, kind, stage, tools));
  const total = catalog.length;
  const any = kind || stage || tools.length;

  return (
    <>
      <div className="border-y border-[var(--v-line)] py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="pixel text-[16px] leading-[16px]" aria-live="polite">
            [{shown.length}/{total}]
            <span className="text-[var(--v-dim)]"> experiences</span>
          </p>
          {any ? (
            <button type="button" onClick={() => router.replace(pathname, { scroll: false })} className={`pixel text-[16px] leading-[16px] text-[var(--v-soft)] underline underline-offset-4 hover:text-[var(--v-ink)] ${ring}`}>
              [clear]
            </button>
          ) : null}
        </div>
        <FilterRow label="kind">
          {KINDS.map((k) => {
            const n = catalog.filter((e) => matches(e, k, stage, tools)).length;
            return (
              <Chip key={k} on={kind === k} disabled={!n && kind !== k} onClick={() => setParam('kind', kind === k ? null : k)}>
                {k} <span className="opacity-60">{n}</span>
              </Chip>
            );
          })}
        </FilterRow>
        <FilterRow label="stage">
          {STAGES.map((s) => {
            const n = catalog.filter((e) => matches(e, kind, s, tools)).length;
            return (
              <Chip key={s} on={stage === s} disabled={!n && stage !== s} onClick={() => setParam('stage', stage === s ? null : s)}>
                {s} <span className="opacity-60">{n}</span>
              </Chip>
            );
          })}
        </FilterRow>
        <FilterRow label="tools">
          {allTools.map((t) => {
            const on = tools.includes(t);
            const n = catalog.filter((e) => matches(e, kind, stage, on ? tools : [...tools, t])).length;
            return (
              <Chip key={t} on={on} disabled={!n && !on} onClick={() => toggleTool(t)} title={on ? `remove ${t}` : `add ${t} (all selected tools must match)`}>
                {on ? '+ ' : ''}
                {t} <span className="opacity-60">{n}</span>
              </Chip>
            );
          })}
        </FilterRow>
      </div>

      {shown.length ? (
        <ul className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <li key={e.id} className="min-w-0">
              <MakeCard e={e} />
            </li>
          ))}
        </ul>
      ) : (
        <pre className="pixel mt-16 text-center text-[16px] leading-[16px] text-[var(--v-dim)]">
          {`┌──────────────────────────────┐\n│  0 results.                  │\n│  try: kind 3d, or just gsap  │\n└──────────────────────────────┘`}
        </pre>
      )}
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-3">
      <span className="pixel w-[56px] shrink-0 pt-1 text-[16px] leading-[16px] text-[var(--v-dim)]">{label}</span>
      <div className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">{children}</div>
    </div>
  );
}

function MakeCard({ e }: { e: CatalogEntry }) {
  const [hot, setHot] = useState(false);
  return (
    <div
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setHot(false);
      }}
    >
      <AsciiFrame title={e.kind} right={e.stage} className="!px-3 !pb-3 sm:!px-3">
        <LivePreview id={e.id} hot={hot} className="aspect-[16/10] w-full" />
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h2 className="pixel text-[32px] leading-[32px]">
            <Link href={`/lab/${e.id}`} className={`hover:underline ${ring}`}>
              {e.title}
            </Link>
          </h2>
          {e.makeOnly ? <span className="pixel shrink-0 text-[16px] leading-[16px] text-[var(--v-dim)]">[make only]</span> : null}
        </div>
        <p className="mt-3 text-[16px] leading-[1.55] text-[var(--v-soft)]">{e.blurb}</p>
        <BuiltWith tools={e.tools} className="mt-4" />
        <div className="pixel mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[16px] leading-[16px]">
          <Link href={`/lab/${e.id}`} className={`text-[var(--v-ink)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
            [open ↗]
          </Link>
          {e.source ? (
            <a href={GITHUB_BLOB + e.source} target="_blank" rel="noopener noreferrer" className={`text-[var(--v-soft)] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}>
              [source]
            </a>
          ) : (
            <span className="text-[var(--v-dim)]">[source soon]</span>
          )}
        </div>
      </AsciiFrame>
    </div>
  );
}
