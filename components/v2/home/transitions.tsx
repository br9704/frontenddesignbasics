'use client';

import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { gsap, useMotion } from './motion';
import { type ProgressStore, span, useOnScreen, useReducedMotion } from './runtime';

/* ───────── Bayer tiles as data URIs: 17 threshold levels of a 4x4 matrix ───────── */
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayerTile = (level: number, ink = '#f5f5f5') => {
  const rects = B4.map((b, i) => (b < level ? `<rect x='${i % 4}' y='${Math.floor(i / 4)}' width='1' height='1'/>` : '')).join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges' fill='${ink}'>${rects}</svg>`)}")`;
};

/**
 * Dither wipe: a Bayer threshold sweeps the viewport in 8 pixel-stepped bands, filling to white and
 * draining again. Used between 03 and 04.
 */
export function DitherWipe({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tiles = useMemo(() => Array.from({ length: 17 }, (_, i) => bayerTile(i)), []);
  useMotion(ref, (el) => {
    const bands = [...el.querySelectorAll<HTMLElement>('[data-band]')];
    const st = gsap.to({}, {
      scrollTrigger: {
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        onUpdate: (s) => {
          bands.forEach((b, i) => {
            const t = span(s.progress, i * 0.05, i * 0.05 + 0.6);
            const lvl = Math.round(16 * Math.sin(t * Math.PI));
            b.style.backgroundImage = tiles[lvl];
          });
        },
      },
    });
    return () => st.scrollTrigger?.kill();
  });
  return (
    <div ref={ref} aria-hidden className="relative h-[70vh] overflow-hidden bg-[var(--v-bg)] motion-reduce:h-6">
      <div className="absolute inset-0 grid grid-rows-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} data-band className="[background-size:8px_8px] [image-rendering:pixelated]" />
        ))}
      </div>
      <p className="pixel absolute bottom-3 left-1/2 -translate-x-1/2 bg-[var(--v-bg)] px-2 text-[16px] leading-[16px] text-[var(--v-dim)] motion-reduce:hidden">
        {label}
      </p>
    </div>
  );
}

/** Opens its children through a growing circle as the element's top scrolls from the bottom to the top. */
export function CircleOpen({ children, from = '#f5f5f5', className = '' }: { children: ReactNode; from?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotion(ref, (el) => {
    const inner = el.firstElementChild as HTMLElement;
    const tw = gsap.fromTo(
      inner,
      { clipPath: 'circle(0% at 50% 40vh)' },
      { clipPath: 'circle(150% at 50% 40vh)', ease: 'power2.in', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 48px', scrub: true } },
    );
    return () => tw.scrollTrigger?.kill();
  });
  return (
    <div ref={ref} className={className} style={{ background: from }}>
      <div>{children}</div>
    </div>
  );
}

const PALETTE = ['#ff2e00', '#ff00a8', '#7b2cff', '#00b3ff', '#00e676', '#ffe600'];

/**
 * Reverse pixel blast: coloured 64px blocks drain in Bayer order toward the centre until one c-2
 * pixel is left. Canvas 2D, driven by a slice of a progress store.
 */
export function PixelDrain({ store, a, b }: { store: ProgressStore; a: number; b: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const on = useOnScreen(wrap);
  useEffect(() => {
    const c = cv.current;
    const w = wrap.current;
    if (!c || !w || reduced) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = -1;
    const draw = (t: number) => {
      const W = w.clientWidth;
      const H = w.clientHeight;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      ctx.clearRect(0, 0, W, H);
      if (t <= 0) return;
      const S = 64;
      const cols = Math.ceil(W / S);
      const rows = Math.ceil(H / S);
      const maxD = Math.hypot(W / 2, H / 2);
      // phase 1: blocks appear over the wall (pixelate); phase 2: they drain to the centre
      const appear = span(t, 0, 0.35);
      const drain = span(t, 0.35, 0.9);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const bx = x * S + S / 2;
          const by = y * S + S / 2;
          const d = Math.hypot(bx - W / 2, by - H / 2) / maxD;
          const bay = B4[(y % 4) * 4 + (x % 4)] / 16;
          if (appear < bay) continue;
          const l = span(drain * 1.6 - (1 - d) * 0.6 - bay * 0.2, 0, 0.8);
          if (l >= 1) continue;
          const k = 1 - l;
          const cx = W / 2 + (bx - W / 2) * k;
          const cy = H / 2 + (by - H / 2) * k;
          const s = S * k;
          ctx.fillStyle = PALETTE[(x * 7 + y * 3) % 6];
          ctx.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), Math.ceil(s), Math.ceil(s));
        }
      if (drain > 0.6) {
        ctx.fillStyle = '#ff00a8';
        ctx.fillRect(Math.round(W / 2 - 8), Math.round(H / 2 - 8), 16, 16);
      }
    };
    const loop = () => {
      const t = span(store.get(), a, b);
      if (t !== last) {
        last = t;
        draw(t);
      }
      if (on) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [store, a, b, reduced, on]);
  return (
    <div ref={wrap} aria-hidden className="pointer-events-none absolute inset-0 z-30">
      <canvas ref={cv} className="h-full w-full [image-rendering:pixelated]" />
    </div>
  );
}

/** Derived store: a slice [a, b] of a parent store, remapped to 0..1. Create at module scope. */
export function slice(store: ProgressStore, a: number, b: number): ProgressStore {
  const ls = new Set<() => void>();
  let v = span(store.get(), a, b);
  store.subscribe(() => {
    const n = span(store.get(), a, b);
    if (n !== v) {
      v = n;
      ls.forEach((l) => l());
    }
  });
  return {
    get: () => v,
    set: () => {},
    subscribe: (fn) => {
      ls.add(fn);
      return () => ls.delete(fn);
    },
  };
}
