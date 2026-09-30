'use client';

import { gsap } from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ExperienceProps } from '@/lib/experiences/types';
import { BuiltWith } from '@/components/v2/experience-frame';

/*
 * ASCII Field: a calm grid of mono glyphs that wakes up under the cursor.
 *  - field: each tick a cell mutates with chance = base + k * falloff(distance); near cells step up
 *    the ramp ' .:-=+*#%@' and leave a fading trail; the bottom edge fades out
 *  - tunnel: 16 superellipse rings with D -= speed * dt and wrap, projected onto 13px cells through a
 *    per-cell depth buffer; the pointer tilts the vanishing point
 *  - filings: an SVG grid of <line>s, each turned towards the cursor with gsap.quickTo
 * Idle for a moment and a ghost pointer takes over, so a card preview is never dead.
 */

const TOOLS = ['canvas2d', 'svg', 'css', 'gsap'];
const RAMP = ' .:-=+*#%@';
const IDLE = '·.:-+=*/\\<>01';
const MODES = ['field', 'tunnel', 'filings'] as const;
type Mode = (typeof MODES)[number];
const FONT = "16px 'Web IBM VGA 8x16', monospace";

type Pointer = { x: number; y: number; last: number };

function ghost(t: number, W: number, H: number) {
  return { x: W * (0.5 + 0.3 * Math.sin(t * 0.47)), y: H * (0.46 + 0.22 * Math.sin(t * 0.71 + 0.8)) };
}

export default function AsciiCursorField({ active, reducedMotion, progress }: ExperienceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointer = useRef<Pointer>({ x: -1, y: -1, last: -1e9 });
  const [mode, setMode] = useState<Mode>('field');
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = rootRef.current!;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pointer tracking (shared by all modes).
  useEffect(() => {
    const el = rootRef.current!;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, last: performance.now() };
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', move);
    };
  }, []);

  // Canvas modes: field + tunnel.
  useEffect(() => {
    if (mode === 'filings' || !size.w) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const W = size.w;
    const H = size.h;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const css = getComputedStyle(rootRef.current!);
    const ink = css.getPropertyValue('--v-ink').trim() || '#f5f5f5';
    const dim = css.getPropertyValue('--v-dim').trim() || '#8a8a8a';
    const bg = css.getPropertyValue('--v-bg').trim() || '#080808';

    // field grid
    const cw = 14;
    const ch = 16;
    const cols = Math.ceil(W / cw);
    const rows = Math.ceil(H / ch);
    const n = cols * rows;
    const glyph = new Uint8Array(n).map(() => Math.floor(Math.random() * IDLE.length));
    const base = new Float32Array(n).map(() => 0.14 + Math.random() * 0.2);
    const level = new Float32Array(n);
    const jitter = new Int8Array(n);

    // tunnel buffers
    const tc = 13;
    const tcols = Math.ceil(W / tc);
    const trows = Math.ceil(H / tc);
    const depth = new Float32Array(tcols * trows);
    const D = Array.from({ length: 16 }, (_, i) => (i + 1) / 16);

    let t = 0;
    const R = Math.max(70, Math.min(W, H) * 0.17);

    const pointerAt = (now: number) => {
      const p = pointer.current;
      const g = ghost(progress !== undefined ? progress * 18 : t, W, H);
      if (reducedMotion && p.last < 0) return { x: W * 0.62, y: H * 0.42 };
      const idle = (now - p.last) / 1000;
      if (p.last < 0 || idle > 3) {
        const k = p.last < 0 ? 1 : Math.min(1, (idle - 3) / 1.5);
        return { x: p.x + (g.x - p.x) * k, y: p.y + (g.y - p.y) * k };
      }
      return { x: p.x, y: p.y };
    };

    const drawField = (dt: number, px: number, py: number, still: boolean) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fadeStart = H * 0.7;
      for (let r = 0; r < rows; r++) {
        const y = r * ch + ch / 2;
        const fade = y < fadeStart ? 1 : Math.max(0, 1 - (y - fadeStart) / (H - fadeStart));
        if (fade <= 0) continue;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = c * cw + cw / 2;
          const dx = x - px;
          const dy = y - py;
          const f = Math.exp(-(dx * dx + dy * dy) / (R * R));
          level[i] = still ? f : Math.max(level[i] - dt * 0.9, f);
          const chance = 0.25 * dt + f * 14 * dt;
          if (!still && Math.random() < chance) {
            glyph[i] = Math.floor(Math.random() * IDLE.length);
            jitter[i] = Math.random() < 0.5 ? -1 : 1;
          }
          const lv = level[i];
          let chr: string;
          let a: number;
          if (lv > 0.06) {
            const k = Math.max(1, Math.min(RAMP.length - 1, Math.round(lv * (RAMP.length - 1)) + (lv < 0.9 ? jitter[i] : 0)));
            chr = RAMP[k];
            a = 0.3 + 0.7 * lv;
            ctx.fillStyle = ink;
          } else {
            chr = IDLE[glyph[i]];
            a = base[i];
            ctx.fillStyle = dim;
          }
          ctx.globalAlpha = a * fade;
          ctx.fillText(chr, x, y + 1);
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawTunnel = (dt: number, px: number, py: number) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      depth.fill(9);
      const chars = new Array<string>(tcols * trows);
      const speed = 0.16;
      for (let i = 0; i < 16; i++) {
        D[i] -= speed * dt;
        if (D[i] <= 0.04) D[i] += 1;
      }
      const tiltX = (px - W / 2) * 0.55;
      const tiltY = (py - H / 2) * 0.55;
      const rx = W * 0.5;
      const ry = H * 0.5;
      for (let i = 0; i < 16; i++) {
        const d = D[i];
        const k = 0.085 / d;
        const cx = W / 2 + tiltX * d;
        const cy = H / 2 + tiltY * d;
        const ax = rx * k;
        const ay = ry * k;
        if (ax < 4) continue;
        const bright = 1 - d;
        const ci = Math.max(1, Math.min(RAMP.length - 1, Math.round(bright * (RAMP.length - 1))));
        const plot = (x: number, y: number) => {
          const col = Math.floor(x / tc);
          const row = Math.floor(y / tc);
          if (col < 0 || row < 0 || col >= tcols || row >= trows) return;
          const j = row * tcols + col;
          if (d < depth[j]) {
            depth[j] = d;
            chars[j] = RAMP[ci];
          }
        };
        // superellipse |x/a|^4 + |y/b|^4 = 1 (a rounded rectangle), swept along x and along y so it has no gaps
        const st = tc * 0.5;
        for (let sx = -ax; sx <= ax; sx += st) {
          const y = ay * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(sx / ax), 4)), 0.25);
          plot(cx + sx, cy + y);
          plot(cx + sx, cy - y);
        }
        for (let sy = -ay; sy <= ay; sy += st) {
          const x = ax * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(sy / ay), 4)), 0.25);
          plot(cx + x, cy + sy);
          plot(cx - x, cy + sy);
        }
      }
      // rails: the four rounded corners joined from far to near, so the rings read as one tunnel
      for (let q = 0; q < 4; q++) {
        const th = Math.PI / 4 + (q * Math.PI) / 2;
        const co = Math.cos(th);
        const si = Math.sin(th);
        for (let z = 0.06; z < 1; z += 0.012) {
          const k = 0.085 / z;
          const x = W / 2 + tiltX * z + Math.sign(co) * Math.pow(Math.abs(co), 0.5) * rx * k;
          const y = H / 2 + tiltY * z + Math.sign(si) * Math.pow(Math.abs(si), 0.5) * ry * k;
          const col = Math.floor(x / tc);
          const row = Math.floor(y / tc);
          if (col < 0 || row < 0 || col >= tcols || row >= trows) continue;
          const j = row * tcols + col;
          if (depth[j] > 1.5) {
            depth[j] = 0.55 + z * 0.45;
            chars[j] = z < 0.35 ? ':' : '.';
          }
        }
      }
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      for (let j = 0; j < depth.length; j++) {
        const d = depth[j];
        if (d > 1.5) continue;
        const near = Math.min(1, (d - 0.04) / 0.08);
        ctx.globalAlpha = (0.3 + 0.7 * (1 - d)) * Math.max(0, near);
        ctx.fillText(chars[j], (j % tcols) * tc + tc / 2, Math.floor(j / tcols) * tc + tc / 2 + 1);
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      t += dt;
      const p = pointerAt(now);
      if (mode === 'field') drawField(dt, p.x, p.y, false);
      else drawTunnel(dt, p.x, p.y);
      raf = requestAnimationFrame(frame);
    };

    const still = () => {
      const p = pointerAt(performance.now());
      if (mode === 'field') drawField(0, p.x, p.y, true);
      else {
        if (progress !== undefined) D.forEach((_, i) => (D[i] = ((((i + 1) / 16 - progress * 3) % 1) + 1) % 1 || 1));
        drawTunnel(0, p.x, p.y);
      }
    };

    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      still();
      if (reducedMotion || progress !== undefined || !active || document.hidden) return;
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    };
    document.fonts.load(FONT).then(start, start);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mode, size, active, reducedMotion, progress]);

  // SVG mode: filings that turn to face the cursor.
  useEffect(() => {
    if (mode !== 'filings' || !size.w) return;
    const svg = svgRef.current!;
    const W = size.w;
    const H = size.h;
    const gap = W < 520 ? 24 : 30;
    const cols = Math.floor(W / gap);
    const rows = Math.floor(H / gap);
    const ox = (W - (cols - 1) * gap) / 2;
    const oy = (H - (rows - 1) * gap) / 2;
    const NS = 'http://www.w3.org/2000/svg';
    const ink = getComputedStyle(rootRef.current!).getPropertyValue('--v-ink').trim() || '#f5f5f5';
    const half = gap * 0.32;
    type Filing = { el: SVGLineElement; x: number; y: number; cur: number; s: { r: number; o: number }; rot: (v: number) => void; op: (v: number) => void };
    const filings: Filing[] = [];
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + c * gap;
        const y = oy + r * gap;
        const el = document.createElementNS(NS, 'line');
        el.setAttribute('x1', String(x - half));
        el.setAttribute('x2', String(x + half));
        el.setAttribute('y1', String(y));
        el.setAttribute('y2', String(y));
        el.setAttribute('stroke', ink);
        el.setAttribute('stroke-width', '2');
        el.setAttribute('stroke-linecap', 'square');
        el.setAttribute('stroke-opacity', '0.35');
        frag.appendChild(el);
        // quickTo drives a proxy; the proxy writes rotate(a x y), so each filing turns about its own centre
        const st = { r: 0, o: 0.35 };
        const apply = () => {
          el.setAttribute('transform', `rotate(${st.r.toFixed(2)} ${x} ${y})`);
          el.setAttribute('stroke-opacity', st.o.toFixed(3));
        };
        filings.push({
          el,
          x,
          y,
          cur: 0,
          s: st,
          rot: gsap.quickTo(st, 'r', { duration: 0.7, ease: 'power3.out', onUpdate: apply }),
          op: gsap.quickTo(st, 'o', { duration: 0.5, ease: 'power2.out', onUpdate: apply }),
        });
      }
    }
    svg.appendChild(frag);
    const R = Math.max(120, Math.min(W, H) * 0.35);

    const aim = (px: number, py: number, instant: boolean) => {
      for (const f of filings) {
        const deg = (Math.atan2(py - f.y, px - f.x) * 180) / Math.PI;
        // lines are symmetric: take the equivalent angle (mod 180) closest to where it is now
        const target = deg + Math.round((f.cur - deg) / 180) * 180;
        f.cur = target;
        const dist = Math.hypot(px - f.x, py - f.y);
        const o = 0.22 + 0.78 * Math.exp(-(dist * dist) / (R * R));
        if (instant) {
          f.s.r = target;
          f.s.o = o;
          f.el.setAttribute('transform', `rotate(${target.toFixed(2)} ${f.x} ${f.y})`);
          f.el.setAttribute('stroke-opacity', o.toFixed(3));
        } else {
          f.rot(target);
          f.op(o);
        }
      }
    };

    let raf = 0;
    let lastAim = 0;
    let lastPointer = { x: -1, y: -1 };
    let t = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      t += Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const p = pointer.current;
      const idle = p.last < 0 || now - p.last > 3000;
      const target = idle ? ghost(t, W, H) : p;
      const moved = Math.abs(target.x - lastPointer.x) + Math.abs(target.y - lastPointer.y) > 1;
      if (moved && now - lastAim > (idle ? 90 : 30)) {
        aim(target.x, target.y, false);
        lastAim = now;
        lastPointer = { x: target.x, y: target.y };
      }
      raf = requestAnimationFrame(frame);
    };

    if (reducedMotion || progress !== undefined) {
      const g = progress !== undefined ? ghost(progress * 18, W, H) : { x: W * 0.62, y: H * 0.42 };
      aim(g.x, g.y, true);
    } else {
      aim(W * 0.5, H * 0.5, true);
      if (active) raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      filings.forEach((f) => gsap.killTweensOf(f.s));
      svg.replaceChildren();
    };
  }, [mode, size, active, reducedMotion, progress]);

  return (
    <div ref={rootRef} className="relative h-full w-full cursor-crosshair overflow-hidden bg-v-bg select-none">
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" style={{ display: mode === 'filings' ? 'none' : 'block' }} />
      <svg
        ref={svgRef}
        aria-hidden
        className="absolute inset-0 h-full w-full"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${Math.max(1, size.w)} ${Math.max(1, size.h)}`}
        style={{ display: mode === 'filings' ? 'block' : 'none' }}
      />

      <div className="pixel pointer-events-auto absolute top-2 left-2 flex max-w-[calc(100%-16px)] flex-wrap gap-x-3 bg-v-bg/85 px-2 py-1">
        <p className="text-[16px] leading-[16px] text-v-ink">ASCII Field</p>
        <BuiltWith tools={TOOLS} />
      </div>
      <div className="pixel absolute right-2 bottom-2 flex gap-1 bg-v-bg/85 p-1 text-[16px] leading-[16px]" role="group" aria-label="mode">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`px-1 ${mode === m ? 'bg-v-ink text-v-bg' : 'text-v-soft hover:text-v-ink'}`}
          >
            [{m}]
          </button>
        ))}
      </div>
    </div>
  );
}
