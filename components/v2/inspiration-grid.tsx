'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Shot {
  id?: string;
  name: string;
  url: string;
  by?: string;
  note: string;
  image: string;
}

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-ink)]';

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * A big image grid on black with a rhythm of large tiles (every 5th spans two columns and rows on
 * desktop). Click opens a lightbox with the full screenshot, the note and the live link.
 */
export function InspirationGrid({ items, label }: { items: Shot[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className="grid grid-flow-row-dense grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s, i) => {
          const big = i % 5 === 0;
          return (
            <li key={s.image + i} className={`min-w-0 ${big ? 'sm:col-span-2 lg:row-span-2' : ''}`}>
              <button type="button" onClick={() => setOpen(i)} className={`group block w-full text-left ${ring}`} aria-label={`${s.name}: open details`}>
                <span className="relative block aspect-[16/10] overflow-hidden border border-[var(--v-steel)] bg-[var(--v-surface)]">
                  <Image
                    src={s.image}
                    alt={`${s.name} screenshot`}
                    fill
                    sizes={big ? '(max-width: 639px) 100vw, (max-width: 1023px) 100vw, 66vw' : '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw'}
                    className="object-cover object-top transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.02]"
                  />
                </span>
                <span className="mt-3 flex items-baseline justify-between gap-3">
                  <span className="pixel truncate text-[16px] leading-[16px] text-[var(--v-ink)]">{s.name}</span>
                  <span className="pixel shrink-0 text-[16px] leading-[16px] text-[var(--v-dim)] group-hover:text-[var(--v-ink)]">[+]</span>
                </span>
                <span className="mt-2 block text-[15px] leading-[1.5] text-[var(--v-soft)]">
                  <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">steal: </span>
                  {s.note}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Lightbox items={items} index={open} setIndex={setOpen} label={label} />
    </>
  );
}

export function Lightbox({
  items,
  index,
  setIndex,
  label,
}: {
  items: Shot[];
  index: number | null;
  setIndex: (i: number | null) => void;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = index === null ? null : items[index];

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (index !== null && !d.open) d.showModal();
    if (index === null && d.open) d.close();
  }, [index]);

  const step = useCallback(
    (dir: number) => {
      if (index === null) return;
      setIndex((index + dir + items.length) % items.length);
    },
    [index, items.length, setIndex],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, step]);

  return (
    <dialog
      ref={ref}
      onClose={() => setIndex(null)}
      onClick={(e) => e.target === e.currentTarget && setIndex(null)}
      className="m-auto max-h-[92svh] w-[min(1200px,calc(100vw-24px))] overflow-y-auto border border-[var(--v-steel)] bg-[var(--v-bg)] p-0 text-[var(--v-ink)] backdrop:bg-black/85"
      aria-label={s ? s.name : label}
    >
      {s ? (
        <div className="p-3 sm:p-5">
          <div className="pixel flex items-center justify-between gap-3 text-[16px] leading-[16px]">
            <span className="truncate text-[var(--v-dim)]">
              ┌─ {label} ─ {index! + 1}/{items.length}
            </span>
            <span className="flex shrink-0 gap-3">
              <button type="button" onClick={() => step(-1)} className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`} aria-label="Previous">
                [←]
              </button>
              <button type="button" onClick={() => step(1)} className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`} aria-label="Next">
                [→]
              </button>
              <button type="button" onClick={() => setIndex(null)} className={`hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`} aria-label="Close">
                [esc]
              </button>
            </span>
          </div>
          <div className="relative mt-4 aspect-[16/10] w-full border border-[var(--v-steel)] bg-[var(--v-surface)]">
            <Image src={s.image} alt={`${s.name} screenshot`} fill sizes="(max-width: 1240px) 100vw, 1200px" className="object-contain" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <h3 className="pixel text-[32px] leading-[32px]">{s.name}</h3>
              {s.by ? <p className="pixel mt-2 text-[16px] leading-[16px] text-[var(--v-dim)]">by {s.by}</p> : null}
              <p className="mt-4 max-w-[68ch] text-[17px] leading-[1.6] text-[var(--v-soft)]">
                <span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">what to steal: </span>
                {s.note}
              </p>
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`pixel inline-block border border-[var(--v-ink)] px-3 py-2 text-[16px] leading-[16px] hover:bg-[var(--v-ink)] hover:text-[var(--v-bg)] ${ring}`}
            >
              [visit {hostOf(s.url)} ↗]
            </a>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
