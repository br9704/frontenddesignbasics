'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { examples } from '@/lib/examples';

/*
 * "In the wild": a scroll-snapping row of small real-site photos for one section.
 * Native horizontal scroll (touch, trackpad, shift+wheel), plus arrow buttons for mouse users.
 */
export function Examples({ section, title = 'In the wild' }: { section: string; title?: string }) {
  const row = useRef<HTMLUListElement>(null);
  const items = examples[section] ?? [];
  if (!items.length) return null;

  const nudge = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <section className="not-prose my-8" aria-label={`${title}: ${section}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
          {title} · {items.length} examples
        </p>
        <div className="flex gap-1.5">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => nudge(d)}
              aria-label={d < 0 ? 'Previous examples' : 'Next examples'}
              className="grid size-8 place-items-center rounded-full border border-[var(--rule)] text-sm transition-colors hover:bg-[var(--color-fd-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            >
              {d < 0 ? '←' : '→'}
            </button>
          ))}
        </div>
      </div>
      <ul
        ref={row}
        className="-mx-1 flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]"
      >
        {items.map((e) => (
          <li key={e.id} className="w-[82vw] max-w-[420px] shrink-0 snap-start sm:w-[380px] lg:w-[420px]">
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              className="group block rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            >
              <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--color-fd-muted)]">
                <Image
                  src={e.image}
                  alt={`${e.name} website`}
                  fill
                  sizes="(min-width: 1024px) 420px, (min-width: 640px) 380px, 82vw"
                  className="object-cover object-top transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.05]"
                />
              </div>
              <p className="mt-3 flex items-baseline justify-between gap-2 font-display text-lg">
                <span className="truncate">{e.name}</span>
                <span aria-hidden className="text-xs text-[var(--text-soft)] transition-transform group-hover:translate-x-0.5">↗</span>
              </p>
              <p className="mt-1 line-clamp-3 text-sm leading-snug text-[var(--text-soft)]">{e.note}</p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
