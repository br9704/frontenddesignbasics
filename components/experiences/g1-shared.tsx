'use client';

/*
 * Shared bits for the g1 experiences: the corner label, pixel buttons, an ASCII scrub bar,
 * font lookups for canvas drawing, and GLSL snippets (simplex noise, bayer, hash, hsv).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { BuiltWith } from '@/components/v2/experience-frame';

/** Top bar: title + built-with on the left, controls on the right. Wraps on narrow screens.
 *  In a short stage (a card) it goes compact: controls and hint hide, the scene stays clear. */
export function G1Bar({
  title,
  tools,
  children,
  hint,
  tone = 'dark',
}: {
  title: string;
  tools: string[];
  children?: ReactNode;
  hint?: ReactNode;
  tone?: 'dark' | 'light';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.height < 380));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  const bg = tone === 'dark' ? 'bg-[#080808]/75' : 'bg-[#f5f5f5]/80';
  return (
    <>
      <div ref={ref} className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className={`pointer-events-auto max-w-[min(100%,440px)] px-2 py-1 ${bg}`}>
          <p className="pixel text-[16px] leading-[16px] text-[var(--v-ink)]">{title}</p>
          <BuiltWith tools={tools} className="mt-1" />
        </div>
        {children && !compact ? <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1">{children}</div> : null}
      </div>
      {hint && !compact ? (
        <p className="pixel pointer-events-none absolute right-3 bottom-3 z-10 bg-[#080808]/70 px-2 py-1 text-[16px] leading-[16px] text-[var(--v-soft)]">{hint}</p>
      ) : null}
    </>
  );
}

/** A small pixel-font toggle button. */
export function PixelButton({ on, onClick, children, label }: { on?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`pixel border px-2 py-1 text-[16px] leading-[16px] transition-colors ${
        on
          ? 'border-[var(--v-ink)] bg-[var(--v-ink)] text-[var(--v-bg)]'
          : 'border-[var(--v-steel)] bg-[#080808]/80 text-[var(--v-soft)] hover:border-[var(--v-soft)] hover:text-[var(--v-ink)]'
      }`}
    >
      {children}
    </button>
  );
}

/** `[████░░░░] 42%` that you can drag. Calls onScrub(0..1) while dragging, onRelease after. */
export function AsciiScrub({
  value,
  onScrub,
  onRelease,
  cells = 12,
  label = 'develop',
}: {
  value: number;
  onScrub: (v: number) => void;
  onRelease?: () => void;
  cells?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const filled = Math.round(Math.max(0, Math.min(1, value)) * cells);
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onScrub(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      className="pixel cursor-ew-resize touch-none select-none bg-[#080808]/80 px-2 py-1 text-[16px] leading-[16px] whitespace-pre text-[var(--v-ink)]"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && pick(e.clientX)}
      onPointerUp={() => onRelease?.()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onScrub(Math.min(1, value + 0.05));
        if (e.key === 'ArrowLeft') onScrub(Math.max(0, value - 0.05));
      }}
      onKeyUp={() => onRelease?.()}
    >
      {`[${'█'.repeat(filled)}${'░'.repeat(cells - filled)}] ${String(Math.round(value * 100)).padStart(3, ' ')}%`}
    </div>
  );
}

/** Resolve a CSS font variable (e.g. --font-mono) to a family list usable by canvas. */
export function cssFont(varName: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** Wait for a font to be ready (best effort, never throws). */
export async function loadFont(spec: string) {
  try {
    await document.fonts.load(spec);
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

/**
 * Inside a Canvas: when the loop is not running (reduced motion or off screen), render a few
 * frames early on so async textures land in the still, then stop.
 */
export function StillFrames({ running, deps = [] }: { running: boolean; deps?: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (running) return;
    const ids = [30, 150, 400, 900, 1600, 2400].map((ms) => window.setTimeout(() => invalidate(), ms));
    invalidate();
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, invalidate, ...deps]);
  return null;
}

/** Tracks a number in state for UI, throttled to animation frames. */
export function useRafState<T>(initial: T) {
  const [v, setV] = useState(initial);
  const pending = useRef<T | null>(null);
  const raf = useRef(0);
  const set = (next: T) => {
    pending.current = next;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (pending.current !== null) setV(pending.current);
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return [v, set] as const;
}

/* ───────────────────────── GLSL ───────────────────────── */

export const GLSL_HASH = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`;

/** Ashima 3D simplex noise, returns -1..1 */
export const GLSL_SNOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/** Ordered-dither threshold maps. cell is an integer pixel/cell coordinate. */
export const GLSL_BAYER = /* glsl */ `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float halftoneT(vec2 a) { vec2 f = fract(a / 6.0) - 0.5; return clamp(length(f) * 1.35, 0.0, 1.0); }
float thresholdMap(vec2 cell, float mode) {
  if (mode < 0.5) return bayer4(cell);
  if (mode < 1.5) return bayer8(cell);
  return halftoneT(cell);
}
`;

export const GLSL_HSV = /* glsl */ `
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;
