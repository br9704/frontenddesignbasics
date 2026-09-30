'use client';

/*
 * Easing Lab: how motion feels, in black and white.
 *  01 six eases   the same move under six eases, side by side, each with its curve (gsap.parseEase sampled
 *                 at 100 points into an SVG path) and ghost trails (the same tween, delayed).
 *  02 the curve   the chosen ease large, with a playhead dot and a duration slider.
 *  03 spring mesh Canvas2D, typed arrays, Hooke springs [a, b, rest], return force + damping; link grey set
 *                 by strain. Drag to send a shockwave. A tween and a spring race along the bottom.
 *  04 proximity   tool tiles swell near the cursor (Math.hypot → gsap.utils.mapRange → gsap.to with the
 *                 chosen ease and overwrite: true) over a field of dashes that turn to the cursor like iron
 *                 filings (gsap.quickTo on rotation). When nobody is pointing, a ghost cursor drifts.
 */

import gsap from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { Corner } from './g3-kit';

const TOOLS = ['gsap', 'svg', 'canvas2d', 'css'];
const EASES = ['none', 'power2.inOut', 'expo.out', 'back.out(1.7)', 'elastic.out(1,0.35)', 'bounce.out'];
const SHORT = ['linear', 'power2', 'expo', 'back', 'elastic', 'bounce'];
/** elastic.out(1,0.35) peaks at 1.32 and back.out(1.7) at 1.10: tracks end at 1/OVER so the overshoot stays inside. */
const OVER = 1.35;

/* Proximity tiles: real toolkit tools (toolkit/toolkit.json) with their short names and a drawn mono glyph each. */
const TILES: { id: string; name: string; glyph: ReactNode }[] = [
  { id: 'gsap', name: 'GSAP', glyph: <path d="M2 18C10 18 9 2 18 2" /> },
  { id: 'lenis', name: 'Lenis', glyph: <><rect x="6" y="2" width="8" height="16" rx="4" /><path d="M10 5v4" /></> },
  { id: 'motion', name: 'Motion', glyph: <><path d="M7 10h11M14 6l4 4-4 4" /><path d="M2 7h3M2 13h3" /></> },
  { id: 'threejs', name: 'three.js', glyph: <><path d="M2 18L10 2l8 16z" /><path d="M6 10h8M10 18l-4-8M10 18l4-8" /></> },
  { id: 'ogl', name: 'OGL', glyph: <><path d="M10 2l7 4v8l-7 4-7-4V6z" /><path d="M3 6l7 4 7-4M10 10v8" /></> },
  { id: 'spline', name: 'Spline', glyph: <><path d="M3 16C3 6 17 14 17 4" /><rect x="1.5" y="14.5" width="3" height="3" /><rect x="15.5" y="2.5" width="3" height="3" /></> },
  { id: 'jitter', name: 'Jitter', glyph: <path d="M2 12l3-6 3 9 3-11 3 9 2-4 2 3" /> },
  { id: 'paper', name: 'Paper', glyph: <><path d="M4 2h8l5 5v11H4z" /><path d="M12 2v5h5" /></> },
  { id: 'shadcn', name: 'shadcn', glyph: <path d="M4 17L11 3M9 17l7-14" /> },
  { id: 'refero', name: 'Refero', glyph: <><rect x="2.5" y="2.5" width="6" height="6" /><rect x="11.5" y="2.5" width="6" height="6" /><rect x="2.5" y="11.5" width="6" height="6" /><rect x="11.5" y="11.5" width="6" height="6" /></> },
  { id: 'threlte', name: 'Threlte', glyph: <><circle cx="10" cy="10" r="7.5" /><ellipse cx="10" cy="10" rx="7.5" ry="3" /></> },
  { id: 'context7', name: 'Context7', glyph: <path d="M7 2C4 2 5 9 2 10c3 1 2 8 5 8M13 2c3 0 2 7 5 8-3 1-2 8-5 8" /> },
];
const TILE_W = 76;
const TILE_H = 56;
const TILE_GAP = 10;

// back/elastic overshoot: map -0.1..1.4 into the box
const vy = (v: number, h: number, pad: number) => pad + (1 - (v + 0.1) / 1.5) * (h - pad * 2);
function curvePath(ease: string, w: number, h: number, pad = 0) {
  const fn = gsap.parseEase(ease);
  let d = '';
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const x = pad + t * (w - pad * 2);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)},${vy(fn(t), h, pad).toFixed(2)}`;
  }
  return d;
}
function curvePoint(ease: string, t: number, w: number, h: number, pad = 0) {
  const v = gsap.parseEase(ease)(t);
  return { x: pad + t * (w - pad * 2), y: vy(v, h, pad) };
}

function Panel({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`relative flex min-h-0 min-w-0 flex-col border border-[var(--v-steel)] bg-[var(--v-bg)] ${className}`}>
      <header className="pixel flex items-center justify-between gap-2 border-b border-[var(--v-line)] px-2 py-1 text-[16px] leading-[16px]">
        <span className="truncate text-[var(--v-ink)]">{title}</span>
        {right}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <label className="pixel flex min-w-0 items-center gap-2 text-[16px] leading-[16px] text-[var(--v-dim)]">
      <span className="shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 min-w-0 flex-1 accent-[var(--v-ink)]"
      />
      <span className="w-[5ch] shrink-0 text-right text-[var(--v-soft)]">{fmt ? fmt(value) : value}</span>
    </label>
  );
}

/* ───────────── 01 six eases ───────────── */

function Race({
  ease,
  setEase,
  active,
  reduced,
  progress,
  onTime,
  small = false,
}: {
  small?: boolean;
  ease: number;
  setEase: (i: number) => void;
  active: boolean;
  reduced: boolean;
  progress?: number;
  onTime: (p: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const clock = useRef({ p: 0 });
  const tw = small ? 36 : 44;
  const th = small ? 20 : 28;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const lanes = [...el.querySelectorAll<HTMLElement>('[data-lane]')];
    const dots = [...el.querySelectorAll<SVGCircleElement>('[data-dot]')];
    const t = gsap.timeline({ paused: true, repeat: -1, yoyo: true, repeatDelay: 0.5 });
    lanes.forEach((lane, i) => {
      const squares = [...lane.querySelectorAll<HTMLElement>('[data-sq]')];
      squares.forEach((sq, k) => {
        t.fromTo(sq, { '--p': 0 }, { '--p': 1, duration: 1.6, ease: EASES[i] }, k * 0.07);
      });
    });
    t.fromTo(
      clock.current,
      { p: 0 },
      {
        p: 1,
        duration: 1.6,
        ease: 'none',
        onUpdate: () => {
          const p = clock.current.p;
          onTime(p);
          dots.forEach((d, i) => {
            const pt = curvePoint(EASES[i], p, tw, th, 3);
            d.setAttribute('cx', String(pt.x));
            d.setAttribute('cy', String(pt.y));
          });
        },
      },
      0,
    );
    tl.current = t;
    if (reduced) t.progress(0.62);
    return () => {
      t.kill();
    };
  }, [reduced, onTime, tw, th]);

  useEffect(() => {
    const t = tl.current;
    if (!t || reduced) return;
    if (progress !== undefined) {
      t.pause();
      t.progress(Math.min(1, Math.max(0, progress)));
      return;
    }
    if (active) t.play();
    else t.pause();
  }, [active, reduced, progress]);

  return (
    <div ref={root} className={`flex h-full flex-col justify-around px-2 ${small ? 'py-1' : 'gap-1 py-2'}`}>
      {EASES.map((e, i) => (
        <button
          key={e}
          type="button"
          onClick={() => setEase(i)}
          className={`group flex min-h-0 items-center gap-2 text-left ${i === ease ? 'text-[var(--v-ink)]' : 'text-[var(--v-dim)] hover:text-[var(--v-soft)]'}`}
          aria-pressed={i === ease}
        >
          <span className="pixel w-[7ch] shrink-0 text-[16px] leading-[16px]">{SHORT[i]}</span>
          <svg width={tw} height={th} viewBox={`0 0 ${tw} ${th}`} className="shrink-0 overflow-visible" aria-hidden>
            <rect x="0.5" y="0.5" width={tw - 1} height={th - 1} fill="none" stroke="var(--v-line)" />
            <path d={curvePath(e, tw, th, 3)} fill="none" stroke={i === ease ? 'var(--v-ink)' : 'var(--v-dim)'} strokeWidth="1.25" />
            <circle data-dot r="2.2" cx="3" cy={th - 3} fill="var(--v-ink)" />
          </svg>
          <div data-lane className="relative h-[14px] min-w-0 flex-1 border-b border-dashed border-[var(--v-steel)]">
            {/* target mark: where the move ends. back and elastic overshoot past it, but the lane leaves room so they stay inside */}
            <span
              aria-hidden
              className="absolute top-[-3px] bottom-[-1px] block w-px bg-[var(--v-dim)]"
              style={{ left: `calc((100% - 12px) / ${OVER} + 12px)` }}
            />
            {[4, 3, 2, 1, 0].map((k) => (
              <span
                key={k}
                data-sq
                className="absolute top-0 block h-[12px] w-[12px]"
                style={{
                  left: `calc(var(--p, 0) * (100% - 12px) / ${OVER})`,
                  background: k === 0 ? (i === ease ? 'var(--v-ink)' : 'var(--v-soft)') : 'transparent',
                  border: k === 0 ? 'none' : `1px solid rgba(245,245,245,${0.5 - k * 0.1})`,
                }}
              />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

/* ───────────── 02 the curve ───────────── */

function Curve({ ease, time }: { ease: number; time: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState({ w: 300, h: 200 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // inner box: px-3 / py-2, and 22px on the right for the output square that rides the playhead
  const w = Math.max(80, sz.w - 24 - 22);
  const h = Math.max(40, sz.h - 16);
  const pad = 6;
  const d = useMemo(() => curvePath(EASES[ease], w, h, pad), [ease, w, h]);
  const pt = curvePoint(EASES[ease], time, w, h, pad);
  const y0 = vy(0, h, pad);
  const y1 = vy(1, h, pad);
  return (
    <div ref={box} className="absolute inset-0 px-3 py-2">
      <svg width={w} height={h} className="block overflow-visible" aria-label={`Curve of ${EASES[ease]}`}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad + g * (w - pad * 2)} x2={pad + g * (w - pad * 2)} y1={pad} y2={h - pad} stroke="var(--v-line)" />
        ))}
        <line x1={pad} x2={w - pad} y1={y0} y2={y0} stroke="var(--v-steel)" />
        <line x1={pad} x2={w - pad} y1={y1} y2={y1} stroke="var(--v-steel)" strokeDasharray="3 4" />
        <path d={d} fill="none" stroke="var(--v-ink)" strokeWidth="2" />
        <line x1={pt.x} x2={pt.x} y1={y0} y2={pt.y} stroke="var(--v-dim)" strokeDasharray="2 3" />
        <line x1={pt.x} x2={w + 8} y1={pt.y} y2={pt.y} stroke="var(--v-dim)" strokeDasharray="2 3" />
        <circle cx={pt.x} cy={pt.y} r="4.5" fill="var(--v-bg)" stroke="var(--v-ink)" strokeWidth="2" />
        <rect x={w + 8} y={pt.y - 6} width="12" height="12" fill="var(--v-ink)" />
      </svg>
    </div>
  );
}

/* ───────────── 03 spring mesh ───────────── */

function SpringMesh({ ease, active, reduced }: { ease: number; active: boolean; reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const [stiff, setStiff] = useState(0.003);
  const [damp, setDamp] = useState(0.978);
  const params = useRef({ stiff, damp, ease });
  params.current = { stiff, damp, ease };
  const sim = useRef<null | {
    n: number;
    pos: Float32Array;
    vel: Float32Array;
    rest: Float32Array;
    sa: Int32Array;
    sb: Int32Array;
    sl: Float32Array;
    w: number;
    h: number;
    dpr: number;
  }>(null);
  const race = useRef({ tween: 0, spring: 0, sv: 0, target: 1, t0: 0 });
  const drawRef = useRef<() => void>(() => {});
  const shockRef = useRef<(x: number, y: number, s: number) => void>(() => {});

  useLayoutEffect(() => {
    const el = wrap.current;
    const c = cvs.current;
    if (!el || !c) return;
    const ctx = c.getContext('2d')!;
    const build = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(window.devicePixelRatio, 1.75);
      c.width = Math.max(1, w * dpr);
      c.height = Math.max(1, h * dpr);
      const meshH = h - 34;
      const gap = Math.max(14, Math.min(22, w / 22));
      const cols = Math.max(4, Math.floor((w - 16) / gap));
      const rows = Math.max(3, Math.floor((meshH - 16) / gap));
      const ox = (w - (cols - 1) * gap) / 2;
      const oy = (meshH - (rows - 1) * gap) / 2;
      const n = cols * rows;
      const pos = new Float32Array(n * 2);
      const rest = new Float32Array(n * 2);
      const vel = new Float32Array(n * 2);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          rest[i * 2] = pos[i * 2] = ox + x * gap;
          rest[i * 2 + 1] = pos[i * 2 + 1] = oy + y * gap;
        }
      const a: number[] = [];
      const b: number[] = [];
      const l: number[] = [];
      const link = (i: number, j: number) => {
        a.push(i);
        b.push(j);
        l.push(Math.hypot(rest[j * 2] - rest[i * 2], rest[j * 2 + 1] - rest[i * 2 + 1]));
      };
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (x < cols - 1) link(i, i + 1);
          if (y < rows - 1) link(i, i + cols);
        }
      sim.current = { n, pos, vel, rest, sa: new Int32Array(a), sb: new Int32Array(b), sl: new Float32Array(l), w, h, dpr };
    };
    const shock = (x: number, y: number, s: number) => {
      const S = sim.current;
      if (!S) return;
      const R = Math.max(S.w, S.h) * 0.35;
      for (let i = 0; i < S.n; i++) {
        const dx = S.pos[i * 2] - x;
        const dy = S.pos[i * 2 + 1] - y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < R) {
          const f = s * (1 - d / R);
          S.vel[i * 2] += (dx / d) * f;
          S.vel[i * 2 + 1] += (dy / d) * f;
        }
      }
    };
    shockRef.current = shock;
    const step = () => {
      const S = sim.current;
      if (!S) return;
      const { pos, vel, rest, sa, sb, sl } = S;
      const k = 0.18;
      for (let s = 0; s < sa.length; s++) {
        const i = sa[s],
          j = sb[s];
        const dx = pos[j * 2] - pos[i * 2];
        const dy = pos[j * 2 + 1] - pos[i * 2 + 1];
        const d = Math.hypot(dx, dy) || 1;
        const f = ((d - sl[s]) * k) / d;
        vel[i * 2] += dx * f;
        vel[i * 2 + 1] += dy * f;
        vel[j * 2] -= dx * f;
        vel[j * 2 + 1] -= dy * f;
      }
      const ret = params.current.stiff;
      const damping = params.current.damp;
      for (let i = 0; i < S.n * 2; i++) {
        vel[i] = (vel[i] + (rest[i] - pos[i]) * ret) * damping;
        pos[i] += vel[i];
      }
    };
    const draw = () => {
      const S = sim.current;
      if (!S) return;
      const { pos, sa, sb, sl, dpr, w, h } = S;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // bucket links by strain → four grey levels
      const buckets: number[][] = [[], [], [], []];
      for (let s = 0; s < sa.length; s++) {
        const i = sa[s],
          j = sb[s];
        const d = Math.hypot(pos[j * 2] - pos[i * 2], pos[j * 2 + 1] - pos[i * 2 + 1]);
        const strain = Math.abs(d - sl[s]) / sl[s];
        buckets[Math.min(3, Math.floor(strain * 22))].push(s);
      }
      const greys = ['#2c2c2c', '#6a6a6a', '#b0b0b0', '#f5f5f5'];
      buckets.forEach((list, bi) => {
        if (!list.length) return;
        ctx.beginPath();
        for (const s of list) {
          const i = sa[s],
            j = sb[s];
          ctx.moveTo(pos[i * 2], pos[i * 2 + 1]);
          ctx.lineTo(pos[j * 2], pos[j * 2 + 1]);
        }
        ctx.strokeStyle = greys[bi];
        ctx.lineWidth = bi === 3 ? 1.4 : 1;
        ctx.stroke();
      });
      ctx.fillStyle = '#8a8a8a';
      for (let i = 0; i < S.n; i++) ctx.fillRect(pos[i * 2] - 1, pos[i * 2 + 1] - 1, 2, 2);
      // tween vs spring track
      const ty = h - 22;
      const x0 = 70,
        x1 = w - 16;
      ctx.strokeStyle = '#2c2c2c';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x1, ty);
      ctx.moveTo(x0, ty + 12);
      ctx.lineTo(x1, ty + 12);
      ctx.stroke();
      ctx.setLineDash([]);
      const r = race.current;
      // map -0.15..OVER onto the track, so overshoot (back, elastic, a loose spring) never leaves the panel
      const lo = -0.15;
      const xOf = (v: number) => x0 + ((Math.min(OVER, Math.max(lo, v)) - lo) / (OVER - lo)) * (x1 - x0 - 10);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(Math.round(xOf(0) + 5), ty - 8, 1, 28);
      ctx.fillRect(Math.round(xOf(1) + 5), ty - 8, 1, 28);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(xOf(r.tween), ty - 5, 10, 10);
      ctx.strokeStyle = '#f5f5f5';
      ctx.strokeRect(xOf(r.spring) + 0.5, ty + 7.5, 9, 9);
    };
    drawRef.current = draw;
    const still = () => {
      // composed still: one frozen ripple (re-made after every rebuild, or a resize would flatten it)
      const S = sim.current!;
      shock(S.w * 0.62, (S.h - 34) * 0.45, 5);
      for (let i = 0; i < 16; i++) step();
      race.current.tween = 0.62;
      race.current.spring = 0.7;
    };
    build();
    if (reduced) still();
    draw();
    const ro = new ResizeObserver(() => {
      build();
      if (reduced) still();
      draw();
    });
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    let nextShock = 0.6;
    let clock = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      if (clock > nextShock) {
        const S = sim.current!;
        shock(S.w * (0.25 + Math.random() * 0.5), (S.h - 34) * (0.3 + Math.random() * 0.4), 4.5);
        nextShock = clock + 2.4;
      }
      // tween vs spring: same target, two ways of getting there
      const r = race.current;
      const period = 1.8;
      const phase = (clock % (period * 2)) / period;
      const dir = phase < 1 ? 1 : 0;
      const local = phase < 1 ? phase : phase - 1;
      const fn = gsap.parseEase(EASES[params.current.ease]);
      r.tween = dir ? fn(Math.min(1, local / 0.8)) : 1 - fn(Math.min(1, local / 0.8));
      r.target = dir;
      const kk = params.current.stiff * 30;
      r.sv = (r.sv + (r.target - r.spring) * kk) * (params.current.damp - 0.04);
      r.spring += r.sv;
      step();
      draw();
      raf = requestAnimationFrame(tick);
    };
    if (active && !reduced) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, reduced]);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const b = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div
        ref={wrap}
        className="relative min-h-0 flex-1 cursor-crosshair touch-pan-y"
        onPointerDown={(e) => {
          if (reduced) return;
          const p = local(e);
          drag.current = p;
          shockRef.current(p.x, p.y, 6);
        }}
        onPointerMove={(e) => {
          if (!drag.current || reduced) return;
          const p = local(e);
          const d = Math.hypot(p.x - drag.current.x, p.y - drag.current.y);
          if (d > 14) {
            shockRef.current(p.x, p.y, Math.min(6, d * 0.12));
            drag.current = p;
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <canvas ref={cvs} className="absolute inset-0 h-full w-full" aria-label="Spring mesh: drag to send a shockwave" />
        <p className="pixel pointer-events-none absolute bottom-[26px] left-2 text-[16px] leading-[16px] text-[var(--v-dim)]">tween</p>
        <p className="pixel pointer-events-none absolute bottom-[10px] left-2 text-[16px] leading-[16px] text-[var(--v-dim)]">spring</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-4 gap-y-1 border-t border-[var(--v-line)] px-2 py-1">
        <Slider label="stiff" value={stiff} min={0.0005} max={0.012} step={0.0005} onChange={setStiff} fmt={(v) => v.toFixed(3).slice(1)} />
        <Slider label="damp" value={damp} min={0.9} max={0.995} step={0.001} onChange={setDamp} fmt={(v) => v.toFixed(3).slice(1)} />
      </div>
    </div>
  );
}

/* ───────────── 04 proximity + filings ───────────── */

function Proximity({ ease, active, reduced }: { ease: number; active: boolean; reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cross = useRef<HTMLSpanElement>(null);
  const [radius, setRadius] = useState(140);
  const [maxScale, setMaxScale] = useState(1.9);
  const [dur, setDur] = useState(0.6);
  const params = useRef({ radius, maxScale, dur, ease });
  params.current = { radius, maxScale, dur, ease };
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const pointer = useRef({ x: 0, y: 0, real: false, lastReal: -10 });

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lines = useMemo(() => {
    const gap = 22;
    const out: { x: number; y: number }[] = [];
    if (!dims.w) return out;
    const cols = Math.floor(dims.w / gap);
    const rows = Math.floor(dims.h / gap);
    const ox = (dims.w - (cols - 1) * gap) / 2;
    const oy = (dims.h - (rows - 1) * gap) / 2;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push({ x: ox + x * gap, y: oy + y * gap });
    return out;
  }, [dims]);

  // fit the grid to the box: as many columns as the width takes (max 6), as many rows as the height takes (max 3)
  const colsFit = Math.max(1, Math.min(6, Math.floor((dims.w - 16 + TILE_GAP) / (TILE_W + TILE_GAP))));
  const rowsFit = Math.max(1, Math.min(3, Math.floor((dims.h - 12 + TILE_GAP) / (TILE_H + TILE_GAP))));
  const tileCount = Math.min(TILES.length, colsFit * rowsFit);
  const cols = Math.min(colsFit, tileCount);

  useEffect(() => {
    const el = wrap.current;
    const s = svg.current;
    if (!el || !s || !dims.w) return;
    const tiles = [...el.querySelectorAll<HTMLElement>('[data-tile]')];
    const lineEls = [...s.querySelectorAll<SVGLineElement>('line')];
    const rot = lineEls.map(() => 0);
    const qt = lineEls.map((l) => gsap.quickTo(l, 'rotation', { duration: 0.5, ease: 'power3.out' }));
    lineEls.forEach((l) => gsap.set(l, { transformOrigin: '50% 50%' }));
    const lastTarget = tiles.map(() => 1);
    // untransformed centres (offset geometry), so a swollen tile does not move its own target
    const centers = () => tiles.map((t) => ({ x: t.offsetLeft + t.offsetWidth / 2, y: t.offsetTop + t.offsetHeight / 2 }));
    let cs = centers();

    const apply = (px: number, py: number, instant: boolean) => {
      const { radius: R, maxScale: slider, dur: D, ease: E } = params.current;
      // a one-row grid in a short box (phone): cap the swell so a tile never grows past the box
      const M = Math.min(slider, Math.max(1.1, (dims.h - 6) / TILE_H));
      tiles.forEach((t, i) => {
        const d = Math.hypot(px - cs[i].x, py - cs[i].y);
        const k = gsap.utils.clamp(0, 1, gsap.utils.mapRange(R, 0, 0, 1, d));
        const target = 1 + k * (M - 1);
        if (Math.abs(target - lastTarget[i]) < 0.015 && !instant) return;
        lastTarget[i] = target;
        if (instant) gsap.set(t, { scale: target, zIndex: Math.round(k * 10) });
        else gsap.to(t, { scale: target, zIndex: Math.round(k * 10), duration: D, ease: EASES[E], overwrite: true });
      });
      lineEls.forEach((l, i) => {
        const p = lines[i];
        if (!p) return;
        let a = (Math.atan2(py - p.y, px - p.x) * 180) / Math.PI;
        // dashes are symmetric: pick the equivalent angle nearest the current one
        while (a - rot[i] > 90) a -= 180;
        while (a - rot[i] < -90) a += 180;
        rot[i] = a;
        if (instant) gsap.set(l, { rotation: a });
        else qt[i](a);
      });
      if (cross.current) cross.current.style.transform = `translate(${px - 8}px, ${py - 8}px)`;
    };

    const onMove = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      pointer.current.x = e.clientX - b.left;
      pointer.current.y = e.clientY - b.top;
      pointer.current.real = true;
      pointer.current.lastReal = performance.now();
    };
    const onLeave = () => (pointer.current.real = false);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    if (reduced) {
      apply(dims.w * 0.38, dims.h * 0.42, true);
      return () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
      };
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const idle = !pointer.current.real || now - pointer.current.lastReal > 2500;
      const px = idle ? dims.w * (0.5 + 0.36 * Math.sin(t * 0.7)) : pointer.current.x;
      const py = idle ? dims.h * (0.5 + 0.3 * Math.sin(t * 1.13 + 0.8)) : pointer.current.y;
      apply(px, py, false);
      raf = requestAnimationFrame(tick);
    };
    const onResize = () => (cs = centers());
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    if (active) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      gsap.killTweensOf(tiles);
    };
  }, [active, reduced, dims, lines, tileCount, cols]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden">
        <svg ref={svg} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {lines.map((p, i) => (
            <line key={i} x1={p.x - 5} x2={p.x + 5} y1={p.y} y2={p.y} stroke="#2c2c2c" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>
        <div
          className="absolute inset-0 grid place-content-center"
          style={{ gridTemplateColumns: `repeat(${cols}, ${TILE_W}px)`, gridAutoRows: `${TILE_H}px`, gap: TILE_GAP }}
        >
          {dims.w > 0 &&
            TILES.slice(0, tileCount).map((t) => (
              <div
                key={t.id}
                data-tile
                title={t.name}
                className="relative flex flex-col items-center justify-center gap-1 border border-[var(--v-steel)] bg-[var(--v-surface)] text-[var(--v-ink)]"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
                  {t.glyph}
                </svg>
                <span className="pixel text-[16px] leading-[16px] whitespace-nowrap">{t.name}</span>
              </div>
            ))}
        </div>
        <span ref={cross} className="pixel pointer-events-none absolute top-0 left-0 text-[16px] leading-[16px] text-[var(--v-soft)]" aria-hidden>
          +
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-4 gap-y-1 border-t border-[var(--v-line)] px-2 py-1">
        <Slider label="radius" value={radius} min={40} max={260} step={10} onChange={setRadius} />
        <Slider label="max" value={maxScale} min={1.1} max={2.6} step={0.1} onChange={setMaxScale} fmt={(v) => v.toFixed(1)} />
        <Slider label="dur" value={dur} min={0.1} max={1.5} step={0.05} onChange={setDur} fmt={(v) => v.toFixed(2)} />
      </div>
    </div>
  );
}

/* ───────────── root ───────────── */

export default function EasingLab({ active, reducedMotion, progress }: ExperienceProps) {
  const host = useRef<HTMLDivElement>(null);
  const [ease, setEase] = useState(2);
  const [time, setTime] = useState(0.62);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onTime = useCallback((p: number) => setTime(p), []);

  const mode = sz.w >= 760 && sz.h >= 460 ? 'grid' : sz.w < 760 && sz.h >= 640 ? 'stack' : 'compact';
  const narrow = sz.w < 460;
  // phone portrait: four panels in one column. The eases get a fixed, tight row; the rest share the height,
  // weighted so the proximity grid keeps a full row of tiles above its three sliders.
  const tight = mode === 'stack' && sz.h < 780;
  const readout = (
    <span className="min-w-0 truncate text-[var(--v-soft)]">
      ease: <span className="text-[var(--v-ink)]">&apos;{EASES[ease]}&apos;</span>
    </span>
  );

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[var(--v-bg)] text-[var(--v-ink)]">
      <Corner title="Easing Lab" tools={TOOLS} />
      {sz.w > 0 && (
        <div
          className="absolute inset-x-2 top-[52px] bottom-2 grid gap-2 sm:inset-x-3 sm:bottom-3"
          style={
            mode === 'grid'
              ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)' }
              : mode === 'stack'
                ? {
                    gridTemplateColumns: '1fr',
                    gridTemplateRows: tight
                      ? '156px minmax(0,1fr) minmax(0,1.35fr) minmax(0,1.6fr)'
                      : 'minmax(0,1.2fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,1.2fr)',
                  }
                : narrow
                  ? { gridTemplateColumns: '1fr', gridTemplateRows: 'minmax(0,1fr) minmax(0,0.55fr)' }
                  : { gridTemplateColumns: '1.1fr 1fr', gridTemplateRows: 'minmax(0,1fr)' }
          }
        >
          <Panel title="01 six eases" right={<span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">1.6s</span>}>
            <Race ease={ease} setEase={setEase} active={active} reduced={reducedMotion} progress={progress} onTime={onTime} small={tight} />
          </Panel>
          <Panel title="02 the curve" right={readout}>
            <Curve ease={ease} time={time} />
          </Panel>
          {(mode === 'grid' || mode === 'stack') && (
            <Panel title="03 spring vs tween" right={<span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">drag</span>}>
              <SpringMesh ease={ease} active={active} reduced={reducedMotion} />
            </Panel>
          )}
          {(mode === 'grid' || mode === 'stack') && (
            <Panel title="04 proximity" right={<span className="pixel text-[16px] leading-[16px] text-[var(--v-dim)]">hover</span>}>
              <Proximity ease={ease} active={active} reduced={reducedMotion} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
