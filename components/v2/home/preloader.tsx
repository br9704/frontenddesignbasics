'use client';

import { useEffect, useRef, useState } from 'react';
import { experiences } from '@/lib/experiences';
import { ready } from './runtime';

/*
 * Home preloader. The journey is ~20 live WebGL pieces; fetched lazily they pop in late (or not at
 * all on a slow connection). So before the Win95 boot plays, this BIOS screen fetches every
 * experience's code, the fonts and the first posters, listing each one as it lands.
 * It never blocks forever: after CAP ms it lets you in with whatever has loaded, and the rest keeps
 * loading behind the page.
 */

// Pieces the home page shows, in the order you meet them. Everything else loads after.
const HOME = [
  'tool-blocks', 'flip-bento', 'ascii-3d', 'pipes-screensaver', 'voxel-type-assembly', 'flying-type',
  'crystal-type-rings', 'circuit-board', 'easing-lab', 'wave-extrude-type', 'page-transitions', 'glass-lens', 'kinetic-poster', 'event-horizon',
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
    const html = document.documentElement;
    html.style.overflow = 'hidden';
    window.scrollTo(0, 0);
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
        html.style.overflow = '';
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
      html.style.overflow = '';
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
  const W = 28;
  const bar = '█'.repeat(Math.round((pct / 100) * W)).padEnd(W, '░');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading the journey, ${pct} percent`}
      className={`pixel fixed inset-0 z-[100] flex items-center justify-center bg-black px-4 text-[16px] leading-[16px] text-[#cfcfcf] transition-opacity duration-400 motion-reduce:transition-none ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div className="w-full max-w-[640px]">
        <p className="text-white">FDB/95 BIOS v2.0 · front end design basics</p>
        <p className="mt-2 text-[#8a8a8a]">Loading {rows.length} live pieces so nothing pops in late.</p>
        <div ref={listRef} className="mt-6 h-[176px] overflow-hidden">
          {rows.map((r) => (
            <p key={r.id} className={r.state === 'wait' ? 'text-[#4a4a4a]' : ''}>
              {`${r.id}.exe `.padEnd(30, '.')}{' '}
              {r.state === 'ok' ? <span className="text-white">OK</span> : r.state === 'err' ? 'SKIP' : r.state === 'load' ? <span className="animate-pulse motion-reduce:animate-none">…</span> : ''}
            </p>
          ))}
        </div>
        <p className="mt-6 whitespace-pre text-white">{`[${bar}] ${String(pct).padStart(3, ' ')}%`}</p>
        <p className="mt-2 text-[#8a8a8a]">
          {n}/{rows.length} loaded{late && !done ? ' · slow connection, hang on' : ''}
        </p>
        {late && !done ? (
          <button
            type="button"
            onClick={() => {
              setDone(true);
              document.documentElement.style.overflow = '';
              ready.set(1);
              setTimeout(() => setGone(true), 450);
            }}
            className="mt-4 border border-[#8a8a8a] px-3 py-1 text-white hover:bg-white hover:text-black focus-visible:bg-white focus-visible:text-black"
          >
            [enter now →]
          </button>
        ) : null}
      </div>
    </div>
  );
}
