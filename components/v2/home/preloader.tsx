'use client';

import { useEffect, useRef, useState } from 'react';
import { experiences } from '@/lib/experiences';
import { ready } from './runtime';

/*
 * Home warm-up. The journey is ~20 live WebGL pieces; fetched lazily they pop in late (or not at
 * all on a slow connection). While you read the hero, this fetches every experience's code and its
 * still, and shows a small progress chip. It never blocks the page or the scroll; the Win95 boot
 * intro waits for it (see act-boot). After CAP ms it reports ready with whatever has landed.
 */

// Pieces the home page shows, in the order you meet them. Everything else loads after.
const HOME = [
  'tool-blocks', 'flip-bento', 'ascii-3d', 'pipes-screensaver', 'voxel-type-assembly', 'flying-type',
  'crystal-type-rings', 'circuit-board', 'ease-racetrack', 'blur-lab', 'wave-extrude-type', 'transition-deck', 'glass-lens', 'kinetic-poster', 'event-horizon',
  'velocity-gallery', 'halftone-develop', 'ascii-cursor-field', 'liquid-gradient', 'neon-block-city', 'colour-riot',
];
const CAP = 15000;
const MIN = 900;

type Row = { id: string; state: 'wait' | 'load' | 'ok' | 'err' };

function preloadImage(src: string) {
  return new Promise<void>((res) => {
    const img = new Image();
    img.onload = img.onerror = () => res();
    img.src = src;
  });
}

export function Preloader() {
  const known = new Set(experiences.map((e) => e.id));
  const order = [...HOME.filter((id) => known.has(id)), ...experiences.map((e) => e.id).filter((id) => !HOME.includes(id))];
  const homeCount = HOME.filter((id) => known.has(id)).length;
  const [rows, setRows] = useState<Row[]>(() => order.slice(0, homeCount).map((id) => ({ id, state: 'wait' })));
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [late, setLate] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const t0 = performance.now();
    const set = (id: string, state: Row['state']) =>
      !cancelled && setRows((r) => r.map((x) => (x.id === id ? { ...x, state } : x)));

    const loadOne = async (id: string) => {
      const exp = experiences.find((e) => e.id === id);
      if (!exp) return;
      set(id, 'load');
      try {
        await Promise.all([exp.load(), preloadImage(`/posters/${id}.webp`)]);
        set(id, 'ok');
      } catch {
        set(id, 'err');
      }
    };
    // four at a time, in journey order
    const run = async (ids: string[]) => {
      const queue = [...ids];
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) await loadOne(queue.shift()!);
      }));
    };

    const finish = () => {
      if (cancelled || ready.get() >= 1) return;
      const wait = Math.max(0, MIN - (performance.now() - t0));
      setTimeout(() => {
        if (cancelled) return;
        setDone(true);
        ready.set(1);
        setTimeout(() => !cancelled && setGone(true), 450);
        // the rest of the site's pieces, quietly
        run(order.slice(homeCount)).catch(() => {});
      }, wait);
    };

    const lateTimer = setTimeout(() => !cancelled && setLate(true), 6000);
    const capTimer = setTimeout(finish, CAP);
    Promise.all([document.fonts?.ready ?? Promise.resolve(), run(order.slice(0, homeCount))]).then(finish, finish);
    return () => {
      cancelled = true;
      clearTimeout(lateTimer);
      clearTimeout(capTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // keep the newest line that is loading (or just finished) in view
    const el = listRef.current;
    if (!el) return;
    const last = rows.map((r) => r.state).lastIndexOf('load');
    const idx = last >= 0 ? last : rows.map((r) => r.state).lastIndexOf('ok');
    const line = el.children[Math.max(0, idx)] as HTMLElement | undefined;
    if (line) el.scrollTop = Math.max(0, line.offsetTop - el.offsetTop - el.clientHeight + 32);
  }, [rows]);

  if (gone) return null;
  const n = rows.filter((r) => r.state === 'ok' || r.state === 'err').length;
  const pct = Math.round((n / Math.max(1, rows.length)) * 100);
  const W = 12;
  const bar = '█'.repeat(Math.round((pct / 100) * W)).padEnd(W, '░');
  const current = rows.find((r) => r.state === 'load')?.id;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Warming up live pieces, ${pct} percent`}
      data-preloader
      className={`pixel fixed right-3 bottom-16 z-[60] lg:bottom-3 max-w-[calc(100vw-1.5rem)] border border-[var(--v-steel)] bg-[#080808]/95 px-3 py-2 text-[16px] leading-[16px] text-[var(--v-soft)] transition-opacity duration-400 motion-reduce:transition-none ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <p className="whitespace-pre text-[var(--v-ink)]">{`[${bar}] ${n}/${rows.length}`}</p>
      <p className="mt-1 truncate text-[var(--v-dim)]">
        {current ? `warming up ${current}` : 'warming up live pieces'}
        {late && !done ? ' · slow connection' : ''}
      </p>
      <div ref={listRef} hidden />
    </div>
  );
}
