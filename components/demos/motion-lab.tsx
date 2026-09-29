'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Preview } from '../demos';

/* Shared bits */
function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

const btn =
  'rounded-full bg-[var(--text)] px-4 py-1.5 text-sm text-[var(--surface)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-mono transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
    on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--surface)]' : 'border-[var(--rule)] text-[var(--text-soft)]'
  }`;

function Slider(p: { label: string; min: number; max: number; step?: number; value: number; unit?: string; onChange: (n: number) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-soft)]">
      <span className="shrink-0">{p.label}</span>
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[var(--accent)] sm:w-28 sm:flex-none"
      />
      <span className="w-12 shrink-0 font-mono tabular-nums">{p.value}{p.unit}</span>
    </label>
  );
}

function Track({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-xs sm:grid-cols-[7rem_1fr]">
      <span className="font-mono text-[var(--text-soft)]">{label}</span>
      <div className="relative h-7 rounded-full bg-[var(--color-fd-muted)]">{children}</div>
    </div>
  );
}

/* 1. Spring vs bezier */
function simulateSpring(k: number, c: number) {
  const dt = 1 / 240, out: number[] = [];
  let x = 0, v = 0, rest = 0;
  for (let i = 0; i < 240 * 4; i++) {
    const a = -k * (x - 1) - c * v; // mass = 1, target = 1
    v += a * dt;
    x += v * dt;
    if (i % 4 === 0) out.push(x); // keep 60 samples per second
    rest = Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.01 ? rest + 1 : 0;
    if (rest > 24) break;
  }
  return out;
}

export function SpringVsBezier() {
  const [k, setK] = useState(170);
  const [c, setC] = useState(12);
  const [run, setRun] = useState(0);
  const reduce = useReducedMotion();
  const springBall = useRef<HTMLDivElement>(null);
  const samples = useMemo(() => simulateSpring(k, c), [k, c]);
  const ms = Math.round((samples.length / 60) * 1000);
  const overshoot = Math.max(0, (Math.max(...samples) - 1) * 100);
  const place = (x: number) => springBall.current?.style.setProperty('left', `calc(0.25rem + ${x} * (100% - 1.75rem))`);

  useEffect(() => {
    if (!run) return;
    if (reduce) return void place(1);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const i = Math.floor(((now - t0) / 1000) * 60);
      place(samples[Math.min(i, samples.length - 1)]);
      if (i < samples.length - 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const path = samples.map((x, i) => `${i ? 'L' : 'M'}${(i / (samples.length - 1)) * 200},${60 - x * 40}`).join(' ');
  return (
    <Preview caption="A spring has no duration: stiffness and damping decide how long it takes and whether it overshoots. The bezier gets the same time, so only the feel differs. Low damping wobbles; high damping feels heavy.">
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" className={btn} onClick={() => setRun((r) => r + 1)}>▶ Replay</button>
        <Slider label="Stiffness" min={40} max={400} step={10} value={k} onChange={setK} />
        <Slider label="Damping" min={4} max={40} value={c} onChange={setC} />
      </div>
      <div className="space-y-3">
        <Track label="spring">
          <div ref={springBall} className="absolute top-1 left-1 size-5 rounded-full bg-[var(--accent)]" />
        </Track>
        <Track label="ease-out">
          <div
            key={run}
            className="absolute top-1 left-1 size-5 rounded-full bg-[var(--text)]"
            style={{ animation: run ? `fdb-ml-slide ${reduce ? 1 : ms}ms cubic-bezier(0.22, 1, 0.36, 1) forwards` : undefined }}
          />
        </Track>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <svg viewBox="0 0 200 64" className="h-16 w-full max-w-[16rem]" role="img" aria-label={`Spring position over time, overshoot ${overshoot.toFixed(0)} percent`}>
          <line x1="0" x2="200" y1="20" y2="20" stroke="var(--rule)" strokeDasharray="3 3" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        </svg>
        <dl className="grid grid-cols-2 gap-x-4 font-mono text-xs text-[var(--text-soft)]">
          <dt>settles in</dt><dd className="tabular-nums text-[var(--text)]">{ms}ms</dd>
          <dt>overshoot</dt><dd className="tabular-nums text-[var(--text)]">{overshoot.toFixed(1)}%</dd>
        </dl>
      </div>
      <style>{`@keyframes fdb-ml-slide { to { left: calc(100% - 1.5rem); } }`}</style>
    </Preview>
  );
}

/* 2. Stagger playground */
const COLS = 6, ROWS = 4, N = COLS * ROWS;
const orders = ['start', 'center', 'edges', 'random'] as const;
type Order = (typeof orders)[number];

function rankFor(order: Order): number[] {
  const idx = Array.from({ length: N }, (_, i) => i);
  if (order === 'start') return idx;
  if (order === 'random') {
    let s = 7; // seeded, so every replay uses the same shuffle
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const shuffled = [...idx];
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    return idx.map((i) => shuffled.indexOf(i));
  }
  const dist = idx.map((i) => Math.hypot((i % COLS) - (COLS - 1) / 2, Math.floor(i / COLS) - (ROWS - 1) / 2));
  const sorted = [...idx].sort((a, b) => (order === 'center' ? dist[a] - dist[b] : dist[b] - dist[a]));
  return idx.map((i) => sorted.indexOf(i));
}

export function StaggerPlayground() {
  const [delay, setDelay] = useState(40);
  const [order, setOrder] = useState<Order>('start');
  const [run, setRun] = useState(0);
  const rank = useMemo(() => rankFor(order), [order]);
  const total = delay * (N - 1) + 400;
  return (
    <Preview caption="Stagger turns 24 things appearing into one gesture with a direction. Past about 60ms per item the whole group takes too long to arrive; center-out draws the eye to the middle.">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" className={btn} onClick={() => setRun((r) => r + 1)}>▶ Replay</button>
        <Slider label="Stagger" min={0} max={120} step={5} value={delay} unit="ms" onChange={(n) => { setDelay(n); setRun((r) => r + 1); }} />
      </div>
      <div role="group" aria-label="Stagger order" className="mb-5 flex flex-wrap gap-2">
        {orders.map((o) => (
          <button key={o} type="button" aria-pressed={order === o} className={chip(order === o)} onClick={() => { setOrder(o); setRun((r) => r + 1); }}>
            {o}
          </button>
        ))}
      </div>
      <div key={run} className="grid grid-cols-6 gap-1.5 sm:gap-2">
        {rank.map((r, i) => (
          <div
            key={i}
            className="fdb-ml-tile flex aspect-square items-center justify-center rounded-md bg-[var(--accent)] font-mono text-[10px] text-[var(--surface)]"
            style={{ animationDelay: `${r * delay}ms` } as CSSProperties}
          >
            {r + 1}
          </div>
        ))}
      </div>
      <p className={`mt-4 font-mono text-xs ${total > 1200 ? 'text-[var(--accent)]' : 'text-[var(--text-soft)]'}`} aria-live="polite">
        last tile lands at {total}ms{total > 1200 ? ': too slow, people wait for it' : ''}
      </p>
      <style>{`@media (prefers-reduced-motion: no-preference) {
        .fdb-ml-tile { animation: fdb-ml-pop 400ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      }
      @keyframes fdb-ml-pop { from { opacity: 0; transform: translateY(12px) scale(0.85); } }`}</style>
    </Preview>
  );
}

/* 3. Scroll progress, driven by the panel's own scroll */
const sections = ['Arrive', 'Orient', 'Explain', 'Show', 'Prove', 'Act'];

export function ScrollProgressDemo() {
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [once, setOnce] = useState(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      bar.current?.style.setProperty('transform', `scaleX(${p})`);
      setPct(Math.round(p * 100));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    el.addEventListener('scroll', onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => setSeen((prev) => {
        const next = new Set(prev);
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.i);
          if (e.isIntersecting) next.add(i); else if (!once) next.delete(i);
        }
        return next;
      }),
      { root: el, threshold: 0.4 },
    );
    el.querySelectorAll('[data-i]').forEach((n) => io.observe(n));
    return () => { el.removeEventListener('scroll', onScroll); io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [once]);

  return (
    <Preview caption="Scroll inside the panel, not the page. The bar is a pure function of scroll position, so it is exact in both directions; the reveals are an IntersectionObserver rooted on the panel. Toggle 'once' to see why re-hiding on scroll-up feels fidgety.">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-[var(--text-soft)]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} className="accent-[var(--accent)]" />
          Reveal once
        </label>
        <span className="font-mono tabular-nums" aria-live="off">{pct}% read</span>
      </div>
      <div className="overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--surface)]">
        <div className="h-1 bg-[var(--color-fd-muted)]" role="progressbar" aria-label="Panel scroll progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div ref={bar} className="h-full origin-left bg-[var(--accent)]" style={{ transform: 'scaleX(0)' }} />
        </div>
        <div ref={scroller} tabIndex={0} aria-label="Scrollable demo panel" className="h-64 space-y-6 overflow-y-auto overscroll-contain p-5 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <p className="text-sm text-[var(--text-soft)]">Scroll down ↓</p>
          {sections.map((s, i) => (
            <div
              key={s}
              data-i={i}
              className={`rounded-md border border-[var(--rule)] bg-[var(--surface-raised)] p-4 motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
                seen.has(i) ? 'opacity-100 translate-y-0' : 'opacity-0 motion-safe:translate-y-4'
              }`}
            >
              <p className="font-mono text-xs text-[var(--accent)]">0{i + 1}</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--text)]">{s}</p>
              <div className="mt-3 h-2 w-3/4 rounded bg-[var(--color-fd-muted)]" />
              <div className="mt-2 h-2 w-1/2 rounded bg-[var(--color-fd-muted)]" />
            </div>
          ))}
          <div className="h-16" />
        </div>
      </div>
    </Preview>
  );
}
